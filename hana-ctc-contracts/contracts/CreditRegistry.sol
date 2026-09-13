// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICreditRegistry} from "./interfaces/ICreditRegistry.sol";
import {ILendingPool} from "./interfaces/ILendingPool.sol";
import {ScoreModel} from "./libraries/ScoreModel.sol";

/// @title CreditRegistry
/// @notice The reusable, multi-dimensional credit primitive for Creditcoin.
/// @dev Two write paths only: `recordNativeActivity` (onlyReporter, an owner-managed allowlist of
///      native-activity reporters — e.g. `LoanManager`, `SpaceCreditLine`) and
///      `importAttestedHistory` (onlyImporterASC). Read `getCreditLimit` from anywhere.
contract CreditRegistry is ICreditRegistry, Ownable {
    // ---- wiring ------------------------------------------------------------
    address public loanManager;
    address public importerASC;
    ILendingPool public lendingPool;
    /// @notice The asset whose native-activity `amount`s feed the volume sub-score
    ///         (`nativeCumulativeBorrowed`), typically iUSDC. Deliberately singular, not
    ///         per-asset: with no price oracle, there's no honest way to combine, say, iUSDC and
    ///         SPACE borrow volume into one number, so activity in any other asset contributes to
    ///         `nativeLoansCompleted`/`nativeOnTimePayments`/etc. (dimensionless, safe to share)
    ///         but not to this one. Outstanding *debt* (`assetDebt` below) is unaffected by this —
    ///         it's tracked correctly per-asset regardless.
    address public accountingAsset;

    // ---- reporters -----------------------------------------------------------
    /// @notice Contracts authorized to write native activity via `recordNativeActivity`.
    ///         Owner-managed so any number of consumer applications (BNPL's `LoanManager`,
    ///         a DePIN credit line, etc.) can report through the same interface.
    mapping(address => bool) public authorizedReporters;

    // ---- governable parameters ------------------------------------------------
    uint256 public importWeightBps = 6_000; // imported history counts as 60% of native
    ScoreModel.Weights public weights = ScoreModel.Weights({repaymentBps: 5_000, volumeBps: 2_500, tenureBps: 2_500});
    ScoreModel.LimitCurve public limitCurve = ScoreModel.LimitCurve({floorScore: 500, maxLimit: 5_000 * 1e6});
    uint256 public perAccountExposureCap = 10_000 * 1e6;

    struct AssetConfig {
        bool enabled;
        uint256 maxLimit; // overrides limitCurve.maxLimit for this asset
        uint256 exposureCap; // overrides perAccountExposureCap for this asset; 0 = use the global default
    }
    mapping(address => AssetConfig) public assetConfigs;

    // ---- state -----------------------------------------------------------
    mapping(address => CreditProfile) private _profiles;
    mapping(uint64 => mapping(address => uint64)) public importNonces; // chainKey => subject => nonce
    /// @notice Outstanding native debt, per user, per asset. Was a single field on `CreditProfile`
    ///         until a second reporter (a different-decimal asset) revealed the bug that caused:
    ///         raw amounts from an 18-dp asset and a 6-dp asset summed into one counter made the
    ///         6-dp asset's limit permanently unreachable (the 18-dp number dwarfs it). Genuinely
    ///         per-asset now — `getAvailableCredit(user, asset)` only ever nets against debt in
    ///         that same asset.
    mapping(address => mapping(address => uint256)) public assetDebt;

    // ---- events (governance) -------------------------------------------------
    event WiringUpdated(address loanManager, address importerASC, address lendingPool);
    event ReporterUpdated(address indexed reporter, bool authorized);
    event ParametersUpdated();
    event AssetConfigUpdated(address indexed asset, bool enabled, uint256 maxLimit, uint256 exposureCap);

    modifier onlyReporter() {
        require(authorizedReporters[msg.sender], "registry: not authorized reporter");
        _;
    }

    modifier onlyImporterASC() {
        require(msg.sender == importerASC, "registry: not importer");
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    // =====================================================================
    //                         WRITE PATH 1: native
    // =====================================================================
    function recordNativeActivity(
        RecordType kind,
        address user,
        address asset,
        uint256 amount
    ) external onlyReporter {
        _bootstrap(user);
        CreditProfile storage p = _profiles[user];

        if (kind == RecordType.LOAN_ORIGINATED) {
            if (asset == accountingAsset) p.nativeCumulativeBorrowed += uint128(amount);
            assetDebt[user][asset] += amount;
        } else if (kind == RecordType.PAYMENT_ON_TIME) {
            p.nativeOnTimePayments += 1;
        } else if (kind == RecordType.PAYMENT_LATE) {
            p.nativeLatePayments += 1;
        } else if (kind == RecordType.DEBT_REPAID) {
            uint256 debt = assetDebt[user][asset];
            assetDebt[user][asset] = amount >= debt ? 0 : debt - amount;
        } else if (kind == RecordType.LOAN_COMPLETED) {
            p.nativeLoansCompleted += 1;
        } else if (kind == RecordType.LOAN_DEFAULTED) {
            p.nativeDefaults += 1;
            uint256 debt = assetDebt[user][asset];
            assetDebt[user][asset] = amount >= debt ? 0 : debt - amount;
        }

        _recompute(user);
        emit NativeActivity(user, kind, asset, amount);
    }

    // =====================================================================
    //                     WRITE PATH 2: attested import
    // =====================================================================
    function importAttestedHistory(
        address subject,
        uint64 chainKey,
        ImportedSnapshot calldata s
    ) external onlyImporterASC {
        require(s.snapshotNonce > importNonces[chainKey][subject], "registry: stale nonce");
        importNonces[chainKey][subject] = s.snapshotNonce;

        _bootstrap(subject);
        CreditProfile storage p = _profiles[subject];
        p.importedLoansCompleted = s.loansCompleted;
        p.importedOnTimePayments = s.onTimePayments;
        p.importedLatePayments = s.latePayments;
        p.importedDefaults = s.defaults;
        p.importedCumulativeBorrowed = s.cumulativeBorrowedWei;
        p.importedFirstActivityTimestamp = s.firstActivityTimestamp;
        p.hasImportedHistory = true;
        p.lastImportNonce = s.snapshotNonce;

        _recompute(subject);
        emit HistoryImported(subject, chainKey, s.snapshotNonce);
    }

    // =====================================================================
    //                              reads
    // =====================================================================
    function getProfile(address user) external view returns (CreditProfile memory) {
        CreditProfile memory p = _profiles[user];
        if (!p.bootstrapped) {
            p.compositeScore = uint16(ScoreModel.SCORE_MIN);
        }
        return p;
    }

    function getCreditLimit(address user, address asset) public view returns (uint256) {
        CreditProfile storage p = _profiles[user];
        uint16 score = p.bootstrapped ? p.compositeScore : uint16(ScoreModel.SCORE_MIN);
        AssetConfig memory cfg = assetConfigs[asset];
        uint256 maxLimit = cfg.enabled ? cfg.maxLimit : limitCurve.maxLimit;
        // `perAccountExposureCap` is denominated in the default (6-dp) asset's units; an asset on a
        // different decimal scale (e.g. an 18-dp token) MUST set its own `exposureCap`, or every limit
        // for it will be clamped to a near-zero raw-unit amount.
        uint256 cap = (cfg.enabled && cfg.exposureCap > 0) ? cfg.exposureCap : perAccountExposureCap;
        uint256 gross = ScoreModel.creditLimit(score, ScoreModel.LimitCurve(limitCurve.floorScore, maxLimit));
        return gross > cap ? cap : gross;
    }

    function getAvailableCredit(address user, address asset) external view returns (uint256) {
        uint256 gross = getCreditLimit(user, asset);
        uint256 debt = assetDebt[user][asset];
        return debt >= gross ? 0 : gross - debt;
    }

    function importNonceOf(uint64 chainKey, address subject) external view returns (uint64) {
        return importNonces[chainKey][subject];
    }

    // =====================================================================
    //                            internals
    // =====================================================================
    function _bootstrap(address user) internal {
        CreditProfile storage p = _profiles[user];
        if (p.bootstrapped) return;
        p.bootstrapped = true;
        p.firstActivityTimestamp = uint64(block.timestamp);
        p.compositeScore = uint16(ScoreModel.SCORE_MIN);
        emit Bootstrapped(user);
    }

    function _recompute(address user) internal {
        CreditProfile storage p = _profiles[user];
        if (!p.bootstrapped) return;

        uint16 rep = ScoreModel.repaymentSubscore(
            p.nativeOnTimePayments,
            p.nativeLatePayments,
            p.nativeDefaults,
            p.importedOnTimePayments,
            p.importedLatePayments,
            p.importedDefaults,
            importWeightBps
        );
        uint16 vol = ScoreModel.volumeSubscore(
            uint256(p.nativeCumulativeBorrowed) * 1e12, // 6dp -> 1e18
            uint256(p.importedCumulativeBorrowed), // already 1e18
            importWeightBps
        );
        uint64 firstTs = _earliest(p.firstActivityTimestamp, p.importedFirstActivityTimestamp);
        uint16 ten = ScoreModel.tenureSubscore(firstTs, uint64(block.timestamp), _lpBonus(user));

        p.repaymentScore = rep;
        p.volumeScore = vol;
        p.tenureScore = ten;
        p.compositeScore = ScoreModel.composite(rep, vol, ten, weights);
        p.lastUpdated = uint64(block.timestamp);
        emit ProfileUpdated(user, p.compositeScore, rep, vol, ten);
    }

    function _earliest(uint64 a, uint64 b) private pure returns (uint64) {
        if (a == 0) return b;
        if (b == 0) return a;
        return a < b ? a : b;
    }

    /// @dev Pull-based liquidity-provision bonus. Never reverts scoring if the pool call fails.
    ///      Assumes a 6-dp asset for the divisor (iUSDC on testnet).
    function _lpBonus(address user) internal view returns (uint256) {
        if (address(lendingPool) == address(0)) return 0;
        try lendingPool.maxWithdraw(user) returns (uint256 assets) {
            uint256 bonus = (assets * 200) / (20_000 * 1e6);
            return bonus > 200 ? 200 : bonus;
        } catch {
            return 0;
        }
    }

    // =====================================================================
    //                            governance
    // =====================================================================
    function setWiring(address loanManager_, address importerASC_, address lendingPool_) external onlyOwner {
        loanManager = loanManager_;
        importerASC = importerASC_;
        lendingPool = ILendingPool(lendingPool_);
        emit WiringUpdated(loanManager_, importerASC_, lendingPool_);
    }

    function setLoanManager(address v) external onlyOwner {
        loanManager = v;
        emit WiringUpdated(loanManager, importerASC, address(lendingPool));
    }

    /// @notice Authorize or revoke a contract's ability to call `recordNativeActivity`.
    function setReporter(address reporter, bool authorized) external onlyOwner {
        authorizedReporters[reporter] = authorized;
        emit ReporterUpdated(reporter, authorized);
    }

    function setImporterASC(address v) external onlyOwner {
        importerASC = v;
        emit WiringUpdated(loanManager, importerASC, address(lendingPool));
    }

    function setLendingPool(address v) external onlyOwner {
        lendingPool = ILendingPool(v);
        emit WiringUpdated(loanManager, importerASC, address(lendingPool));
    }

    /// @notice Set the asset whose native volume feeds the score's volume dimension (see the
    ///         `accountingAsset` doc comment above for why this isn't per-asset).
    function setAccountingAsset(address v) external onlyOwner {
        accountingAsset = v;
        emit ParametersUpdated();
    }

    function setWeights(uint256 repaymentBps, uint256 volumeBps, uint256 tenureBps) external onlyOwner {
        require(repaymentBps + volumeBps + tenureBps == 10_000, "weights: must sum to 10000");
        weights = ScoreModel.Weights(repaymentBps, volumeBps, tenureBps);
        emit ParametersUpdated();
    }

    function setImportWeightBps(uint256 v) external onlyOwner {
        require(v < 10_000, "importWeight: must be < 10000"); // imported strictly below native
        importWeightBps = v;
        emit ParametersUpdated();
    }

    function setLimitCurve(uint256 floorScore, uint256 maxLimit) external onlyOwner {
        require(floorScore >= 300 && floorScore < 850, "limitCurve: bad floor");
        limitCurve = ScoreModel.LimitCurve(floorScore, maxLimit);
        emit ParametersUpdated();
    }

    function setPerAccountExposureCap(uint256 v) external onlyOwner {
        perAccountExposureCap = v;
        emit ParametersUpdated();
    }

    function setAssetConfig(address asset, bool enabled, uint256 maxLimit, uint256 exposureCap) external onlyOwner {
        assetConfigs[asset] = AssetConfig(enabled, maxLimit, exposureCap);
        emit AssetConfigUpdated(asset, enabled, maxLimit, exposureCap);
    }
}
