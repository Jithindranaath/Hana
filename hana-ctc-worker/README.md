# @hana/worker

Off-chain orchestrator: `CreditSnapshot` event on Sepolia → attestation wait → proof fetch →
`CreditImporterASC.importFromQuery` on CC3. Node.js + `@gluwa/usc-sdk` + ethers v6.

**Status: built and proven end-to-end against the live Sepolia + CC3 deployments** (no mocks) —
cold-start pickup, attestation wait, submission, the `/status` endpoint, and resume-after-kill
without double-submitting all verified live. See `planning/demo-fixtures.md` for the run log.

## Contents

- `src/config.ts` — env loading (package-local `.env`, then repo-root `.env` as fallback).
- `src/jobStore.ts` — whole-file JSON job store (`${WORKER_STATE_DIR}/jobs.json`, atomic
  write-then-rename), keyed by `keccak256(chainKey, blockHeight, txIndex)` — the same replay key
  `CreditImporterASC` computes on-chain. States: `SEEN → ATTEST_WAIT → PROOF_FETCH → SUBMIT →
  CONFIRMED | FAILED`.
- `src/listener.ts` — backfills + polls `CreditSnapshot` on Sepolia (chunked `queryFilter`, public
  RPCs cap `eth_getLogs` ranges), persists a cursor so it never rescans from genesis.
- `src/attest.ts` / `src/prove.ts` — thin wrappers over `@gluwa/usc-sdk`'s
  `proofProvider.service.ProofBuilder` (`waitUntilHeightAttested`, `getProof`).
- `src/retry.ts` — exponential-backoff retry wrapper, applied around both of the above, not just
  around submission (see "Design notes" — this was a real bug, not speculative hardening).
- `src/submit.ts` — submits `importFromQuery`, serialized through a queue (see "Design notes"),
  static-calling first so a "replay" / "stale nonce" revert (already imported by someone else, or
  by a previous half-finished run of this worker) is caught cheaply and treated as terminal
  success, not failure — and so a doomed transaction is never actually sent.
- `src/server.ts` — `GET /status/:address` (+ `/health`), CORS-scoped to `CHECKOUT_BASE_URL`.
- `src/index.ts` — wires it all together: resumes pending jobs from a previous run, then starts
  the listener and the HTTP server.

Addresses/ABIs come from `@hana/shared/src/generated/<network>.ts` — never hand-copied.

## Commands

```bash
pnpm install   # from the repo root once every package has deps: pnpm install
pnpm dev       # tsx watch src/index.ts
pnpm typecheck
```

There's no separate build/start split: `@hana/shared` ships as raw TypeScript (no compiled
`dist`), so both dev and "production" run through `tsx` directly (`pnpm start` runs the same
`src/index.ts` without the watch).

## Environment

Copy the relevant block from the repo-root `.env.example` into `.env` here:
`SEPOLIA_RPC_URL`, `CC3_RPC_URL`, `SOURCE_CHAIN_KEY`, `ATTESTCOIN_PROVER_URL`,
`WORKER_SUBMITTER_PRIVATE_KEY` (any CC3-funded key — `importFromQuery` is permissionless),
`WORKER_POLL_INTERVAL_MS`, `WORKER_MAX_RETRIES`, `WORKER_STATE_DIR`, `WORKER_HTTP_PORT`,
`WORKER_START_BLOCK` (optional — see below), `CHECKOUT_BASE_URL` (CORS origin for `/status`).

## Design notes worth knowing before you touch this code

- **`WORKER_START_BLOCK` matters on first boot.** With no cursor file yet, an unset
  `WORKER_START_BLOCK` backfills from `latest - 20,000` blocks (`src/listener.ts`'s
  `DEFAULT_LOOKBACK_BLOCKS`) rather than genesis — set it explicitly to
  `HanaCreditAttestor`'s deployment block (see `hana-ctc-attestor/deployments/sepolia.json`) for
  a deterministic backfill.
- **Submissions are serialized through one queue (`submit.ts`).** Two jobs finishing
  `PROOF_FETCH` around the same time must not both call `sendTransaction` concurrently against the
  same wallet — ethers resolves the "pending" nonce independently for each, and public RPC latency
  turns that into a same-nonce race in practice (we hit this directly during testing: a genuine
  "replacement fee too low"). One `submitImport` at a time, always.
- **Static-call before sending.** A plain `require(cond, "reason")` revert doesn't always come
  back as a clean, parseable reason from a *mined* transaction's receipt on every RPC (CC3's
  included, in testing) — but it does from a `staticCall` (`eth_call`). Checking with `staticCall`
  first means a "replay"/"stale nonce" case is caught reliably *and* never costs real gas.
- **Resume replays the whole pipeline, not just the unfinished step.** On boot, any job not yet
  `CONFIRMED`/`FAILED` re-enters at `ATTEST_WAIT` regardless of which state it was in when the
  process died. This is safe specifically because every step is idempotent:
  `waitUntilHeightAttested` returns immediately if already attested, `getProof` just re-fetches,
  and `submitImport`'s static-call-first replay/stale-nonce handling means re-submitting an
  already-imported query costs nothing and fails closed to `CONFIRMED`, not a duplicate write.
- **A "replay"/"stale nonce" outcome still resolves to `CONFIRMED`** (with an `error` field noting
  why) — from the checkout onboarding UI's perspective, the subject's history *is* imported
  either way, which is the only thing that UI needs to know.
- **A transient network blip can outlast `withRetry`'s own budget without the service actually
  being down.** Hit live, twice, with two different failure shapes: a single prover-request
  timeout during `ATTEST_WAIT`, and separately a DNS lookup failure that resolved again within
  seconds. Both permanently failed a job before `withRetry` existed (originally only `submit.ts`
  had backoff — `waitAttested`/`fetchProof` had none). Two layers of defense now: `withRetry`
  wraps every network-dependent step (`index.ts`), and a periodic sweep (every 3 minutes) gives
  any job that still ends up `FAILED` a fresh full retry budget rather than leaving it stuck until
  someone manually restarts the process. If you see a job wedged in `FAILED` for more than one
  sweep interval, that's a real failure worth looking at, not a fluke.
- **`processJob` clears a job's `error` field at the start of every attempt.** Without this, a
  transient failure's error message survives into the eventual `CONFIRMED` record even though
  nothing is actually wrong anymore — confusing to anyone reading job history later.
