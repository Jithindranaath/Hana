# Hana Network — Cross-Chain Credit Layer on Creditcoin

Hana lets a wallet **prove its lending/repayment history from another chain** — via the
**Attestcoin Protocol**, verified synchronously by the precompile at `0x0FD2` with a Merkle
inclusion proof plus a continuity proof — and **borrow against that imported credit on
Creditcoin (CC3 Testnet)**. A Buy Now, Pay Later checkout ships as the reference application.

`CreditRegistry` is a public primitive: any Creditcoin contract can call
`getCreditLimit(address, asset)` and underwrite against an attested, multi-chain credit
profile — no oracle, no bridge, no permission.

**Built for BUIDL CTC 2026 Fall** (DoraHacks, DeFi track). If you're new to this repo, this file is
meant to be enough on its own — what the project is, what actually works today (verified live, not
just written), what's left, and how to run it. Deep-dives live in each package's own `README.md`;
the full phase-by-phase build plan with acceptance checks is `WORKFLOW.md`.

## Status

Phases are `WORKFLOW.md`'s own numbering. "Verified live" means driven against the real deployed
contracts on real Sepolia + CC3 testnets in this session — not a local chain, not a mock.

| Phase | What | Status |
|---|---|---|
| 0 | Foundations (monorepo, tooling, chain facts confirmed) | ✅ Done |
| 1 | Attestcoin spike — de-risk the precompile before building on it | ✅ Done — see "What the spike found" below |
| 2 | `HanaCreditAttestor` (Sepolia) | ✅ Deployed, verified, demo fixtures seeded |
| 3 | Core protocol (`CreditRegistry`, `LendingPool`, `LoanManager`, `SettlementVault`, `iUSDC`) | ✅ Deployed + verified on CC3, smoke test passing |
| 4 | `CreditImporterASC` + wiring | ✅ Deployed, wired, a real cross-chain import proven end to end |
| 5 | Worker (event → attest → proof → submit) | ✅ Built, hardened, proven live (cold start, kill/resume, retry-on-failure) |
| 6 | Merchant API + portal | ✅ Built and tested (API + browser-driven UI) |
| 7 | Checkout Hub (wallet, score, onboarding, loans, repayment) | ✅ All 5 sub-phases verified live — see below |
| 8 | Demo store + lender interface | ✅ Both sub-phases verified live — see below |
| 9 | Docs site, demo video, submission | 🔶 9.1 done (docs site built + verified live); 9.2/9.3 drafted, awaiting recording + submission — see below |

Nothing above is aspirational — every ✅ has a corresponding real transaction hash or passing test
run. Where something is implemented but *not* verified live, it's called out explicitly (see
"Known gaps" below) rather than left ambiguous.

## Live deployments

