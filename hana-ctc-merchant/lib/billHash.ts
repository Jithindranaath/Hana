import { solidityPackedKeccak256 } from "ethers";

/** billHash = keccak256(clientId, reference, amount, nonce) — WORKFLOW.md 6.1. */
export function computeBillHash(
  clientId: string,
  reference: string,
  amountUnits: bigint,
  nonce: number
): string {
  return solidityPackedKeccak256(
    ["string", "string", "uint256", "uint256"],
    [clientId, reference, amountUnits, BigInt(nonce)]
  );
}
