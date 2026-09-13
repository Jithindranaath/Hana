// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title ISettlementVault
/// @notice Holds merchant settlement funds under immediate, time-locked, or conditional release.
interface ISettlementVault {
    enum ReleaseType {
        IMMEDIATE,
        TIMELOCK,
        CONDITIONAL
    }

    event SettlementRegistered(
        bytes32 indexed billHash, address indexed merchant, uint256 amount, ReleaseType releaseType, uint64 releaseTime
    );
    event ConditionMet(bytes32 indexed billHash);
    event Claimed(bytes32 indexed billHash, address indexed merchant, uint256 amount);
    event Refunded(bytes32 indexed billHash, address indexed to, uint256 amount);

    /// @dev onlyLoanManager. Funds for `billHash` must already have been transferred to the vault.
    function registerSettlement(
        bytes32 billHash,
        address merchant,
        uint256 amount,
        ReleaseType releaseType,
        uint64 releaseTime
    ) external;

    /// @dev onlyLoanManager. Unlocks a CONDITIONAL settlement.
    function markConditionMet(bytes32 billHash) external;

    /// @notice Merchant (or anyone on their behalf) pulls the funds once eligible. Funds always go to the merchant.
    function claim(bytes32 billHash) external;

    /// @dev onlyLoanManager. Returns funds for a reverted/disputed origination.
    function refund(bytes32 billHash, address to) external;

    function claimable(bytes32 billHash) external view returns (bool);
}
