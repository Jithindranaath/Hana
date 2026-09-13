// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAttestcoin} from "./interfaces/IAttestcoin.sol";
import {ICreditRegistry} from "./interfaces/ICreditRegistry.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

/// @title CreditImporterASC
/// @notice Attestcoin Sub-Chain Contract: verifies an attested `CreditSnapshot` from a source chain
///         and writes the imported profile into `CreditRegistry`. Separated from business logic so the
///         registry stays reusable by other protocols.
///
/// @dev Four security checks, applied in order:
///        1. Replay protection  — keccak256(chainKey, blockHeight, transactionIndex), consumed once.
///        2. Receipt status     — require the source transaction actually succeeded (status == 1).
///        3. Emitter address    — the `CreditSnapshot` log must come from the registered attestor for that chainKey.
///        4. Nonce monotonicity — snapshotNonce must exceed the last imported nonce for (chainKey, subject).
///      Each check has a committed negative test in test/CreditImporterASC.t.ts.
///
///      Confirmed against the real precompile during the Phase 1 spike (`WORKFLOW.md` 1.1-1.3):
///      `attestcoin.verifyAndEmit` only proves Merkle inclusion + continuity of `encodedTransaction`
///      — it does not decode it. Receipt status and logs come from `EvmV1Decoder` running against
///      `encodedTransaction` client-side. This contract deliberately does NOT inherit the gluwa
///      asc-contracts package's `ASCBase` (which hardcodes the precompile address as an immutable
///      set in its constructor): keeping `attestcoin` as a constructor-injected dependency, as
///      before, keeps the existing `MockAttestcoin`-based test harness working — swap in a mock at
///      an ordinary address instead of needing an EVM cheatcode to install one at the precompile's
///      fixed address. `EvmV1Decoder`'s decode functions are `internal pure`, so this doesn't cost
///      an extra external contract either way.
contract CreditImporterASC is Ownable {
    /// keccak256("CreditSnapshot(address,uint64,uint64,uint64,uint64,uint128,uint64,uint64)")
    bytes32 private constant CREDIT_SNAPSHOT_TOPIC =
        keccak256("CreditSnapshot(address,uint64,uint64,uint64,uint64,uint128,uint64,uint64)");

    IAttestcoin public immutable attestcoin;
    ICreditRegistry public immutable registry;

    mapping(uint64 => address) public attestorOf; // chainKey => known emitter
    mapping(bytes32 => bool) public consumedProofs; // replay key => used

    event AttestorSet(uint64 indexed chainKey, address attestor);
    event HistoryImported(address indexed subject, uint64 indexed chainKey, uint64 snapshotNonce, uint64 blockHeight);

    constructor(IAttestcoin attestcoin_, ICreditRegistry registry_, address initialOwner) Ownable(initialOwner) {
        attestcoin = attestcoin_;
        registry = registry_;
    }

    function setAttestor(uint64 chainKey, address attestor) external onlyOwner {
        require(attestor != address(0), "asc: attestor=0");
        attestorOf[chainKey] = attestor;
        emit AttestorSet(chainKey, attestor);
    }

    /// @notice Verify a source-chain `CreditSnapshot` and import it. Callable by anyone (typically the worker).
    function importFromQuery(
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        IAttestcoin.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external {
        address expectedEmitter = attestorOf[chainKey];
        require(expectedEmitter != address(0), "asc: unknown chainKey");

        IAttestcoin.MerkleProof memory merkleProof = IAttestcoin.MerkleProof({root: merkleRoot, siblings: siblings});
        IAttestcoin.ContinuityProof memory continuityProof =
            IAttestcoin.ContinuityProof({lowerEndpointDigest: lowerEndpointDigest, roots: continuityRoots});

        // (1) Replay protection — the precompile derives the tx's position from the Merkle proof;
        // key on it (plus chainKey/blockHeight) and consume before the mutating verify call.
        uint64 txIndex = attestcoin.calculateTxIndex(merkleProof);
        bytes32 replayKey = keccak256(abi.encodePacked(chainKey, blockHeight, txIndex));
        require(!consumedProofs[replayKey], "asc: replay");
        consumedProofs[replayKey] = true;

        bool verified = attestcoin.verifyAndEmit(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof);
        require(verified, "asc: proof not verified");

        // (2) Receipt status — the prover proves inclusion, not success.
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        require(receipt.receiptStatus == 1, "asc: reverted source tx");

        // (3) Emitter address — the snapshot log must originate from the registered attestor.
        EvmV1Decoder.LogEntry[] memory snapshotLogs =
            EvmV1Decoder.getLogsByEventSignature(receipt, CREDIT_SNAPSHOT_TOPIC);
        require(snapshotLogs.length > 0, "asc: no snapshot log");
        EvmV1Decoder.LogEntry memory log = snapshotLogs[0];
        require(log.address_ == expectedEmitter, "asc: bad emitter");

        (address subject, ICreditRegistry.ImportedSnapshot memory snapshot) = _decodeSnapshot(log);

        // (4) Nonce monotonicity — no replaying an older, more favorable snapshot.
        require(snapshot.snapshotNonce > registry.importNonceOf(chainKey, subject), "asc: stale nonce");

        registry.importAttestedHistory(subject, chainKey, snapshot);
        emit HistoryImported(subject, chainKey, snapshot.snapshotNonce, blockHeight);
    }

    // ---- decoding ----------------------------------------------------------

    function _decodeSnapshot(
        EvmV1Decoder.LogEntry memory log
    ) private pure returns (address subject, ICreditRegistry.ImportedSnapshot memory s) {
        require(log.topics.length == 2, "asc: bad snapshot topics");
        subject = address(uint160(uint256(log.topics[1]))); // indexed `subject`
        (
            uint64 loansCompleted,
            uint64 onTimePayments,
            uint64 latePayments,
            uint64 defaults,
            uint128 cumulativeBorrowedWei,
            uint64 firstActivityTimestamp,
            uint64 snapshotNonce
        ) = abi.decode(log.data, (uint64, uint64, uint64, uint64, uint128, uint64, uint64));

        s = ICreditRegistry.ImportedSnapshot({
            loansCompleted: loansCompleted,
            onTimePayments: onTimePayments,
            latePayments: latePayments,
            defaults: defaults,
            cumulativeBorrowedWei: cumulativeBorrowedWei,
            firstActivityTimestamp: firstActivityTimestamp,
            snapshotNonce: snapshotNonce
        });
    }
}
