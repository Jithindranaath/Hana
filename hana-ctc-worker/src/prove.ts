import { proofProvider } from "@gluwa/usc-sdk";
import { ProofBuilder } from "./attest";

/** WORKFLOW.md 5.1's PROOF_FETCH state. */
export async function fetchProof(
  builder: ProofBuilder,
  txHash: string
): Promise<proofProvider.ContinuityResponse> {
  const result = await builder.getProof(txHash);
  if (!result.success || !result.data) {
    throw new Error(result.error ?? "proof fetch failed with no error message");
  }
  return result.data;
}