**Creditcoin CC3 Testnet** (chainId `102031`) — [explorer](https://creditcoin-testnet.blockscout.com)

| Contract | Address |
|---|---|
| `IUSDC` | [`0xe517Ff9Db1111A9e81A34AD512E7dc438DdB0f4a`](https://creditcoin-testnet.blockscout.com/address/0xe517Ff9Db1111A9e81A34AD512E7dc438DdB0f4a#code) |
| `CreditRegistry` | [`0x53E25073d4C4611EBf444ceb1f4b9340ed3D3de1`](https://creditcoin-testnet.blockscout.com/address/0x53E25073d4C4611EBf444ceb1f4b9340ed3D3de1#code) |
| `LendingPool` | [`0xcB08F80fFF56C7110Eca231CafBCd2AdD5363a43`](https://creditcoin-testnet.blockscout.com/address/0xcB08F80fFF56C7110Eca231CafBCd2AdD5363a43#code) |
| `SettlementVault` | [`0xf817e4b94914b70C00e086F30d9924Fb60C7f271`](https://creditcoin-testnet.blockscout.com/address/0xf817e4b94914b70C00e086F30d9924Fb60C7f271#code) |
| `LoanManager` | [`0xf954359074B83d8EcE8CF5c266A9749208e30d7a`](https://creditcoin-testnet.blockscout.com/address/0xf954359074B83d8EcE8CF5c266A9749208e30d7a#code) |
| `CreditImporterASC` | [`0xF3154Fe52444b4F6f833eF1873E734f60f713259`](https://creditcoin-testnet.blockscout.com/address/0xF3154Fe52444b4F6f833eF1873E734f60f713259#code) |
| `MockSPACE` | [`0x95457A6F26a9170B7e54136C4Fd932Af92d1730d`](https://creditcoin-testnet.blockscout.com/address/0x95457A6F26a9170B7e54136C4Fd932Af92d1730d#code) |
| `MockSpaceStaking` | [`0x06d5357E532EB6973BB699b3B63E57039D0D9d85`](https://creditcoin-testnet.blockscout.com/address/0x06d5357E532EB6973BB699b3B63E57039D0D9d85#code) |
| `SpaceCreditLine` | [`0x65A38BfCB9a5741097aa78F1acAf5f05d3bC908E`](https://creditcoin-testnet.blockscout.com/address/0x65A38BfCB9a5741097aa78F1acAf5f05d3bC908E#code) |
| `MockPenguinSwapRouter` | [`0x2127CAdecd947df2B93b92E675820309b256f103`](https://creditcoin-testnet.blockscout.com/address/0x2127CAdecd947df2B93b92E675820309b256f103#code) |

_(`CreditRegistry`, `LoanManager`, `CreditImporterASC`, and `SpaceCreditLine` were each redeployed
more than once over the course of this pivot — first for the registry's `authorizedReporters`
change, again for PenguinSwap liquidation support, and again to partition `outstandingDebt` per
asset after live testing surfaced a real bug where an 18-decimal SPACE draw could zero out a
wallet's 6-decimal iUSDC available credit. `LendingPool`/`SettlementVault`/`IUSDC` kept their
original addresses throughout and were just re-pointed at each new `LoanManager` in turn.
`MockSPACE`, `MockSpaceStaking`, and `MockPenguinSwapRouter` are unchanged since they were first
deployed.)_

**Ethereum Sepolia** (chainId `11155111`) — the credit-import source chain

| Contract | Address |
|---|---|
| `HanaCreditAttestor` | [`0x89D15677c532eccDf5c8eBff69e38DB13ce966C5`](https://sepolia.etherscan.io/address/0x89D15677c532eccDf5c8eBff69e38DB13ce966C5#code) |

All six contracts are verified (source published, not just deployed). These are also the single
source of truth consumed by every package — see `packages/shared/src/generated/`; nothing hand-copies
an address.

## What's proven, not just built

- **Phase 1**: Two independent live proof round-trips (the reference `hello-bridge` tutorial, and a
  from-scratch `Ping`/`PingImporter` pair matching `CreditImporterASC`'s exact shape) confirmed the
  real precompile ABI, the real chain facts, and measured attestation latency at **~9 minutes**
  (`planning/attestation-latency.md`). This caught the original `IAttestcoin.sol` guess being wrong
  on every field before any real contract was built against it.
- **Phase 4**: A real Sepolia `snapshot()` was imported through the live `CreditImporterASC` — a
  wallet's on-chain composite score moved **300 → 786** from real imported history, not a test
  fixture (`planning/demo-fixtures.md`).
- **Phase 5**: The worker was killed mid-attestation-wait and resumed correctly without double-submitting;
  separately, two real transient network failures (a prover timeout, a DNS blip) were caught live
  and led to real retry-hardening, not hypothetical.
- **Phase 7**: The entire user journey — connect wallet → see real score → link Ethereum history →
  watch it import live → pay a bill via a real 4-installment loan → pay it off from the dashboard
  → watch the score change — was driven end to end in a real browser against the live contracts.
  Along the way this surfaced and fixed four real integration bugs (a broken RainbowKit
  dependency, a wallet connector that only works with a real browser extension, missing CORS on
  a cross-origin API call, and an unreadable error from a cross-contract revert) — see
  `hana-ctc-checkout/README.md`'s design notes for the specifics.
- **Phase 8**: A real storefront purchase was driven end to end — add to cart → server-side
  checkout (price recomputed server-side, never trusted from the client) → redirect to the
  Checkout Hub → real origination → `SettlementVault` confirmed to hold the funds. Separately, the
  lender interface was proven to pay real yield: deposited 3,000 iUSDC, let a real borrower's
  interest accrue for 5 minutes, and redeemed for **3,000.000047 iUSDC** — more than deposited, not
  a rounding artifact (a smaller first attempt *did* round down, which is expected ERC4626
  behavior at that scale, not a bug — see `hana-ctc-checkout/README.md`).

## Monorepo layout

| Folder | Package | Role | Status |
|---|---|---|---|
| [`hana-ctc-contracts/`](./hana-ctc-contracts) | `@hana/contracts` | Core protocol on CC3: `CreditRegistry`, `LendingPool`, `LoanManager`, `SettlementVault`, `CreditImporterASC`, `iUSDC` | Deployed + verified |
| [`hana-ctc-attestor/`](./hana-ctc-attestor) | `@hana/attestor` | `HanaCreditAttestor` on Ethereum Sepolia (source chain) | Deployed + verified |
| [`hana-ctc-worker/`](./hana-ctc-worker) | `@hana/worker` | Off-chain orchestrator: event → attest wait → proof → ASC submit | Built + proven live |
| [`hana-ctc-checkout/`](./hana-ctc-checkout) | `@hana/checkout` | Checkout Hub: wallet, score, credit-import onboarding, loans, repayment | Built + proven live |
| [`hana-ctc-merchant/`](./hana-ctc-merchant) | `@hana/merchant` | Merchant portal + bill API (MongoDB) | Built + tested |
| [`hana-ctc-store/`](./hana-ctc-store) | `@hana/store` | Demo storefront ("Pay with Hana") | Built + proven live |
| [`hana-ctc-docs/`](./hana-ctc-docs) | `@hana/docs` | Protocol docs + Attestcoin write-up | Built + proven live |
| [`packages/shared/`](./packages/shared) | `@hana/shared` | Chain config, generated ABIs + address book, shared types | Live |
| [`planning/`](./planning) | — | Spec, architecture, product plan, attestation-latency + demo-fixtures logs | — |

**Build order and acceptance checks: [`WORKFLOW.md`](./WORKFLOW.md).** Each package's own
`README.md` has a "design notes" section documenting non-obvious decisions and real bugs found
while building it — worth reading before touching that package's code.

## Quick start

```bash
pnpm install
cp .env.example .env            # then fill each package's own .env — see each package's README

# Contracts + attestor are already deployed (addresses above); to redeploy from scratch:
pnpm contracts:test              # protocol unit + integration tests (59/59 passing)
pnpm attestor:test                # 7/7 passing
pnpm attestor:deploy:sepolia && pnpm attestor:verify:sepolia
pnpm contracts:deploy:cc3 && pnpm contracts:deploy:importer:cc3 && pnpm contracts:deploy:spacecreditline:cc3 && pnpm contracts:deploy:penguinswap:cc3 && pnpm contracts:verify:cc3
pnpm sync:abis                   # publish addresses + ABIs to @hana/shared

pnpm worker:dev                  # http://localhost:8787

# Merchant needs a MongoDB — zero-setup local option, no Docker/account needed:
pnpm --filter @hana/merchant db:memory     # separate terminal, prints MONGODB_URI to copy in
pnpm merchant:dev                # http://localhost:3002

pnpm checkout:dev                # http://localhost:3001 — includes /lend
pnpm store:dev                   # http://localhost:3003 — needs its own merchant account, see hana-ctc-store/README.md
pnpm docs:dev                    # http://localhost:3004 — architecture, Attestcoin write-up, addresses, integration guide
```

Each package's own `README.md` has the full environment variable list and exact commands
(`pnpm typecheck`, `pnpm build`, package-specific scripts).

## Chain facts

Confirmed live during the Phase 1 spike — not assumptions.

| | |
|---|---|
| Protocol chain | Creditcoin CC3 Testnet (EVM L1), chainId `102031` — RPC `https://rpc.cc3-testnet.creditcoin.network` |
| Source chain | Ethereum Sepolia, chainId `11155111` — `chainKey` **1** as seen by the CC3 USC runtime |
| Attestcoin verifier precompile | `0x0000000000000000000000000000000000000FD2` (proves Merkle inclusion + continuity only — does not decode the transaction) |
| Chain Info precompile | `0x0000000000000000000000000000000000000fd3` (a *different* precompile — `getSupportedChains()` lives here) |
| Prover | `https://prover.cc3-testnet.creditcoin.network` |
| Measured attestation latency | ~9 minutes, emit → confirmed import (two independent live measurements) |
| SDK | `@gluwa/usc-sdk` (peer dep: ethers v6) for off-chain proof fetching; `@gluwa/asc-contracts`'s `EvmV1Decoder` on-chain for decoding a proved transaction's receipt/logs |
| Primary asset | `iUSDC` (mock ERC20, 6 decimals, faucet-mintable) |

## Architecture notes worth knowing

- **The precompile only proves inclusion — it never decodes anything.** `verifyAndEmit`/`verify`
  return a plain `bool`. Receipt status and event logs come from decoding `encodedTransaction`
  client-side via `EvmV1Decoder`. This was the single biggest wrong assumption in the original
  plan (`IAttestcoin.sol` originally guessed a struct return with `receiptStatus` baked in) —
  caught in the Phase 1 spike before `CreditImporterASC` was built against the wrong shape.
- **`CreditRegistry` has exactly two write paths**: `recordNativeActivity` (`onlyReporter`, gated by an
  owner-managed `authorizedReporters` allowlist so more than one consumer application — `LoanManager`,
  and later `SpaceCreditLine` — can report native activity through the same interface) and
  `importAttestedHistory` (`onlyImporterASC`). The LP-deposit score bonus is pull-based (reads
  `lendingPool.maxWithdraw`), not a third writer.
- **Imported history is always weighted below native** (`importWeightBps`, default 60%) — you
  can't out-score a local borrower purely by importing history elsewhere.
- **Money is on-chain; the Merchant API only stores metadata**, joined by `billHash`. The
  Merchant API and Checkout Hub are different origins/services on purpose (a merchant's API
  credentials never reach the browser-facing checkout) — see `hana-ctc-checkout/README.md`'s
  notes on the internal-token proxy route and CORS.
- **The worker is designed to survive restarts and network blips, not just the happy path**: job
  state is a crash-safe JSON file keyed by the same replay key the contract computes on-chain, and
  every network-dependent step retries with backoff plus a periodic sweep for anything that still
  ends up failed. This was hardened against real failures hit during testing, not written
  speculatively.
- **The checkout onboarding screen survives a page refresh** by checking the worker's
  `/status/:address` on mount rather than trusting React state — confirmed live (reloaded a
  browser mid-import in a fresh context and it resumed with the correct elapsed time).
- **A small LP stake in a large pool can see yield rounded away to zero.** `LendingPool` is a
  standard OZ ERC4626 vault, which always rounds in the vault's favor (anti-inflation-attack
  protection) — a depositor whose pool share times the interest earned doesn't clear a whole base
  unit gets nothing that cycle, or even one unit less than deposited. Confirmed live at both ends:
  a 200 iUSDC stake against one small loan's interest rounded down; a 3,000 iUSDC stake against a
  larger loan's interest over a longer window rounded up to a clean, unambiguous gain. Not a bug —
  size any yield test or demo accordingly.
- **Phase 9.1**: the docs site (`@hana/docs`) renders five pages, each driven in a real browser
  (Playwright) against the running dev server — including the addresses page, confirmed to pull
  the live `CreditRegistry` and `HanaCreditAttestor` addresses from `@hana/shared`, not
  hand-typed copies — with zero console errors.

## Known gaps

- **Phase 9.2/9.3** (demo video, DoraHacks submission) are drafts only —
  [`planning/demo-video-script.md`](./planning/demo-video-script.md) (full shot list, real tx
  hashes/addresses, timing) and
  [`planning/dorahacks-submission-draft.md`](./planning/dorahacks-submission-draft.md) (BUIDL page
  text, pre-submit checklist) are ready to act on, but recording the video and submitting to
  DoraHacks are actions only you can perform (they need your own recording setup and DoraHacks
  account/team/logo). Everything else in `WORKFLOW.md` is done.
- **Late-payment penalty is implemented and unit-tested, but not verified live.** Watching a real
  loan actually go overdue needs a real due date to pass on a live testnet — not something a
  session can fast-forward. The contract logic (`LoanManager`'s late fee + `PAYMENT_LATE` scoring)
  has committed unit tests; the checkout dashboard's "Overdue" badge is implemented against the
  same `nextDueDate + gracePeriod` read the contract uses. Nobody has watched both happen together
  on a live loan yet.
- **`REVOLVING` loans** (`draw`/open credit lines) aren't wired into the checkout's origination
  flow yet — it currently offers `INSTALLMENT` (4/6), `TERM`, and an `OVERCOLLATERALIZED` fallback.
- **`pnpm contracts:test` / `pnpm attestor:test` can rarely crash on exit on Windows** with an
  `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` line — a libuv/native-addon (`keccak`,
  `secp256k1`) teardown race on a Node version newer than Hardhat 2.x's binaries were built against
  (hit once on Node v24.12.0; reproduced 0/5 on immediate reruns). Harmless — check for the passing
  count printed just above it. Details and workarounds in `hana-ctc-attestor/README.md`.

## Hackathon

BUIDL CTC 2026 Fall (DoraHacks) — Track: DeFi. Submission deadline Sep 13, 2026, 23:59 ET.
