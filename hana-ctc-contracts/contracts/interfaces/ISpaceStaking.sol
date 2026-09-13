// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title ISpaceStaking
/// @notice Minimal surface `SpaceCreditLine` needs from the SpaceRouter staking stand-in.
/// @dev Positions are keyed by `account`. The self-service functions (`deposit`/`withdraw`/`claim`)
///      let an operator stake directly for themselves; the `For` functions let the single
///      owner-authorized operator contract (`SpaceCreditLine`) act on any account's behalf, with
///      funds always settling to the caller (the operator), never straight to the account, so the
///      operator can net staked SPACE and claimed yield against outstanding credit-line debt first.
interface ISpaceStaking {
    function deposit(uint256 amount) external;

    function withdraw(uint256 amount) external returns (uint256);

    function claim() external returns (uint256);

    function depositFor(address account, uint256 amount) external;

    function withdrawFor(address account, uint256 amount) external returns (uint256);

    function claimFor(address account) external returns (uint256);

    function principalOf(address account) external view returns (uint256);

    function pendingYield(address account) external view returns (uint256);
}
