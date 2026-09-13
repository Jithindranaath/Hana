// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title HanaCreditAttestor
/// @notice Source-chain (Ethereum Sepolia) contract in the Attestcoin credit-import flow. Holds a
///         per-subject "local lending history" ledger and lets anyone snapshot it into one
///         aggregated `CreditSnapshot` event — the event `CreditImporterASC` (on Creditcoin CC3)
///         verifies via the Attestcoin precompile and imports.
///
/// @dev Event shape is frozen (`hana-ctc-attestor/README.md`, `CreditImporterASC._decodeSnapshot`):
///        `CreditSnapshot(address indexed subject, uint64 loansCompleted, uint64 onTimePayments,
///         uint64 latePayments, uint64 defaults, uint128 cumulativeBorrowedWei,
///         uint64 firstActivityTimestamp, uint64 snapshotNonce)`.
///      `cumulativeBorrowedWei` is normalized to 1e18 USD-equivalent units regardless of the
///      original asset's decimals (see `hana-ctc-contracts/README.md`, "Units").
///
///      A real deployment would derive the ledger from an actual lending protocol's on-chain
///      state. For this hackathon build, `seedHistory` (owner-only) sets it directly and
///      explicitly — disclosed here and in the docs, not hidden — so demo snapshots are
///      non-trivial without needing a live lending protocol on Sepolia to originate from.
contract HanaCreditAttestor is Ownable {
    struct Ledger {
        uint64 loansCompleted;
        uint64 onTimePayments;
        uint64 latePayments;
        uint64 defaults;
        uint128 cumulativeBorrowedWei;
        uint64 firstActivityTimestamp;
        uint64 snapshotNonce;
    }

    mapping(address => Ledger) private _ledgerOf;

    event CreditSnapshot(
        address indexed subject,
        uint64 loansCompleted,
        uint64 onTimePayments,
        uint64 latePayments,
        uint64 defaults,
        uint128 cumulativeBorrowedWei,
        uint64 firstActivityTimestamp,
        uint64 snapshotNonce
    );

    event HistorySeeded(address indexed subject);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Owner-only demo seeding path. Overwrites the subject's ledger (except
    ///         `snapshotNonce`, which only `snapshot()` advances) with an explicit, disclosed
    ///         history. See the contract-level dev note.
    function seedHistory(
        address subject,
        uint64 loansCompleted,
        uint64 onTimePayments,
        uint64 latePayments,
        uint64 defaults,
        uint128 cumulativeBorrowedWei,
        uint64 firstActivityTimestamp
    ) external onlyOwner {
        require(subject != address(0), "attestor: subject=0");
        Ledger storage l = _ledgerOf[subject];
        l.loansCompleted = loansCompleted;
        l.onTimePayments = onTimePayments;
        l.latePayments = latePayments;
        l.defaults = defaults;
        l.cumulativeBorrowedWei = cumulativeBorrowedWei;
        l.firstActivityTimestamp = firstActivityTimestamp;
        emit HistorySeeded(subject);
    }

    /// @notice Snapshot the caller's current ledger and emit one `CreditSnapshot`. Callable by
    ///         anyone for themselves — a fresh, never-seeded address gets a legitimate all-zero
    ///         "thin history" snapshot, not a revert.
    function snapshot() external returns (uint64 snapshotNonce) {
        Ledger storage l = _ledgerOf[msg.sender];
        snapshotNonce = ++l.snapshotNonce;
        emit CreditSnapshot(
            msg.sender,
            l.loansCompleted,
            l.onTimePayments,
            l.latePayments,
            l.defaults,
            l.cumulativeBorrowedWei,
            l.firstActivityTimestamp,
            snapshotNonce
        );
    }

    function getLedger(address subject) external view returns (Ledger memory) {
        return _ledgerOf[subject];
    }
}
