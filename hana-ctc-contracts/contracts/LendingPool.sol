// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626, IERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ILendingPool} from "./interfaces/ILendingPool.sol";
import {RateModel} from "./libraries/RateModel.sol";

/// @title LendingPool
/// @notice ERC4626 vault over iUSDC. LPs deposit for `ipUSDC` shares; `LoanManager` borrows and repays.
/// @dev Cash-basis accounting: interest is recognized when repaid (it lands in the pool balance and
///      lifts the share price). Undercollateralized bad debt is written down against outstanding principal,
///      lowering the share price (socialized loss).
contract LendingPool is ERC4626, Ownable, ReentrancyGuard, ILendingPool {
    using SafeERC20 for IERC20;

    address public loanManager;
    address public treasury;

    uint256 public totalPrincipalOutstanding;
    uint256 public reserveFactorBps = 1_000; // 10% of interest routed to the treasury

    RateModel.Params public rateParams =
        RateModel.Params({baseRateBps: 200, slope1Bps: 800, slope2Bps: 6_000, kinkBps: 8_000});

    event LoanManagerSet(address indexed loanManager);
    event TreasurySet(address indexed treasury);
    event RateParamsSet(uint256 baseRateBps, uint256 slope1Bps, uint256 slope2Bps, uint256 kinkBps);
    event ReserveFactorSet(uint256 reserveFactorBps);

    modifier onlyLoanManager() {
        require(msg.sender == loanManager, "pool: not loan manager");
        _;
    }

    constructor(
        IERC20 asset_,
        address initialOwner,
        address treasury_
    ) ERC20("Hana LP iUSDC", "ipUSDC") ERC4626(asset_) Ownable(initialOwner) {
        require(treasury_ != address(0), "pool: treasury=0");
        treasury = treasury_;
    }

    // ---- ERC4626 overrides --------------------------------------------------

    /// @dev Total assets = idle balance + principal out on loan. Interest is only counted once realized as cash.
    function totalAssets() public view override returns (uint256) {
        return _idle() + totalPrincipalOutstanding;
    }

    /// @dev Cap withdrawals at what the pool can actually pay out right now.
    function maxWithdraw(address owner_) public view override(ERC4626, ILendingPool) returns (uint256) {
        uint256 assetsOfOwner = _convertToAssets(balanceOf(owner_), Math.Rounding.Floor);
        uint256 idle = _idle();
        return assetsOfOwner < idle ? assetsOfOwner : idle;
    }

    function maxRedeem(address owner_) public view override returns (uint256) {
        uint256 shares = balanceOf(owner_);
        uint256 sharesForIdle = _convertToShares(_idle(), Math.Rounding.Floor);
        return shares < sharesForIdle ? shares : sharesForIdle;
    }

    // ---- borrow / repay (LoanManager only) --------------------------------

    function borrow(address to, uint256 amount) external onlyLoanManager nonReentrant {
        require(amount <= _idle(), "pool: insufficient liquidity");
        totalPrincipalOutstanding += amount;
        IERC20(asset()).safeTransfer(to, amount);
        emit Borrowed(to, amount);
    }

    function repay(uint256 principal, uint256 interest) external onlyLoanManager nonReentrant {
        IERC20 a = IERC20(asset());
        uint256 total = principal + interest;
        if (total > 0) a.safeTransferFrom(msg.sender, address(this), total);

        totalPrincipalOutstanding = principal >= totalPrincipalOutstanding
            ? 0
            : totalPrincipalOutstanding - principal;

        uint256 reserve = (interest * reserveFactorBps) / 10_000;
        if (reserve > 0) a.safeTransfer(treasury, reserve);
        emit Repaid(msg.sender, principal, interest, reserve);
    }

    function recordBadDebt(uint256 amount) external onlyLoanManager {
        totalPrincipalOutstanding = amount >= totalPrincipalOutstanding ? 0 : totalPrincipalOutstanding - amount;
        emit BadDebt(amount);
    }

    // ---- views ---------------------------------------------------------

    function utilizationBps() public view returns (uint256) {
        uint256 borrowed = totalPrincipalOutstanding;
        uint256 denom = borrowed + _idle();
        if (denom == 0) return 0;
        return (borrowed * 10_000) / denom;
    }

    function currentBorrowRateBps() external view returns (uint256) {
        return RateModel.borrowRateBps(rateParams, utilizationBps());
    }

    function totalBorrowed() external view returns (uint256) {
        return totalPrincipalOutstanding;
    }

    function _idle() internal view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    // ---- governance ---------------------------------------------------

    function setLoanManager(address v) external onlyOwner {
        require(v != address(0), "pool: lm=0");
        loanManager = v;
        emit LoanManagerSet(v);
    }

    function setTreasury(address v) external onlyOwner {
        require(v != address(0), "pool: treasury=0");
        treasury = v;
        emit TreasurySet(v);
    }

    function setReserveFactorBps(uint256 v) external onlyOwner {
        require(v <= 5_000, "pool: reserve too high");
        reserveFactorBps = v;
        emit ReserveFactorSet(v);
    }

    function setRateParams(
        uint256 baseRateBps,
        uint256 slope1Bps,
        uint256 slope2Bps,
        uint256 kinkBps
    ) external onlyOwner {
        require(kinkBps > 0 && kinkBps < 10_000, "pool: bad kink");
        rateParams = RateModel.Params(baseRateBps, slope1Bps, slope2Bps, kinkBps);
        emit RateParamsSet(baseRateBps, slope1Bps, slope2Bps, kinkBps);
    }
}
