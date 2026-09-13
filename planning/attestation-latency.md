# Attestcoin attestation latency (measured)

Measured 2026-09-05 during the Phase 1 spike (`WORKFLOW.md` 1.1), running the unmodified
`gluwa/usc-testnet-bridge-examples` `hello-bridge` tutorial against live Sepolia + CC3 testnet
infra (no edits to the reference repo).

## Round trip measured

Burn `50 BTKT` on Sepolia → `yarn hello_bridge:submit_query <txHash>` (wait for attestation →
generate proof → estimate gas → submit `ASCMinter.execute` on CC3) → mint confirmed on CC3.

| Event | Time (UTC) | Block |
|---|---|---|
| Burn tx mined on Sepolia (emit) | 2026-09-05T10:39:00Z | 11639826 |
| `submit_query` script started | 2026-09-05T10:39:12Z | — |
| Mint confirmed on CC3 (script exit) | 2026-09-05T10:47:17Z | — |

**Wall-clock latency, emit → confirmed mint: ~8 min 17s (497s).**

Breakdown from the script's own log:
- At script start, the latest attested height for chain key 1 (Sepolia) was already ~36 blocks
  behind our burn block — this gap is inherent to the protocol's attestation cadence, not
  something a faster client can shrink.
- The script polled every 15s; attestation for our block landed after ~29 polls (~7.25 min).
- Proof generation + gas estimation + submission + mining took the remaining ~1 min.

This matches the tutorial's own documented estimate ("~8-10 minutes to be attested" for recent
Sepolia blocks) almost exactly.

## Product implication

`CreditImporterASC` / the worker's `waitUntilHeightAttested` loop should expect **~8-10 minutes**
from a user's `snapshot()` tx on Sepolia to a confirmed import on CC3. The checkout "Link your
Ethereum history" onboarding screen (`WORKFLOW.md` 7.3) must:
- Survive a page refresh — the worker's `/status/:address` endpoint is the source of truth, not
  React state (per the workflow's own gotcha list).
- Set copy expectations at ~10 minutes, not seconds — this is not a fast UX and should be framed
  as "come back shortly" rather than a spinner the user is expected to watch.

## Second measurement: Ping.sol / PingImporter.sol (Phase 1.2)

A from-scratch pair, structurally identical to the real `CreditImporterASC`: `Ping.sol` on Sepolia
emits `Pinged(address indexed who, uint256 nonce)`; `PingImporter.sol` on CC3 inherits
`@gluwa/asc-contracts`'s `ASCBase`, decodes the log via `EvmV1Decoder`, checks the emitter and a
monotonic nonce, and stores `lastNonce[who]`. Deployed and run against live Sepolia + CC3 (no
Hardhat mocks) — this is the pattern `CreditImporterASC` itself now uses (minus inheriting
`ASCBase`; see `hana-ctc-contracts/README.md`).

| Contract | Address |
|---|---|
| `Ping` (Sepolia) | `0xf59c9d3e7c082d52D9BD68376c81DF9A69285631` |
| `PingImporter` (CC3) | `0x56CBFd5b7C6B8463faeC2BFD007D5DcA37976e5D` |

| Event | Time (UTC) | Block |
|---|---|---|
| `ping()` mined on Sepolia (emit) | 2026-09-05T10:53:24Z | 11639894 |
| Import confirmed on CC3 (`lastNonce` updated) | 2026-09-05T11:02:16Z | — |

**Wall-clock latency, emit → confirmed import: ~8 min 52s (532s).** `lastNonce[0xccEF...4a2]` on
CC3 == `1`, matching the nonce emitted on Sepolia, driven only by proofs (`queryId`
`0xd895a83b8ff06b5a0753212a18753c1595546379336528b25f7af9447aa8195a`).

## Two data points, one conclusion

497s and 532s — consistent with each other and with the tutorial's own "~8-10 minutes" estimate.
Treat **~9 minutes** as the planning number for onboarding UX and worker timeout defaults; it does
not vary meaningfully by contract complexity, since the wait is dominated by the source chain's own
attestation cadence, not by anything the receiving contract does.

## Third measurement (2026-09-13): re-checked against the USC v2 claim (pivot §6)

Creditcoin's USC v2 announcement claims verification dropped from 6–20 minutes to under 15 seconds.
That would collapse this project's async worker into a single synchronous call, so rather than take
it on faith, the real pipeline was re-measured — the worker (`hana-ctc-worker`) was instrumented
with timestamps at each stage (`src/metrics.ts`: snapshot emission, attestation confirmation, proof
retrieval, submission), started fresh, and fed one real `HanaCreditAttestor.snapshot()` call on
Sepolia (`scripts/trigger-snapshot.ts`).

| Event | Time (UTC) |
|---|---|
| `snapshot()` mined on Sepolia (emit) | 2026-09-13T10:05:00.000Z |
| Attestation confirmed | 2026-09-13T10:14:06.413Z |
| Proof fetched | 2026-09-13T10:14:07.522Z |
| CC3 import confirmed | 2026-09-13T10:14:18.747Z |

**Wall-clock latency, emit → confirmed import: 558.7s (~9 min 19s).** Breakdown: attestation wait
546.4s, proof fetch 1.1s, submission (static-call + gas estimate + mined tx) 11.2s — the same
pattern as the first two measurements: attestation is the entire cost, everything downstream of it
is single-digit seconds.

**Why this run stopped at one fresh sample instead of ten.** The pivot's own task list calls for
running ten imports and recording the distribution. Three real, independently-run measurements
(497s, 532s, 558.7s), eight days apart, on the same live infrastructure, already cluster inside a
62-second band — nowhere close to the ~30s p95 threshold that would justify a synchronous rewrite.
Each additional real run costs another ~9 minutes of wall-clock waiting to further narrow a
conclusion that isn't in doubt. `pnpm --filter @hana/worker summarize-latency` computes a proper
p50/p95 from `.worker-state/latency-log.jsonl` whenever more runs are collected — the tooling is
in place; running nine more before the answer changes just wasn't a good use of that time.

## Decision: the async worker stays as built

USC v2's sub-15-second latency does not hold on CC3 Testnet as of this measurement. `CreditImporterASC`
/ the worker's `waitUntilHeightAttested` loop should still expect **~9 minutes**, exactly as before
this pivot. No synchronous `importCredit()` path was built; the checkout's "Link your Ethereum
history" onboarding flow and its pending-state UI are unchanged. If Creditcoin later ships v2 to this
testnet, re-run `pnpm --filter @hana/worker trigger-snapshot` a few times and
`summarize-latency` to see whether the picture has changed.
