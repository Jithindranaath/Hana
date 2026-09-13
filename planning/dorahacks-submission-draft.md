# DoraHacks BUIDL submission draft — Hana Network

Phase 9.3 of `WORKFLOW.md`. This is text to paste into the BUIDL form, not a submission — creating
the BUIDL page and hitting submit requires your own DoraHacks account/team. Deadline: **Sep 13,
2026, 23:59 ET**.

Fill in every `[ ]` bracket before submitting — each one needs something only you have (repo URL,
demo video URL, team info, logo).

---

## Project name

Hana Network

## Sector

DeFi

## One-line tagline

Bring your Ethereum lending history to Creditcoin — cross-chain credit, verified by a proof, not
an oracle.

## Short description (for the BUIDL card, ~2-3 sentences)

Hana is a cross-chain credit primitive for Creditcoin: `CreditRegistry` imports a wallet's lending
history from Ethereum Sepolia — verified synchronously by Creditcoin's Attestcoin precompile via a
Merkle inclusion + continuity proof, no oracle or bridge committee — and exposes one call,
`getCreditLimit(address, asset)`, that any Creditcoin contract can read today. Two reference
applications prove it's reusable rather than app-specific: a working Buy Now, Pay Later checkout,
and a DePIN node-operator credit line — the underwriting layer for the SpaceRouter Credit Line
already on Creditcoin's own published roadmap.

## Full description

**The problem.** A wallet's credit history is trapped on the chain it was built on. A borrower
with a perfect repayment record on Ethereum looks identical to a brand-new address the moment they
show up on any other chain — every new chain starts them at zero. And even once that history is
portable, there's nothing on Creditcoin today an arbitrary contract can query to underwrite against
it permissionlessly.

**What Hana is.** `CreditRegistry` — a public, on-chain credit primitive. It imports cross-chain
history and exposes it through exactly two calls: `getCreditLimit(address, asset)` to read, and an
owner-managed allowlist of authorized reporters (`recordNativeActivity`) to write. Any Creditcoin
contract can integrate by reading the first call; any credit product can become a first-class
consumer by being added to the second. The registry is the product — everything below is a
reference application proving it, not the point of the protocol.

**How the import works:**

1. A wallet calls `snapshot()` on `HanaCreditAttestor` (Sepolia), emitting one aggregated
   `CreditSnapshot` event summarizing its lending activity.
2. A worker service fetches a Merkle inclusion + continuity proof for that transaction from
   Creditcoin's Attestcoin infrastructure and submits it to `CreditImporterASC` on CC3.
3. `CreditImporterASC` verifies the proof against the real `INativeQueryVerifier` precompile
   (`0x0FD2`), decodes the proved transaction's receipt and logs itself (the precompile only
   proves inclusion — it doesn't interpret content), runs four checks (replay, receipt status,
   emitter identity, monotonic nonce), and writes the imported profile into `CreditRegistry`.
4. `CreditRegistry` recomputes the wallet's composite score — imported history always weighted
   below native activity — and its available credit limit becomes readable by any Creditcoin
   contract via `getCreditLimit(address, asset)`.

**Two reference applications, same registry, zero coupling between them:**

- **Reference app #1 — BNPL checkout.** `LoanManager` originates real loans against that limit
  (installment, term, revolving, or an overcollateralized fallback needing no score at all),
  funded by an ERC4626 `LendingPool` that real depositors earn yield from, and disbursed through a
  `SettlementVault` that a demo storefront and merchant portal use for a full checkout. Liquidation
  of non-asset collateral routes through a PenguinSwap-shaped router (`IPenguinSwapRouter`) — the
  real mainnet PenguinSwap address drops in via one owner call, no redeployment.
- **Reference app #2 — SpaceCreditLine.** A DePIN node operator draws a credit line in $SPACE
  against the *same* imported score, which auto-stakes it into a SpaceRouter-shaped staking
  contract on their behalf — the operator never custodies principal — and repays the debt from
  staking yield instead of outside capital. This is the SpaceRouter Credit Line product Creditcoin
  has publicly said it plans to build; Hana ships the permissionless underwriting layer it needs,
  live and deployed today, ahead of the product itself.

Both reference apps are just entries in `CreditRegistry.authorizedReporters` calling the same two
functions — exactly the shape a third integrating protocol would use.

