# Demo video script — Hana Network (~5 min)

Phase 9.2 of `WORKFLOW.md`. This is a shot list and script, not the video itself — recording,
editing, and uploading are actions only you can do. Every number, address, and tx hash below is
real, pulled from this session's actual runs (`planning/demo-fixtures.md`,
`planning/attestation-latency.md`, the root `README.md`). Where a beat needs a fresh transaction
(Phase 7/8 flows weren't hash-logged when driven via Playwright), it's flagged **[RECORD LIVE]**
with the exact steps to reproduce it — do that run once, note the hashes it produces, and drop
them into the corresponding on-screen caption before final export.

## Pre-recording checklist

- [ ] Re-run `pnpm attestor:seed:sepolia` on a **third** wallet (don't reuse the "excellent"/"thin"
      demo wallets — their nonces are already imported, so a fresh `snapshot()` proves the flow is
      live, not replayed) — or use the "thin" wallet's fresh `snapshot()` if a clean nonce bump is
      acceptable on camera.
- [ ] Start `pnpm worker:dev` in a terminal window sized to be legible on screen — this is "the
      worker log" shot.
- [ ] Start `pnpm merchant:dev`, `pnpm checkout:dev`, `pnpm store:dev` in the background; confirm
      all three load before recording starts.
- [ ] Open Blockscout (CC3) and Etherscan (Sepolia) in separate tabs, pre-navigated to the
      `CreditImporterASC` and `HanaCreditAttestor` addresses respectively, so a tx shows up
      immediately on refresh instead of needing to search.
- [ ] Have the funded demo wallet ready in the recording browser's extension (real MetaMask or
      similar — not the Playwright mock used for automated testing).
- [ ] Decide the time-compression approach for the ~9-minute attestation wait now (see beat 2)
      before recording, so the cut point is planned rather than improvised.

## Beats

### 0:00–0:45 — Cold open: a wallet with a real Sepolia history, connecting to CC3

- Screen: Checkout Hub (`localhost:3001`) landing page, wallet not yet connected.
- Narration: "This wallet has 14 completed loans and 40 on-time payments — but on Ethereum
  Sepolia, not here. Watch what happens when it connects to Creditcoin."
- Action: click Connect Wallet, approve in the extension, land on the credit profile page.
- On-screen: composite score gauge showing **300** (the protocol's floor for a wallet with zero
  native CC3 activity — this is real, not staged: `CreditRegistry.getProfile` returns the
  bootstrap floor for any address it has never seen).
- Caption: "Score: 300 — floor. No history on this chain yet."

### 0:45–2:00 — Link history: sign on Sepolia, watch the worker, verify on-chain

- Screen: `/link-history` page. Click "Link Ethereum history."
- Action: the flow switches the wallet to Sepolia, prompts a signature for
  `HanaCreditAttestor.snapshot()`, confirms the tx.
