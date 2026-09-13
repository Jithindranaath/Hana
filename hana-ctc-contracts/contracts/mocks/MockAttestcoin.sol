// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IAttestcoin} from "../interfaces/IAttestcoin.sol";

/// @title MockAttestcoin
/// @notice Test double for the real Attestcoin precompile ABI (`IAttestcoin`, confirmed during the
///         Phase 1 spike). `verifyAndEmit`/`verify` return a configurable bool; `calculateTxIndex`
///         returns a configurable index used for the importer's replay key. Tests supply the actual
///         `encodedTransaction` bytes (receipt status + logs) directly — this mock never inspects
///         them, matching the real precompile which only proves inclusion, not content.
contract MockAttestcoin is IAttestcoin {
    bool private _verified = true;
    uint64 private _txIndex;

    function setVerified(bool verified_) external {
        _verified = verified_;
    }

    function setTxIndex(uint64 txIndex_) external {
        _txIndex = txIndex_;
    }

    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata,
        MerkleProof calldata,
        ContinuityProof calldata
    ) external returns (bool) {
        emit TransactionVerified(chainKey, height, _txIndex);
        return _verified;
    }

    function verify(
        uint64,
        uint64,
        bytes calldata,
        MerkleProof calldata,
        ContinuityProof calldata
    ) external view returns (bool) {
        return _verified;
    }

    function calculateTxIndex(MerkleProof calldata) external view returns (uint64) {
        return _txIndex;
    }
}
