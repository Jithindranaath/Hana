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
