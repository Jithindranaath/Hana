// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title ICreditRegistry
/// @notice The public credit primitive. Any Creditcoin contract may read `getCreditLimit`.
/// @dev There are exactly TWO write paths into the registry:
///      - `recordNativeActivity`     (onlyReporter)     — activity from any owner-authorized reporter
///                                                          contract (e.g. `LoanManager`, `SpaceCreditLine`)
///      - `importAttestedHistory`    (onlyImporterASC)  — verified cross-chain snapshots
///      The liquidity-provision bonus is pull-based (score math reads the pool) and is NOT a third writer.
interface ICreditRegistry {
    enum RecordType {
        LOAN_ORIGINATED,
        PAYMENT_ON_TIME,
        PAYMENT_LATE,
        LOAN_COMPLETED,
        LOAN_DEFAULTED,
        DEBT_REPAID
    }

    struct CreditProfile {
        uint16 compositeScore; // 300..850
        uint16 repaymentScore; // 0..1000
        uint16 volumeScore; // 0..1000
        uint16 tenureScore; // 0..1000
        uint64 nativeLoansCompleted;
        uint64 nativeOnTimePayments;
        uint64 nativeLatePayments;
        uint64 nativeDefaults;
        uint128 nativeCumulativeBorrowed; // in asset units (iUSDC, 6 dp)
        uint64 importedLoansCompleted;
        uint64 importedOnTimePayments;
        uint64 importedLatePayments;
        uint64 importedDefaults;
        uint128 importedCumulativeBorrowed; // normalized 1e18 USD-equivalent units
        uint64 firstActivityTimestamp;
        uint64 importedFirstActivityTimestamp;
        uint64 lastImportNonce;
        uint64 lastUpdated;
        uint256 outstandingDebt; // asset units
        bool hasImportedHistory;
        bool bootstrapped;
    }

    /// @dev Aggregated foreign history, decoded from one `CreditSnapshot` event.
    struct ImportedSnapshot {
        uint64 loansCompleted;
        uint64 onTimePayments;
        uint64 latePayments;
        uint64 defaults;
        uint128 cumulativeBorrowedWei; // normalized 1e18 USD-equivalent units
        uint64 firstActivityTimestamp;
        uint64 snapshotNonce;
    }

    event Bootstrapped(address indexed user);
    event NativeActivity(address indexed user, RecordType indexed kind, uint256 amount);
    event HistoryImported(address indexed subject, uint64 indexed chainKey, uint64 snapshotNonce);
    event ProfileUpdated(address indexed user, uint16 composite, uint16 repayment, uint16 volume, uint16 tenure);

    function recordNativeActivity(RecordType kind, address user, uint256 amount) external;

    function importAttestedHistory(address subject, uint64 chainKey, ImportedSnapshot calldata snapshot) external;

    function getProfile(address user) external view returns (CreditProfile memory);

    function getCreditLimit(address user, address asset) external view returns (uint256);

    function getAvailableCredit(address user, address asset) external view returns (uint256);

    function importNonceOf(uint64 chainKey, address subject) external view returns (uint64);
}