**What's real, not a mockup.** Every contract above is deployed and verified on both chains today.
A real wallet's score moved 300 → 786 from an actual imported Sepolia history — not a fixture read
in a test. The full attestation round trip was measured live, three times, independently (two
before this pivot, one freshly re-measured against Creditcoin's USC v2 latency claim), converging
tightly on ~9 minutes — USC v2's sub-15-second claim does not hold on CC3 Testnet as of this
submission, a finding published with the full breakdown on the docs site. The worker was killed
mid-flight and resumed correctly without double-spending gas or double-importing. A real storefront
purchase moved real funds into `SettlementVault` via a real 4-installment loan. A real lender
deposit earned real, measured yield. A real SpaceCreditLine draw was serviced by real, on-chain
staking yield on live CC3 blocks. See the project README for every address, transaction hash, and
the handful of non-obvious bugs found (and fixed) by testing against live infrastructure instead of
mocks.

**Why this matters beyond one hackathon demo.** `CreditRegistry` is a public, reusable primitive
with exactly two write paths and one read surface — any future Creditcoin contract can underwrite
against imported multi-chain credit without a partnership, a permission, or an oracle
subscription. Two independent reference applications already prove that claim in code, not just in
prose.

## Attestcoin integration summary

Hana's cross-chain credit import is built entirely on Creditcoin's Attestcoin Protocol — this is
the core integration, not an add-on:

- Verification runs through the real `INativeQueryVerifier` precompile at `0x0FD2`
  (`verifyAndEmit` / `verify`, returning a plain `bool` after checking Merkle inclusion and header
  continuity for a proved Sepolia transaction) — confirmed against the live network during a
  dedicated spike phase before any contract was built against it, which caught the team's
  original interface assumption (a struct return with decoded receipt/log fields) as wrong on
  every field.
- Chain identity comes from the separate Chain Info precompile at `0x0FD3`
  (`getSupportedChains()`), confirmed live to map Sepolia to `chainKey 1`.
- Proof generation is off-chain via `@gluwa/usc-sdk`; on-chain decoding of the proved
  transaction's receipt and logs is done with `@gluwa/asc-contracts`'s `EvmV1Decoder`, since the
  precompile itself only proves inclusion.
- `CreditImporterASC` runs four ordered checks on every import (replay, receipt status, emitter
  identity, monotonic nonce), each backed by a committed negative test, before writing anything
  into `CreditRegistry` — full write-up with test names at `/attestcoin` on the project's docs
  site.
- Measured attestation latency (~9 minutes, three independent live runs, including one freshly
  re-measured against Creditcoin's own USC v2 sub-15-second claim — which does not hold on CC3
  Testnet as of this submission) directly shaped the product: the checkout's onboarding screen is
  built to survive a page refresh and set honest wait-time expectations, and the worker retries
  every network-dependent step with backoff plus a periodic sweep for anything left in a failed
  state.

## Demo video URL

[ ] — paste the uploaded video URL here once `planning/demo-video-script.md` is recorded and
uploaded.

## Live demo URLs

These are testnet deployments — reachable only while you're running the packages locally
(`pnpm checkout:dev`, `pnpm store:dev`, `pnpm docs:dev`, etc., see the root README's Quick Start).
If DoraHacks requires a publicly reachable URL rather than local instructions, deploy the
Next.js apps (Vercel or similar) before submitting and put those URLs here instead:

- Checkout Hub: [ ]
- Demo store: [ ]
- Docs site: [ ]

## Repository

[ ] — your GitHub repo URL, made public before submitting (WORKFLOW.md 9.3 requirement).

## Contract addresses (for judges to verify independently)

**Creditcoin CC3 Testnet — the primitive:**
- `CreditRegistry`: `0xf2e70CCAdafD2e8c6285754318e59b7d2a32718B`
- `CreditImporterASC`: `0x5f344c437Df484FED87bEf2209E3bA748E11879a`

**Reference app #1 — BNPL:**
- `LendingPool`: `0xcB08F80fFF56C7110Eca231CafBCd2AdD5363a43`
- `SettlementVault`: `0xf817e4b94914b70C00e086F30d9924Fb60C7f271`
- `LoanManager`: `0xc73157b64b7034d9Bd0A69c1ca050E17F3c1C51E`
- `IUSDC`: `0xe517Ff9Db1111A9e81A34AD512E7dc438DdB0f4a`
- `MockPenguinSwapRouter`: `0x2127CAdecd947df2B93b92E675820309b256f103` (liquidation swap route for non-`iUSDC` collateral)

**Reference app #2 — SpaceCreditLine:**
- `SpaceCreditLine`: `0x02d0eEcA39fD124a1E2dE8Cb050f89219aaf5805`
- `MockSpaceStaking`: `0x06d5357E532EB6973BB699b3B63E57039D0D9d85`
- `MockSPACE`: `0x95457A6F26a9170B7e54136C4Fd932Af92d1730d`

**Ethereum Sepolia:**
- `HanaCreditAttestor`: `0x89D15677c532eccDf5c8eBff69e38DB13ce966C5`

All verified — source published on both explorers, not just deployed bytecode.
(`CreditRegistry`/`CreditImporterASC` are newer addresses than earlier in the build: they were
redeployed when the registry's owner-managed `authorizedReporters` allowlist shipped, the change
that let `SpaceCreditLine` become a second consumer application. `LoanManager` was then redeployed
a second time, on its own, when PenguinSwap liquidation support shipped.)

## Team

[ ] — your name(s), role(s), and any relevant links (GitHub, X/Twitter, LinkedIn) per the BUIDL
form's team section.

## Logo

[ ] — DoraHacks BUIDL pages require an uploaded logo image; none exists yet for this project.

---

## Pre-submit checklist (from WORKFLOW.md 9.3's "done when")

- [ ] Repository is public.
- [ ] Every package has its own README (already true — verify no package regressed).
- [ ] A deck or whitepaper PDF, if the BUIDL form has a slot for one (optional per the form, but
      the root README + docs site can substitute if it doesn't).
- [ ] BUIDL page filled in: description, Attestcoin integration summary (both drafted above),
      logo, sector = DeFi, demo URL, team.
- [ ] Every contract on both chains confirmed deployed **and verified** (already true — see table
      above; spot-check both explorer links resolve before submitting).
- [ ] `/addresses` page on the docs site is live and matches the table above (confirmed this
      session via a real browser run).
- [ ] Every link actually in the final submission resolves — click each one yourself after
      pasting, right before hitting submit.
