// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISpaceStaking} from "../interfaces/ISpaceStaking.sol";

/// @title MockSpaceStaking
/// @notice Testnet stand-in for SpaceRouter node staking. Accepts SPACE deposits and accrues a fixed
///         yield per block, paid out of an owner-funded reserve on claim.
/// @dev Deliberately simple: linear per-block yield, no compounding, no slashing. If the yield reserve
///      runs dry, `claim`/`claimFor` pay out whatever is left rather than reverting — the remainder
///      stays owed and claimable once the reserve is topped up again.
contract MockSpaceStaking is ISpaceStaking, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable space;

    /// @notice Fixed yield rate, in bps of staked principal, accrued per block. Deliberately generous
    ///         (well above any real annualized rate) so yield visibly services debt within a short,
    ///         demoable number of blocks on testnet.
    uint256 public yieldBpsPerBlock = 5;

    /// @notice The single contract authorized to act on any account's behalf (the reference credit-line app).
    address public operator;

    /// @notice SPACE set aside to pay out claimed yield. Funded by the owner; see the dev note above.
    uint256 public yieldReserve;

    struct Position {
        uint256 principal;
        uint256 accruedYield;
        uint256 lastAccrualBlock;
    }
    mapping(address => Position) public positions;

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, address indexed to, uint256 amount);
    event Claimed(address indexed account, address indexed to, uint256 amount);
    event ReserveFunded(address indexed from, uint256 amount);
    event OperatorUpdated(address operator);
    event YieldRateUpdated(uint256 bpsPerBlock);

    modifier onlyOperator() {
        require(msg.sender == operator, "staking: not operator");
        _;
    }

    constructor(address space_, address initialOwner) Ownable(initialOwner) {
        space = IERC20(space_);
    }

    // =====================================================================
    //                              governance
    // =====================================================================
    function setOperator(address v) external onlyOwner {
        operator = v;
        emit OperatorUpdated(v);
    }

    function setYieldBpsPerBlock(uint256 v) external onlyOwner {
        yieldBpsPerBlock = v;
        emit YieldRateUpdated(v);
    }

    /// @notice Top up the reserve that pays out claimed yield. Callable by anyone; typically the owner.
    function fundReserve(uint256 amount) external {
        space.safeTransferFrom(msg.sender, address(this), amount);
        yieldReserve += amount;
        emit ReserveFunded(msg.sender, amount);
    }

    // =====================================================================
    //                    self-service (stake for yourself)
    // =====================================================================
    function deposit(uint256 amount) external {
        _deposit(msg.sender, msg.sender, amount);
    }

    function withdraw(uint256 amount) external returns (uint256) {
        return _withdraw(msg.sender, msg.sender, amount);
    }

    function claim() external returns (uint256) {
        return _claim(msg.sender, msg.sender);
    }

    // =====================================================================
    //              operator-mediated (SpaceCreditLine, on a user's behalf)
    // =====================================================================
    /// @dev Pulls `amount` SPACE from the operator (the credit line's own reserve), not from `account` —
    ///      the whole point is that the account holder never fronts capital.
    function depositFor(address account, uint256 amount) external onlyOperator {
        _deposit(account, msg.sender, amount);
    }

    /// @dev Pays out to the operator (`msg.sender`), never directly to `account`, so the operator can
    ///      net the withdrawal against any outstanding debt before forwarding a surplus.
    function withdrawFor(address account, uint256 amount) external onlyOperator returns (uint256) {
        return _withdraw(account, msg.sender, amount);
    }

    /// @dev Pays claimed yield to the operator so it can apply it to debt before forwarding a surplus.
    function claimFor(address account) external onlyOperator returns (uint256) {
        return _claim(account, msg.sender);
    }

    // =====================================================================
    //                                views
    // =====================================================================
    function principalOf(address account) external view returns (uint256) {
        return positions[account].principal;
    }

    function pendingYield(address account) external view returns (uint256) {
        Position memory p = positions[account];
        return p.accruedYield + _accrual(p);
    }

    // =====================================================================
    //                              internals
    // =====================================================================
    function _accrual(Position memory p) internal view returns (uint256) {
        if (p.principal == 0 || block.number <= p.lastAccrualBlock) return 0;
        uint256 blocksElapsed = block.number - p.lastAccrualBlock;
        return (p.principal * yieldBpsPerBlock * blocksElapsed) / 10_000;
    }

    function _accrue(address account) internal {
        Position storage p = positions[account];
        p.accruedYield += _accrual(p);
        p.lastAccrualBlock = block.number;
    }

    function _deposit(address account, address payer, uint256 amount) internal {
        require(amount > 0, "staking: amount = 0");
        _accrue(account);
        space.safeTransferFrom(payer, address(this), amount);
        positions[account].principal += amount;
        emit Deposited(account, amount);
    }

    function _withdraw(address account, address to, uint256 amount) internal returns (uint256) {
        require(amount > 0, "staking: amount = 0");
        _accrue(account);
        Position storage p = positions[account];
        require(amount <= p.principal, "staking: amount > principal");
        p.principal -= amount;
        space.safeTransfer(to, amount);
        emit Withdrawn(account, to, amount);
        return amount;
    }

    function _claim(address account, address to) internal returns (uint256 paid) {
        _accrue(account);
        Position storage p = positions[account];
        paid = p.accruedYield > yieldReserve ? yieldReserve : p.accruedYield;
        if (paid > 0) {
            p.accruedYield -= paid;
            yieldReserve -= paid;
            space.safeTransfer(to, paid);
        }
        emit Claimed(account, to, paid);
    }
}
