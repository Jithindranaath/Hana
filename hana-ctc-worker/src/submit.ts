import { Contract } from "ethers";
import { proofProvider } from "@gluwa/usc-sdk";

export type SubmitResult =
  | { terminal: "confirmed"; txHash: string }
  | { terminal: "already-imported" };

/**
 * `CreditImporterASC.importFromQuery(chainKey, blockHeight, encodedTransaction, merkleRoot,
 * siblings, lowerEndpointDigest, continuityRoots)` — note this differs from the generic
 * `ASCBase.execute(...)` shape (see `@hana/shared`'s `attestcoin.ts`): no leading `action`
 * discriminator, since the importer only ever does one thing.
 */
function importFromQueryParams(proof: proofProvider.ContinuityResponse) {
  return [
    proof.chainKey,
    proof.headerNumber,
    proof.txBytes,
    proof.merkleProof.root,
    proof.merkleProof.siblings,
    proof.continuityProof.lowerEndpointDigest,
    proof.continuityProof.roots,
  ] as const;
}

function isReplayOrStaleNonce(err: any): boolean {
  const parts = [err?.shortMessage, err?.reason, err?.message, err?.info?.error?.message, err?.data?.message]
    .filter(Boolean)
    .join(" ");
  return parts.includes("asc: replay") || parts.includes("asc: stale nonce");
}

// Serializes every submission through one queue: two jobs finishing PROOF_FETCH around the same
// time must not both call `sendTransaction` against the same wallet concurrently — ethers fetches
// the "pending" nonce independently for each, and public RPC latency makes a same-nonce race (and
// a confusing "replacement fee too low") easy to hit in practice, not just in theory.
let submitQueue: Promise<unknown> = Promise.resolve();

export function submitImport(
  importer: Contract,
  proof: proofProvider.ContinuityResponse,
  maxRetries: number
): Promise<SubmitResult> {
  const run = submitQueue.then(() => doSubmit(importer, proof, maxRetries));
  submitQueue = run.catch(() => undefined); // one job's failure must not jam the queue for the next
  return run;
}

async function doSubmit(
  importer: Contract,
  proof: proofProvider.ContinuityResponse,
  maxRetries: number
): Promise<SubmitResult> {
  const params = importFromQueryParams(proof);
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Static-call first: a plain `require(cond, "reason")` revert decodes reliably from an
      // `eth_call` response even on chains/RPCs (like CC3's) that don't surface a clean revert
      // reason from a mined transaction's receipt. This also means a "replay" / "stale nonce"
      // case (the query was already imported by someone else) never costs real gas.
      await (importer as any).importFromQuery.staticCall(...params);

      const data = importer.interface.encodeFunctionData("importFromQuery", params as unknown as unknown[]);
      let gasLimit: bigint;
      try {
        const estimated = await importer.runner!.provider!.estimateGas({
          to: await importer.getAddress(),
          data,
          from: (importer.runner as any).address,
        });
        gasLimit = (estimated * 135n) / 100n;
      } catch {
        const continuityBlocks = BigInt(proof.continuityProof.roots?.length || 1);
        gasLimit = 21_000n + continuityBlocks * 5_000n + 40_000n;
      }

      const tx = await (importer as any).importFromQuery(...params, { gasLimit });
      const receipt = await tx.wait();
      return { terminal: "confirmed", txHash: receipt!.hash };
    } catch (err: any) {
      if (isReplayOrStaleNonce(err)) {
        return { terminal: "already-imported" };
      }
      lastError = err;
      const msg = String(err?.shortMessage ?? err?.reason ?? err?.message ?? err);
      const backoffMs = Math.min(30_000, 1000 * 2 ** attempt);
      console.warn(`[submit] attempt ${attempt + 1}/${maxRetries + 1} failed: ${msg}. Retrying in ${backoffMs}ms...`);
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "submitImport: exhausted retries"));
}
