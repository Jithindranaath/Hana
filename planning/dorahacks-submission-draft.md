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

Hana lets a wallet prove its lending and repayment history from Ethereum Sepolia — verified
synchronously by Creditcoin's Attestcoin precompile via a Merkle inclusion + continuity proof, no
oracle or bridge committee — and borrow against that imported credit on Creditcoin (CC3 Testnet).
A working Buy Now, Pay Later checkout, demo storefront, and lender interface ship as the reference
application, and `CreditRegistry.getCreditLimit(address, asset)` is a public primitive any
Creditcoin contract can call today.

## Full description

**The problem.** A wallet's credit history is trapped on the chain it was built on. A borrower
with a perfect repayment record on Ethereum looks identical to a brand-new address the moment they
show up on any other chain — every new chain starts them at zero.

**What Hana does.** Hana imports that history instead of ignoring it:

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
5. `LoanManager` originates real loans against that limit (installment, term, revolving, or an
   overcollateralized fallback needing no score at all), funded by an ERC4626 `LendingPool` that
   real depositors earn yield from, and disbursed through a `SettlementVault` that a demo
   storefront and merchant portal use for a full Buy-Now-Pay-Later checkout.

**What's real, not a mockup.** Every contract above is deployed and verified on both chains today.
A real wallet's score moved 300 → 786 from an actual imported Sepolia history — not a fixture read
in a test. The full attestation round trip was measured live, twice, independently, at ~9 minutes.
The worker was killed mid-flight and resumed correctly without double-spending gas or double-
importing. A real storefront purchase moved real funds into `SettlementVault` via a real
4-installment loan. A real lender deposit earned real, measured yield. See the project README for
every address, transaction hash, and the handful of non-obvious bugs found (and fixed) by testing
against live infrastructure instead of mocks.

**Why this matters beyond one hackathon demo.** `CreditRegistry` is a public, reusable primitive
with exactly two write paths and one read surface — any future Creditcoin contract can underwrite
against imported multi-chain credit without a partnership, a permission, or an oracle
subscription. The BNPL checkout is the reference implementation proving the primitive works, not
the point of the protocol.

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
- Measured attestation latency (~9 minutes, two independent live runs) directly shaped the
  product: the checkout's onboarding screen is built to survive a page refresh and set honest
  wait-time expectations, and the worker retries every network-dependent step with backoff plus a
  periodic sweep for anything left in a failed state.

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

**Creditcoin CC3 Testnet:**
- `CreditRegistry`: `0x856440a7dCF92371914C37E23724c85575541590`
- `LendingPool`: `0xcB08F80fFF56C7110Eca231CafBCd2AdD5363a43`
- `SettlementVault`: `0xf817e4b94914b70C00e086F30d9924Fb60C7f271`
- `LoanManager`: `0x3D34eD7926a1cE457DaE97dA8f00F6302b0332b9`
- `CreditImporterASC`: `0x32c784848B052dFe1a2480A4fdC3eAcad7781940`
- `IUSDC`: `0xe517Ff9Db1111A9e81A34AD512E7dc438DdB0f4a`

**Ethereum Sepolia:**
- `HanaCreditAttestor`: `0x89D15677c532eccDf5c8eBff69e38DB13ce966C5`

All verified — source published on both explorers, not just deployed bytecode.

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
