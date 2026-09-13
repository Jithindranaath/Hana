// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICreditRegistry} from "./interfaces/ICreditRegistry.sol";
import {ISpaceStaking} from "./interfaces/ISpaceStaking.sol";

/// @title SpaceCreditLine — reference application #2
/// @notice A DePIN credit line: a node operator with an imported cross-chain credit history draws
///         SPACE against their `CreditRegistry` limit, the draw is auto-staked on their behalf, and
///         staking yield — not outside capital — services the debt. The operator never custodies the
///         principal.
/// @dev Reads the registry through a single external call (`getCreditLimit`) and writes back through
///      the same `recordNativeActivity` path `LoanManager` uses — this contract must be authorized via
///      `CreditRegistry.setReporter(address(this), true)` before `openLine`/`repayFromYield` will work.
///      This contract never touches `LoanManager`, `LendingPool`, or `SettlementVault` — a different
///      shape of credit product served by the same primitive, nothing shared but the registry.
contract SpaceCreditLine is Ownable {
    using SafeERC20 for IERC20;

    ICreditRegistry public immutable registry;
    IERC20 public immutable space;
    ISpaceStaking public immutable staking;

    /// @notice Flat borrowing cost on the drawn line, in bps of principal, accrued per block.
    ///         Kept below the staking yield rate so yield services (and, over enough blocks, retires)
    ///         the debt without outside capital — see `MockSpaceStaking.yieldBpsPerBlock`.
    uint256 public interestBpsPerBlock = 1;

    struct CreditLine {
        uint256 principal; // SPACE drawn & staked, still outstanding
        uint256 interestOwed; // accrued borrowing interest, not yet repaid
        uint256 lastAccrualBlock;
        bool open; // true once a line has ever been drawn; stays true across full repayment until closeLine
    }
    mapping(address => CreditLine) public lines;

    event LineOpened(address indexed operator, uint256 amount, uint256 totalPrincipal);
    event YieldRepaid(address indexed operator, uint256 yieldClaimed, uint256 appliedToInterest, uint256 appliedToPrincipal, uint256 paidToOperator);
    event LineClosed(address indexed operator, uint256 totalReturned);
    event InterestRateUpdated(uint256 bpsPerBlock);

    constructor(address registry_, address space_, address staking_, address initialOwner) Ownable(initialOwner) {
        registry = ICreditRegistry(registry_);
        space = IERC20(space_);
        staking = ISpaceStaking(staking_);
    }

    // =====================================================================
    //                                actions
    // =====================================================================

    /// @notice Draw `amount` more SPACE against the caller's registry-derived credit limit and
    ///         auto-stake it. Reverts if the resulting outstanding balance would exceed the limit.
    function openLine(uint256 amount) external {
        require(amount > 0, "line: amount = 0");
        CreditLine storage l = lines[msg.sender];
        _accrueInterest(l);

        uint256 limit = registry.getCreditLimit(msg.sender, address(space));
        require(l.principal + l.interestOwed + amount <= limit, "line: exceeds credit limit");

        if (!l.open) l.open = true;
        l.principal += amount;

        space.forceApprove(address(staking), amount);
        staking.depositFor(msg.sender, amount);

        registry.recordNativeActivity(ICreditRegistry.RecordType.LOAN_ORIGINATED, msg.sender, amount);
        emit LineOpened(msg.sender, amount, l.principal);
    }

    /// @notice Claim the caller's accrued staking yield and apply it to their debt: interest first,
    ///         then principal. Any yield left over once the debt is fully repaid is paid straight to
    ///         the caller instead of sitting idle in this contract.
    function repayFromYield()
        external
        returns (uint256 claimed, uint256 appliedToInterest, uint256 appliedToPrincipal)
    {
        CreditLine storage l = lines[msg.sender];
        require(l.open, "line: not open");
        _accrueInterest(l);

        bool wasOutstanding = l.principal > 0 || l.interestOwed > 0;

        claimed = staking.claimFor(msg.sender);
        uint256 remaining = claimed;

        if (remaining > 0 && l.interestOwed > 0) {
            appliedToInterest = remaining < l.interestOwed ? remaining : l.interestOwed;
            l.interestOwed -= appliedToInterest;
            remaining -= appliedToInterest;
        }
        if (remaining > 0 && l.principal > 0) {
            appliedToPrincipal = remaining < l.principal ? remaining : l.principal;
            l.principal -= appliedToPrincipal;
            remaining -= appliedToPrincipal;
        }

        if (appliedToPrincipal > 0) {
            registry.recordNativeActivity(ICreditRegistry.RecordType.DEBT_REPAID, msg.sender, appliedToPrincipal);
        }
        if (wasOutstanding && l.principal == 0 && l.interestOwed == 0) {
            registry.recordNativeActivity(ICreditRegistry.RecordType.LOAN_COMPLETED, msg.sender, 0);
        }

        // Debt fully serviced: any leftover claimed yield goes straight to the operator.
        if (remaining > 0) {
            space.safeTransfer(msg.sender, remaining);
        }

        emit YieldRepaid(msg.sender, claimed, appliedToInterest, appliedToPrincipal, remaining);
    }

    /// @notice Unstake everything and exit. Only callable once the line carries no outstanding debt —
    ///         `repayFromYield` (or `openLine` never having been called) must bring it there first.
    function closeLine() external returns (uint256 totalReturned) {
        CreditLine storage l = lines[msg.sender];
        require(l.open, "line: not open");
        _accrueInterest(l);
        require(l.principal == 0 && l.interestOwed == 0, "line: outstanding debt");

        uint256 finalYield = staking.claimFor(msg.sender);
        uint256 staked = staking.principalOf(msg.sender);
        uint256 withdrawn = staked > 0 ? staking.withdrawFor(msg.sender, staked) : 0;

        l.open = false;
        totalReturned = finalYield + withdrawn;
        if (totalReturned > 0) {
            space.safeTransfer(msg.sender, totalReturned);
        }

        emit LineClosed(msg.sender, totalReturned);
    }

    // =====================================================================
    //                                 views
    // =====================================================================

    function getPosition(
        address account
    )
        external
        view
        returns (uint256 principal, uint256 interestOwed, uint256 stakedPrincipal, uint256 pendingYield, bool open)
    {
        CreditLine memory l = lines[account];
        principal = l.principal;
        interestOwed = l.interestOwed + _pendingInterest(l);
        stakedPrincipal = staking.principalOf(account);
        pendingYield = staking.pendingYield(account);
        open = l.open;
    }

    // =====================================================================
    //                              governance
    // =====================================================================

    function setInterestBpsPerBlock(uint256 v) external onlyOwner {
        interestBpsPerBlock = v;
        emit InterestRateUpdated(v);
    }

    /// @notice Rescue owner-seeded SPACE that was never drawn against (the credit-line reserve is
    ///         funded by plain transfers into this contract, mirroring how `LendingPool` is seeded).
    function sweepReserve(address to, uint256 amount) external onlyOwner {
        space.safeTransfer(to, amount);
    }

    // =====================================================================
    //                              internals
    // =====================================================================

    function _accrueInterest(CreditLine storage l) internal {
        if (block.number > l.lastAccrualBlock) {
            if (l.principal > 0) {
                uint256 blocksElapsed = block.number - l.lastAccrualBlock;
                l.interestOwed += (l.principal * interestBpsPerBlock * blocksElapsed) / 10_000;
            }
            l.lastAccrualBlock = block.number;
        }
    }

    function _pendingInterest(CreditLine memory l) internal view returns (uint256) {
        if (l.principal == 0 || block.number <= l.lastAccrualBlock) return 0;
        uint256 blocksElapsed = block.number - l.lastAccrualBlock;
        return (l.principal * interestBpsPerBlock * blocksElapsed) / 10_000;
    }
}
