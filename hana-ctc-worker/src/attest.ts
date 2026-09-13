import { proofProvider } from "@gluwa/usc-sdk";

export type ProofBuilder = proofProvider.service.ProofBuilder;

export function makeProofBuilder(chainKey: number, proverUrl: string): ProofBuilder {
  return new proofProvider.service.ProofBuilder(chainKey, proverUrl);
}

/**
 * Blocks until the prover has the block attested and cached (WORKFLOW.md 5.1's ATTEST_WAIT state).
 * Measured ~8-10 min for a recent Sepolia block (see planning/attestation-latency.md); returns
 * near-instantly for an already-attested block (e.g. on worker resume).
 */
export async function waitAttested(
  builder: ProofBuilder,
  chainKey: number,
  blockHeight: number,
  pollIntervalMs: number
): Promise<void> {
  const waitTimeoutMs = 20 * 60_000; // generous — see hello-bridge's own conservative 20-minute cap
  await builder.waitUntilHeightAttested(chainKey, blockHeight, pollIntervalMs, waitTimeoutMs);
}
