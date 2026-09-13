/**
 * Retries a transient failure (network blip, prover timeout) with exponential backoff. Used
 * around every network-dependent pipeline step, not just SUBMIT — a job that fails ATTEST_WAIT or
 * PROOF_FETCH on one bad request has no other path back to CONFIRMED, since FAILED jobs aren't
 * resumed on restart (see jobStore.ts's `pending()`). Discovered live: a single 10s prover-request
 * timeout during ATTEST_WAIT permanently failed a job before this existed.
 */
export async function withRetry<T>(
  label: string,
  maxRetries: number,
  fn: () => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const backoffMs = Math.min(30_000, 1000 * 2 ** attempt);
      console.warn(`[${label}] attempt ${attempt + 1}/${maxRetries + 1} failed: ${msg}. Retrying in ${backoffMs}ms...`);
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? `${label}: exhausted retries`));
}
