// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title ILendingPool
/// @notice Minimal surface the rest of the protocol needs from the ERC4626 lending pool.
interface ILendingPool {
    event Borrowed(address indexed to, uint256 amount);
    event Repaid(address indexed from, uint256 principal, uint256 interest, uint256 reserve);
    event BadDebt(uint256 amount);

    /// @notice Transfer `amount` of the underlying asset to `to`. onlyLoanManager.
    function borrow(address to, uint256 amount) external;

    /// @notice Pull `principal + interest` from the caller; `interest - reserve` stays in the pool.
    /// @dev onlyLoanManager. Caller must have approved the pool for `principal + interest`.
    function repay(uint256 principal, uint256 interest) external;

    /// @notice Write down outstanding principal on an unrecoverable default (socialized loss). onlyLoanManager.
    function recordBadDebt(uint256 amount) external;

    function currentBorrowRateBps() external view returns (uint256);

    function utilizationBps() external view returns (uint256);

    function totalBorrowed() external view returns (uint256);

    function maxWithdraw(address owner) external view returns (uint256);
}
