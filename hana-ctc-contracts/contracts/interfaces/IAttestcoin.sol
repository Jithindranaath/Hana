// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title IAttestcoin
/// @notice The real Attestcoin verification precompile ABI at `0x0000...0FD2` (4050) on Creditcoin
///         CC3, confirmed live during the Phase 1 spike (`WORKFLOW.md` 1.1/1.2) by running the
///         gluwa usc-testnet-bridge-examples "hello-bridge" tutorial end to end and by deploying
///         our own `Ping`/`PingImporter` pair against it. Mirrors the gluwa asc-contracts package's
///         `INativeQueryVerifier` exactly — that package is the source of truth; this file exists
///         so `hana-ctc-contracts` doesn't have to take the whole package as a dependency just
///         for the interface shape.
///
/// @dev  IMPORTANT — this is narrower than what the spike proved was the *recommended* pattern:
///       the gluwa asc-contracts package ships `ASCBase` (abstract contract: verify then dedupe by
///       queryId then call your app hook) and `EvmV1Decoder` (decodes `encodedTransaction` into
///       receipt status + logs — the precompile itself does NOT return receipt status or decoded
///       logs, only a yes/no on Merkle inclusion + continuity). `CreditImporterASC` uses
///       `EvmV1Decoder` directly (see its file header for why it doesn't inherit `ASCBase`).
///       Concretely, the previously-assumed `verifySingle(...) -> VerifiedTransaction{verified,
///       receiptStatus, transactionIndex, logs}` in this file was WRONG on every count: the real
///       precompile returns a plain `bool`, and receipt status + logs come from decoding
///       `encodedTransaction` client-side. `getSupportedChains()` is real but lives on a
///       *different* precompile — the Chain Info precompile at `0x0000...0FD3`, via the gluwa
///       usc-sdk's `chainInfo.PrecompileChainInfoProvider`, not on this one. Confirmed live: it
///       returns `{chainKey: 1, chainId: 11155111, chainName: "Sepolia ethereum"}` for Sepolia and
///       `{chainKey: 3, chainId: 1, chainName: "Ethereum"}` for Ethereum mainnet.
interface IAttestcoin {
    struct MerkleProofEntry {
        bytes32 hash;
        bool isLeft;
    }

    struct MerkleProof {
        bytes32 root;
        MerkleProofEntry[] siblings;
    }

    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }

    event TransactionVerified(uint64 indexed chainKey, uint64 indexed height, uint64 transactionIndex);

    /// @notice Verify inclusion (Merkle proof) + continuity (chain-of-headers proof) for one
    ///         source-chain transaction. Does NOT decode the transaction or its receipt — that is
    ///         `EvmV1Decoder`'s job, run by the caller against `encodedTransaction` afterward.
    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool verified);

    /// @notice View variant of `verifyAndEmit` — does not emit `TransactionVerified`.
    function verify(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external view returns (bool verified);

    /// @notice The source transaction's index within its block, derived from the Merkle proof.
    ///         Used (together with chainKey + blockHeight) to build a stable, precompile-verified
    ///         replay/dedupe key — see `ASCBase._computeQueryId`.
    function calculateTxIndex(MerkleProof calldata merkleProof) external view returns (uint64);
}

/// @notice Confirmed live 2026-09-05 (Phase 1 spike): precompile address and Sepolia's chainKey.
library AttestcoinConstants {
    address internal constant PRECOMPILE = 0x0000000000000000000000000000000000000FD2;
    uint64 internal constant SEPOLIA_CHAIN_KEY = 1;
}
