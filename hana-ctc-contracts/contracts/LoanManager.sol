// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ILoanManager} from "./interfaces/ILoanManager.sol";
import {ICreditRegistry} from "./interfaces/ICreditRegistry.sol";
import {ILendingPool} from "./interfaces/ILendingPool.sol";
import {ISettlementVault} from "./interfaces/ISettlementVault.sol";
import {IPenguinSwapRouter} from "./interfaces/IPenguinSwapRouter.sol";

/// @title LoanManager
/// @notice Originates, services, completes and liquidates loans across all four loan types.
/// @dev INSTALLMENT interest is fixed at origination and amortized into equal payments.
///      REVOLVING / TERM / OVERCOLLATERALIZED accrue interest on the outstanding balance over time.
contract LoanManager is ILoanManager, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;
    uint256 private constant YEAR = 365 days;

    ICreditRegistry public immutable registry;
    ILendingPool public immutable pool;
    ISettlementVault public immutable vault;
    IERC20 public immutable asset;

    // ---- governable servicing parameters ----------------------------------
    uint64 public gracePeriod = 3 days;
    uint64 public defaultWindow = 14 days;
    uint256 public lateFeeBps = 500; // 5% of the installment
    uint256 public keeperIncentive = 5 * 1e6; // flat, paid from seized collateral surplus
    uint256 public collateralRatioBps = 15_000; // 150% for OVERCOLLATERALIZED
    uint64 public revolvingReviewPeriod = 30 days;

    // ---- liquidation swap route --------------------------------------------
    /// @notice PenguinSwap-shaped router used to convert non-asset collateral to `asset` on
    ///         liquidation. Owner-settable so the real mainnet PenguinSwap address drops in with no
    ///         redeployment; unset on testnet until wired, at which point same-asset collateral still
    ///         liquidates fine without it.
    IPenguinSwapRouter public swapRouter;
    /// @notice Governable ceiling on acceptable slippage for a collateral swap, in bps of the router's
    ///         own spot quote. Enforced in addition to (not instead of) the caller's `minAmountOut`.
    uint256 public maxSlippageBps = 500; // 5%

    struct Loan {
        address borrower;
        LoanType loanType;
        LoanStatus status;
        uint256 principal;
        uint256 outstandingPrincipal;
        uint256 outstandingInterest;
        uint256 aprBps; // snapshotted at origination
        uint256 termDays;
        uint32 installmentCount;
        uint32 installmentsPaid;
        uint256 amountPerInstallment; // INSTALLMENT only
        uint64 startDate;
        uint64 nextDueDate;
        uint64 maturityDate;
        uint64 lastAccrual;
        uint256 creditLine; // REVOLVING only
        address collateralAsset;
        uint256 collateralAmount;
        bytes32 billHash;
        address merchant;
    }

    uint256 public nextLoanId = 1;
    mapping(uint256 => Loan) public loans;
    mapping(address => uint256[]) private _userLoans;

    event ServicingParamsUpdated();
    event SwapRouterUpdated(address router);
    event MaxSlippageUpdated(uint256 bps);
    event CollateralSwapped(uint256 indexed loanId, address collateralAsset, uint256 amountIn, uint256 amountOut);

    constructor(
        ICreditRegistry registry_,
        ILendingPool pool_,
        ISettlementVault vault_,
        IERC20 asset_,
        address initialOwner
    ) Ownable(initialOwner) {
        registry = registry_;
        pool = pool_;
        vault = vault_;
        asset = asset_;
    }

    // =====================================================================
    //                            origination
    // =====================================================================
    function originate(OriginateParams calldata p) external nonReentrant returns (uint256 loanId) {
        require(p.principal > 0, "lm: principal=0");
        uint256 aprBps = pool.currentBorrowRateBps();

        if (p.loanType == LoanType.OVERCOLLATERALIZED) {
            require(p.collateralAsset != address(0), "lm: collateral asset=0");
            uint256 minCollateral = (p.principal * collateralRatioBps) / BPS;
            require(p.collateralAmount >= minCollateral, "lm: undercollateralized");
            IERC20(p.collateralAsset).safeTransferFrom(msg.sender, address(this), p.collateralAmount);
        } else {
            uint256 available = registry.getAvailableCredit(msg.sender, address(asset));
            require(p.principal <= available, "lm: exceeds credit limit");
        }

        loanId = nextLoanId++;
        Loan storage l = loans[loanId];
        l.borrower = msg.sender;
        l.loanType = p.loanType;
        l.status = LoanStatus.ACTIVE;
        l.principal = p.principal;
        l.outstandingPrincipal = p.principal;
        l.aprBps = aprBps;
        l.termDays = p.termDays;
        l.startDate = uint64(block.timestamp);
        l.lastAccrual = uint64(block.timestamp);
        l.billHash = p.billHash;
        l.merchant = p.merchant;
        l.collateralAsset = p.collateralAsset;
        l.collateralAmount = p.collateralAmount;

        // -- disburse --------------------------------------------------------
        if (p.billHash != bytes32(0)) {
            require(p.merchant != address(0), "lm: merchant=0");
            pool.borrow(address(this), p.principal);
            asset.safeTransfer(address(vault), p.principal);
            vault.registerSettlement(p.billHash, p.merchant, p.principal, p.releaseType, p.releaseTime);
        } else {
            pool.borrow(msg.sender, p.principal);
        }

        // -- schedule -------------------------------------------------------
        if (p.loanType == LoanType.INSTALLMENT) {
            require(p.installmentCount >= 1, "lm: installments=0");
            require(p.termDays >= p.installmentCount, "lm: term too short");
            uint256 totalInterest = (p.principal * aprBps * p.termDays) / (365 * BPS);
            l.outstandingInterest = totalInterest;
            l.installmentCount = p.installmentCount;
            uint256 totalOwed = p.principal + totalInterest;
            l.amountPerInstallment = (totalOwed + p.installmentCount - 1) / p.installmentCount; // ceil
            l.nextDueDate = uint64(block.timestamp) + _interval(p.termDays, p.installmentCount);
        } else if (p.loanType == LoanType.TERM || p.loanType == LoanType.OVERCOLLATERALIZED) {
            require(p.termDays >= 1, "lm: term=0");
            l.installmentCount = 1;
            l.maturityDate = uint64(block.timestamp + p.termDays * 1 days);
            l.nextDueDate = l.maturityDate;
        } else {
            // REVOLVING
            l.creditLine = registry.getCreditLimit(msg.sender, address(asset));
            require(p.principal <= l.creditLine, "lm: exceeds line");
            l.nextDueDate = uint64(block.timestamp) + revolvingReviewPeriod;
        }

        registry.recordNativeActivity(
            ICreditRegistry.RecordType.LOAN_ORIGINATED,
            msg.sender,
            address(asset),
            p.principal
        );
        _userLoans[msg.sender].push(loanId);
        emit LoanOriginated(loanId, msg.sender, p.loanType, p.principal, aprBps, p.billHash);
    }

    // =====================================================================
    //                            servicing
    // =====================================================================
    function makePayment(uint256 loanId, uint256 amount) external nonReentrant {
        Loan storage l = loans[loanId];
        require(l.status == LoanStatus.ACTIVE, "lm: not active");
        require(amount > 0, "lm: amount=0");
        _accrue(l);

        bool late = l.nextDueDate != 0 && block.timestamp > uint256(l.nextDueDate) + gracePeriod;
        if (late && l.loanType == LoanType.INSTALLMENT) {
            l.outstandingInterest += (l.amountPerInstallment * lateFeeBps) / BPS;
        }

        asset.safeTransferFrom(msg.sender, address(this), amount);

        // interest first, then principal
        uint256 toInterest = amount >= l.outstandingInterest ? l.outstandingInterest : amount;
        l.outstandingInterest -= toInterest;
        uint256 toPrincipal = amount - toInterest;
        if (toPrincipal > l.outstandingPrincipal) {
            uint256 refundAmt = toPrincipal - l.outstandingPrincipal;
            toPrincipal = l.outstandingPrincipal;
            asset.safeTransfer(msg.sender, refundAmt);
        }
        l.outstandingPrincipal -= toPrincipal;

        asset.forceApprove(address(pool), toPrincipal + toInterest);
        pool.repay(toPrincipal, toInterest);
        if (toPrincipal > 0) {
            registry.recordNativeActivity(
                ICreditRegistry.RecordType.DEBT_REPAID,
                l.borrower,
                address(asset),
                toPrincipal
            );
        }

        if (l.loanType == LoanType.INSTALLMENT) {
            l.installmentsPaid += 1;
            registry.recordNativeActivity(
                late
                    ? ICreditRegistry.RecordType.PAYMENT_LATE
                    : ICreditRegistry.RecordType.PAYMENT_ON_TIME,
                l.borrower,
                address(asset),
                0
            );
            l.nextDueDate += _interval(l.termDays, l.installmentCount);
        }

        // A merchant bill under CONDITIONAL release unlocks once the borrower has committed (first payment).
        if (l.billHash != bytes32(0) && (l.installmentsPaid >= 1 || l.loanType != LoanType.INSTALLMENT)) {
            try vault.markConditionMet(l.billHash) {} catch {}
        }

        emit PaymentMade(loanId, msg.sender, toPrincipal, toInterest, late);

        if (l.outstandingPrincipal == 0 && l.outstandingInterest == 0) {
            _complete(l, loanId);
        }
    }

    function draw(uint256 loanId, uint256 amount) external nonReentrant {
        Loan storage l = loans[loanId];
        require(l.status == LoanStatus.ACTIVE, "lm: not active");
        require(l.loanType == LoanType.REVOLVING, "lm: not revolving");
        require(msg.sender == l.borrower, "lm: not borrower");
        require(amount > 0, "lm: amount=0");
        _accrue(l);
        require(l.outstandingPrincipal + amount <= l.creditLine, "lm: exceeds line");

        l.outstandingPrincipal += amount;
        pool.borrow(l.borrower, amount);
        registry.recordNativeActivity(
            ICreditRegistry.RecordType.LOAN_ORIGINATED,
            l.borrower,
            address(asset),
            amount
        );
        emit Drawn(loanId, amount);
    }

    // =====================================================================
    //                           liquidation
    // =====================================================================
    function liquidate(uint256 loanId, uint256 minAmountOut) external nonReentrant {
        Loan storage l = loans[loanId];
        require(l.status == LoanStatus.ACTIVE, "lm: not active");

        uint64 dueRef = l.loanType == LoanType.INSTALLMENT
            ? l.nextDueDate
            : (l.maturityDate != 0 ? l.maturityDate : l.nextDueDate);
        require(
            dueRef != 0 && block.timestamp > uint256(dueRef) + gracePeriod + defaultWindow,
            "lm: not defaultable"
        );

        _accrue(l);
        uint256 owedPrincipal = l.outstandingPrincipal;
        uint256 owed = owedPrincipal + l.outstandingInterest;

        registry.recordNativeActivity(
            ICreditRegistry.RecordType.LOAN_DEFAULTED,
            l.borrower,
            address(asset),
            owedPrincipal
        );

        if (l.loanType == LoanType.OVERCOLLATERALIZED && l.collateralAmount > 0) {
            l.status = LoanStatus.LIQUIDATED;
            uint256 collateral = l.collateralAmount;
            address collateralAsset = l.collateralAsset;
            l.collateralAmount = 0;

            // Same-asset collateral needs no swap; otherwise route it through PenguinSwap. Either way
            // `proceeds` ends up denominated in `asset`, and the settlement math below is identical.
            uint256 proceeds = collateralAsset == address(asset)
                ? collateral
                : _swapCollateral(loanId, collateralAsset, collateral, minAmountOut);

            uint256 repayAmt = proceeds >= owed ? owed : proceeds;
            uint256 principalPart = repayAmt >= owedPrincipal ? owedPrincipal : repayAmt;
            uint256 interestPart = repayAmt - principalPart;
            asset.forceApprove(address(pool), repayAmt);
            pool.repay(principalPart, interestPart);
            if (principalPart < owedPrincipal) {
                pool.recordBadDebt(owedPrincipal - principalPart);
            }

            uint256 leftover = proceeds - repayAmt;
            uint256 fee = leftover >= keeperIncentive ? keeperIncentive : leftover;
            if (fee > 0) asset.safeTransfer(msg.sender, fee);
            if (leftover - fee > 0) asset.safeTransfer(l.borrower, leftover - fee);
        } else {
            l.status = LoanStatus.DEFAULTED;
            pool.recordBadDebt(owedPrincipal);
        }

        l.outstandingPrincipal = 0;
        l.outstandingInterest = 0;
        emit LoanLiquidated(loanId, msg.sender, owed);
    }

    /// @dev Swaps seized `collateralAsset` for `asset` via `swapRouter`. The effective slippage floor
    ///      is whichever is stricter: the caller's `minAmountOut` or the governable `maxSlippageBps`
    ///      bound applied to the router's own spot quote — so a careless or malicious keeper can't
    ///      pass an unprotective `minAmountOut` and get away with it.
    function _swapCollateral(
        uint256 loanId,
        address collateralAsset,
        uint256 amountIn,
        uint256 minAmountOut
    ) private returns (uint256 amountOut) {
        require(address(swapRouter) != address(0), "lm: swap router not set");

        address[] memory path = new address[](2);
        path[0] = collateralAsset;
        path[1] = address(asset);

        uint256[] memory quoted = swapRouter.getAmountsOut(amountIn, path);
        uint256 expectedOut = quoted[quoted.length - 1];
        uint256 floor = (expectedOut * (BPS - maxSlippageBps)) / BPS;
        uint256 effectiveMin = minAmountOut > floor ? minAmountOut : floor;

        IERC20(collateralAsset).forceApprove(address(swapRouter), amountIn);
        uint256[] memory amounts = swapRouter.swapExactTokensForTokens(
            amountIn,
            effectiveMin,
            path,
            address(this),
            block.timestamp
        );
        amountOut = amounts[amounts.length - 1];
        emit CollateralSwapped(loanId, collateralAsset, amountIn, amountOut);
    }

    // =====================================================================
    //                              views
    // =====================================================================
    function amountDue(uint256 loanId) external view returns (uint256 principal, uint256 interest) {
        Loan storage l = loans[loanId];
        principal = l.outstandingPrincipal;
        interest = l.outstandingInterest;
        if (l.loanType != LoanType.INSTALLMENT && l.outstandingPrincipal > 0) {
            interest += _pendingInterest(l);
        }
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function getUserLoans(address user) external view returns (uint256[] memory) {
        return _userLoans[user];
    }

    function nextInstallmentAmount(uint256 loanId) external view returns (uint256) {
        Loan storage l = loans[loanId];
        if (l.loanType != LoanType.INSTALLMENT) return l.outstandingPrincipal + l.outstandingInterest;
        uint256 base = l.amountPerInstallment;
        if (l.nextDueDate != 0 && block.timestamp > uint256(l.nextDueDate) + gracePeriod) {
            base += (l.amountPerInstallment * lateFeeBps) / BPS;
        }
        uint256 remaining = l.outstandingPrincipal + l.outstandingInterest;
        return base < remaining ? base : remaining;
    }

    // =====================================================================
    //                            internals
    // =====================================================================
    function _interval(uint256 termDays, uint256 installmentCount) private pure returns (uint64) {
        return uint64((termDays * 1 days) / installmentCount);
    }

    function _pendingInterest(Loan storage l) private view returns (uint256) {
        uint256 dt = block.timestamp - l.lastAccrual;
        if (dt == 0) return 0;
        return (l.outstandingPrincipal * l.aprBps * dt) / (YEAR * BPS);
    }

    function _accrue(Loan storage l) private {
        if (l.loanType == LoanType.INSTALLMENT) return; // fixed schedule
        uint256 pending = l.outstandingPrincipal == 0 ? 0 : _pendingInterest(l);
        if (pending > 0) l.outstandingInterest += pending;
        l.lastAccrual = uint64(block.timestamp);
    }

    function _complete(Loan storage l, uint256 loanId) private {
        l.status = LoanStatus.COMPLETED;
        registry.recordNativeActivity(ICreditRegistry.RecordType.LOAN_COMPLETED, l.borrower, address(asset), 0);

        if (l.collateralAmount > 0 && l.collateralAsset != address(0)) {
            uint256 c = l.collateralAmount;
            l.collateralAmount = 0;
            IERC20(l.collateralAsset).safeTransfer(l.borrower, c);
        }
        if (l.billHash != bytes32(0)) {
            try vault.markConditionMet(l.billHash) {} catch {}
        }
        emit LoanCompleted(loanId, l.borrower);
    }

    // =====================================================================
    //                            governance
    // =====================================================================
    function setServicingParams(
        uint64 gracePeriod_,
        uint64 defaultWindow_,
        uint256 lateFeeBps_,
        uint256 keeperIncentive_,
        uint256 collateralRatioBps_,
        uint64 revolvingReviewPeriod_
    ) external onlyOwner {
        require(lateFeeBps_ <= 2_000, "lm: late fee too high");
        require(collateralRatioBps_ >= 10_000, "lm: collateral < 100%");
        gracePeriod = gracePeriod_;
        defaultWindow = defaultWindow_;
        lateFeeBps = lateFeeBps_;
        keeperIncentive = keeperIncentive_;
        collateralRatioBps = collateralRatioBps_;
        revolvingReviewPeriod = revolvingReviewPeriod_;
        emit ServicingParamsUpdated();
    }

    /// @notice Point at a PenguinSwap-shaped router. The real mainnet PenguinSwap address drops in
    ///         here with no redeployment; pass `address(0)` to disable swapping (only same-asset
    ///         collateral liquidates until it's set again).
    function setSwapRouter(address v) external onlyOwner {
        swapRouter = IPenguinSwapRouter(v);
        emit SwapRouterUpdated(v);
    }

    function setMaxSlippageBps(uint256 v) external onlyOwner {
        require(v <= 2_000, "lm: slippage bound too high"); // cap at 20%, a governance footgun guard
        maxSlippageBps = v;
        emit MaxSlippageUpdated(v);
    }
}