- **[RECORD LIVE]** — this is the transaction to capture: note the Sepolia tx hash the wallet
  extension shows after confirmation. Reference shape (same contract, prior run): a `snapshot()`
  tx like `0x87372eb2d5fc828c3b7321d425f59187295d6a5d638d9ca4d95be1d61a6d766d` against
  `HanaCreditAttestor` at
  [`0x89D15677c532eccDf5c8eBff69e38DB13ce966C5`](https://sepolia.etherscan.io/address/0x89D15677c532eccDf5c8eBff69e38DB13ce966C5#code).
- Cut to: the worker terminal (pre-started). Show the log line picking up the new `CreditSnapshot`
  event and entering `ATTEST_WAIT`.
- Cut to: the checkout UI's onboarding screen, showing the "coming back shortly, this takes about
  9 minutes" copy (`hana-ctc-checkout/app/link-history/page.tsx`'s `ATTEST_WAIT` state).
- **Time compression**: don't record 9 real minutes. Either (a) jump-cut with an on-screen
  "⏱ 9 minutes later" caption and splice in footage from a wait you time-lapsed at 20-60x, or
  (b) use a wallet whose block is already attested (like the "excellent"/"thin" demo wallets were,
  after their first run) so the worker resolves in ~30s instead — see
  `planning/demo-fixtures.md`'s "Confirmed: real end-to-end import" section, where an
  already-attested import took ~30 seconds wall time end to end. Option (b) is the safer choice
  for a live-feeling demo that doesn't need a splice.
- Cut to: the worker log reaching `CONFIRMED`, with the CC3 import tx hash printed. Reference
  shape only — `0xc38bf69c7112b3ff26212e5899d2f4acee966c9b171378e9e3b33b9affdfb081` was mined
  against a **prior deployment** of `CreditImporterASC` that no longer exists (the registry was
  redeployed for the pivot's `authorizedReporters` change — see `hana-ctc-pivot.md` §4). Your
  live run today will hit the current `CreditImporterASC` — check
  [`/addresses`](http://localhost:3004/addresses) on the docs site right before recording rather
  than trusting any hardcoded address in this file, this one included.
- Cut to: Blockscout tab, refresh, show the real mined transaction and its logs (the
  `CreditRegistry` score-update event).

### 2:00–2:45 — Score jumps, limit unlocks, "no oracle in the path"

- Screen: back on the checkout dashboard, refresh (proves the state survives a reload — it's
  reading `CreditRegistry` on-chain, not client state).
- On-screen: composite score moves **300 → 786** (the real, measured jump from the "excellent"
  wallet's seeded history — see `planning/demo-fixtures.md`). Available credit limit goes from
  effectively zero to a real non-zero number.
- Narration: "Nobody signed off on this. No oracle posted a price, no committee voted. A
  cryptographic proof of a real Sepolia transaction was verified by a precompile, and this
  contract" — cut to `/integrate`'s code block on the docs site (`localhost:3004/integrate`) —
  "just reads the result. `getCreditLimit(address, asset)` — one view call, from any contract on
  this chain."

### 2:45–4:00 — Checkout: buy something, pay in installments, merchant settles

- Screen: demo store (`localhost:3003`), add a product to cart, checkout.
- **[RECORD LIVE]** — real purchase flow: server-side checkout creates a bill, redirects to
  Checkout Hub's `/pay/[billHash]`, select a 4-installment plan (gated by the just-unlocked
  credit limit), approve + originate. Capture the `LoanManager.originate` tx hash here.
- Cut to: merchant portal (`localhost:3002/bills`), show the bill now marked paid/originated.
- Cut to: checkout dashboard, show the new loan card with its 4 installments and due dates.
- Narration: "The money moved on-chain, into a real `SettlementVault` — the merchant never saw a
  card number, and the credit came from a chain this wallet has never transacted on before."
- Optional 15s add-on: pay one installment from the dashboard, show the score tick up again from
  the on-time payment (native activity now stacking on top of imported history).

### 4:00–4:30 — `getCreditLimit()` from an unrelated contract

- Screen: a terminal, `cast call` (or a short Hardhat console snippet) calling
  `CreditRegistry.getCreditLimit(address, asset)` directly — not through the checkout UI at all.
- Narration: "This isn't a feature of one app. Any contract on Creditcoin can call this today."
- Show the raw returned uint, then convert it in narration to the same number shown on the
  dashboard a moment ago, to visually tie "app number" to "raw on-chain read."

### 4:30–5:00 — Roadmap + close

- On-screen: quick bullet list — REVOLVING credit lines, more source chains beyond Sepolia,
  mainnet.
- Closing card: project name, DoraHacks BUIDL link (fill in after submission), GitHub link (fill
  in with your actual repo URL — do not use a placeholder).

## Full list of on-screen tx/address references (for lower-third captions)

**These addresses were live as of 2026-09-13, after the PenguinSwap redeploy — but this file is
not the source of truth.** `CreditRegistry`, `CreditImporterASC`, and `LoanManager` have each been
redeployed at least once during this project's pivot work (see `hana-ctc-pivot.md`). Confirm
against [`/addresses`](http://localhost:3004/addresses) on the docs site — it reads live from
`packages/shared/src/generated/cc3.ts`, which is regenerated by `pnpm sync:abis` and cannot drift
the way a hand-typed table like this one can — right before you record, not from this table.

| What | Value |
|---|---|
| `HanaCreditAttestor` (Sepolia) | `0x89D15677c532eccDf5c8eBff69e38DB13ce966C5` |
| `CreditImporterASC` (CC3) | `0x5f344c437Df484FED87bEf2209E3bA748E11879a` |
| `CreditRegistry` (CC3) | `0xf2e70CCAdafD2e8c6285754318e59b7d2a32718B` |
| `LoanManager` (CC3) | `0xc73157b64b7034d9Bd0A69c1ca050E17F3c1C51E` |
| Example prior `snapshot()` tx (against the *original* `HanaCreditAttestor` deployment, unchanged) | `0x87372eb2d5fc828c3b7321d425f59187295d6a5d638d9ca4d95be1d61a6d766d` |
| Example prior import tx (against a **now-superseded** `CreditImporterASC` — shape/length reference only, do not link it on screen) | `0xc38bf69c7112b3ff26212e5899d2f4acee966c9b171378e9e3b33b9affdfb081` |
| Score movement (real, measured, against the prior registry — re-importing on the current registry starts back at 300) | 300 → 786 |
| Measured attestation latency | ~9 minutes (3 independent live measurements, most recently 2026-09-13 against the current deployment — `planning/attestation-latency.md`) |

Use fresh hashes from your actual recording session where the script says **[RECORD LIVE]** — the
`snapshot()` example above is still a live, correct contract; the import-tx example is not (its
contract is gone) and is included only so you know the expected shape/length of what you'll see.
