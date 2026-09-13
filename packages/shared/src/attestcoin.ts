/**
 * Frozen Attestcoin proof-fetch + verification-call shapes (WORKFLOW.md Phase 1.3), confirmed
 * live 2026-09-05 during the Phase 1 spike:
 *  - `hello-bridge` tutorial run unmodified against pre-deployed contracts (1.1)
 *  - a from-scratch `Ping`/`PingImporter` pair, structurally identical to the real
 *    `CreditImporterASC`, deployed and run end to end (1.2)
 *
 * Everything here matches `@gluwa/usc-sdk` (proof fetching, off-chain) and `@gluwa/asc-contracts`
 * (on-chain verification base — `ASCBase` + `EvmV1Decoder`). The worker (`@hana/worker`,
 * WORKFLOW.md Phase 5) and `CreditImporterASC` (Phase 4) code against these shapes; nothing else
 * should need its own copy.
 *
 * Deliberately typed as plain data shapes, not re-exports of `@gluwa/usc-sdk` types, so this
 * package doesn't force that dependency on frontends that only need addresses/ABIs.
 */

/** One sibling step in a Merkle inclusion proof. Matches `INativeQueryVerifier.MerkleProofEntry`. */
export interface MerkleProofEntry {
  hash: string;
  isLeft: boolean;
}

/** Matches `INativeQueryVerifier.MerkleProof` / `@gluwa/usc-sdk`'s `TransactionMerkleProof`. */
export interface MerkleProof {
  root: string;
  siblings: MerkleProofEntry[];
}

/** Matches `INativeQueryVerifier.ContinuityProof` / `@gluwa/usc-sdk`'s `ContinuityProof`. */
export interface ContinuityProof {
  lowerEndpointDigest: string;
  roots: string[];
}

/**
 * The exact shape returned by `@gluwa/usc-sdk`'s `proofProvider.service.ProofBuilder.getProof()`.
 * These are also, field-for-field, the params of `ASCBase.execute` (minus the `action` discriminator
 * every ASC prepends) — see `executeParams` below.
 */
export interface AttestationProof {
  chainKey: number;
  headerNumber: number;
  txIndex: number;
  txHash: string;
  /** Raw proved transaction bytes (`EvmV1Decoder`-encoded) — decode this, never the precompile's return value. */
  txBytes: string;
  continuityProof: ContinuityProof;
  merkleProof: MerkleProof;
  cached: boolean;
  generatedAt: string;
}

/**
 * Builds the exact positional argument tuple for `ASCBase.execute(uint8,uint64,uint64,bytes,
 * bytes32,tuple(bytes32,bool)[],bytes32,bytes32[])` from a fetched proof. `action` is the
 * caller's own enum discriminant (e.g. `CreditImporterActions.Import = 0`).
 */
export function executeParams(
  action: number,
  proof: AttestationProof
): [number, number, number, string, string, MerkleProofEntry[], string, string[]] {
  return [
    action,
    proof.chainKey,
    proof.headerNumber,
    proof.txBytes,
    proof.merkleProof.root,
    proof.merkleProof.siblings,
    proof.continuityProof.lowerEndpointDigest,
    proof.continuityProof.roots,
  ];
}

/**
 * The off-chain steps between a source-chain tx and a submittable proof, in order. Every step
 * before `submit` is provided by `@gluwa/usc-sdk`:
 *
 * 1. `sourceChainRpc.waitForTransaction(txHash, 1, timeoutMs)` — wait for the source tx to mine.
 * 2. `new chainInfo.PrecompileChainInfoProvider(creditcoinRpc).getLatestAttestedHeightAndHash(chainKey)`
 *    — just for logging/UX; not required for correctness.
 * 3. `new proofProvider.service.ProofBuilder(chainKey, proverUrl)
 *      .waitUntilHeightAttested(chainKey, blockHeight, pollIntervalMs, waitTimeoutMs)`
 *    — blocks until the prover has the block attested and cached. Measured ~8-10 min for a recent
 *    Sepolia block (see `planning/attestation-latency.md`); this is where the worker's
 *    `ATTEST_WAIT` state lives.
 * 4. `proofBuilder.getProof(txHash)` -> `{ success, data?: AttestationProof, error? }`
 *    — the worker's `PROOF_FETCH` state.
 * 5. `contract.execute(...executeParams(action, proof.data), { gasLimit })` on the ASC, on CC3
 *    — the worker's `SUBMIT` state. `contract.execute` reverts "Query already processed" on
 *    replay (already-imported) — treat that as terminal-success, not failure (WORKFLOW.md 5.1).
 *
 * `sourceChainKey` is a known constant per source chain (Sepolia = 1), confirmed once via
 * `chainInfo.PrecompileChainInfoProvider.getSupportedChains()` — see `chain.ts`'s `attestcoin`
 * export — not re-derived on every call.
 */
export const PROOF_FETCH_STEPS = [
  "wait for source tx to mine",
  "wait until block height is attested + cached by the prover",
  "fetch proof",
  "submit to ASC via execute(...)",
] as const;
