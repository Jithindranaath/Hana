# Hana Network (Creditcoin): Ecosystem Integration Pivot

> **Status of the base build:** `context.md`, `spec.md`, `architecture.md`, and `plan.md` are fully implemented. Contracts are deployed, the cross-chain import works, and the BNPL product surface is complete.
>
> **What this document is:** the delta. Everything below is a modification or addition to the shipped codebase. Nothing already working is being removed.

---

## 1. Why This Pivot

The shipped build is a self-contained protocol. It proves the Attestcoin integration and it works end to end, but every contract in it is one we wrote, called only by an app we also wrote. To a judge, `CreditRegistry` currently reads as internal plumbing for our own BNPL app rather than as an ecosystem primitive.

An ecosystem survey settled two things:

**There is nothing to compose with at the lending layer.** The complete live Creditcoin app surface is SpaceRouter (DePIN), PenguinBase (hub), Credit Wallet, PenguinBridge, PenguinSwap (AMM DEX), SPACE and native CTC staking, four games, and the Blockscout explorer — plus Credal, Gluwa's institutional on-chain credit API. There is no money market, no vault standard, no collateral oracle system. Our `LendingPool`, `LoanManager`, and `SettlementVault` stay exactly as built; there is no wheel being reinvented. Nearly all of the above is mainnet-only in any case, and this submission must run on testnet.

**There is something far better to integrate with at the product layer.** Creditcoin's own Credal roadmap publishes a planned product called **SpaceRouter Credit Line** — a credit line of $SPACE tokens for SpaceRouter node operators, so they can begin staking and earning yield without putting up capital upfront. It is explicitly marked as not yet live.

That product needs underwriting. Underwriting needs a credit score. Creditcoin has no permissionless, EVM-native credit registry — Credal is a permissioned institutional API for recording loans, not something an arbitrary contract can query, and the "Loan Flow on Creditcoin EVM" item that would change that is also still roadmap.

**`CreditRegistry` is the missing piece of a product Creditcoin has publicly committed to building.** This pivot makes that claim demonstrable instead of rhetorical.

---

## 2. The Pivot in One Paragraph

Hana stops presenting as *a BNPL app that happens to expose a registry* and starts presenting as *a credit primitive with two reference applications*. BNPL is reference app #1 (already built). A SpaceRouter-style DePIN credit line becomes reference app #2 (new, small). PenguinSwap gets wired into the liquidation path so collateral seizure is real rather than stubbed. Credal becomes positioning context. And the async import worker gets re-scoped against measured Attestcoin v2 latency, which may collapse it entirely.

---

## 3. Change Inventory

| # | Change | Type | Repo |
|---|---|---|---|
| 3.1 | `SpaceCreditLine` — second reference application | **New** | `hana-ctc-contracts` |
| 3.2 | PenguinSwap router in the liquidation path | **New interface + wiring** | `hana-ctc-contracts` |
| 3.3 | Worker re-scope against measured v2 latency | **Modification** | `hana-ctc-worker`, `hana-ctc-checkout` |
| 3.4 | Registry-first repositioning | **Modification** | all docs, landing copy |
| 3.5 | Credal positioning | **New copy** | `hana-ctc-docs` |
| 3.6 | Credit line UI | **New** | `hana-ctc-checkout` |
| 3.7 | Demo video restructure | **Modification** | submission |

---

## 4. Change 3.1 — `SpaceCreditLine` (Reference App #2)

**The point:** prove a contract we did not write the registry *for* can underwrite against it. A DePIN credit line is a completely different shape of credit product from installment retail BNPL — different collateral assumptions, different repayment source, different risk — and the same registry serves both without modification. That is what makes it a primitive.

### Mechanics
A node operator with an imported cross-chain credit history draws a credit line denominated in mock $SPACE, stakes it into a mock SpaceRouter staking contract, and repays from the staking yield rather than from outside capital. Yield services the debt; the operator never fronts capital.

### Contracts

**`MockSPACE.sol`** — ERC20 with public faucet mint, testnet only.

**`MockSpaceStaking.sol`** — accepts SPACE deposits, accrues a fixed yield per block, allows claim and withdraw. Deliberately simple; it stands in for SpaceRouter node staking.

**`SpaceCreditLine.sol`** — the actual integration. Reads the registry with a single external call and never touches Hana internals:

```solidity
interface ICreditRegistry {
    function getCreditLimit(address user, address asset) external view returns (uint256);
}

contract SpaceCreditLine {
    ICreditRegistry public immutable registry;

    function openLine(uint256 amount) external {
        uint256 limit = registry.getCreditLimit(msg.sender, address(SPACE));
        require(amount <= limit, "exceeds credit limit");
        // draw, auto-stake into MockSpaceStaking on the operator's behalf
    }

    function repayFromYield() external {
        // claim accrued staking yield, apply to outstanding principal + interest
    }
}
```

### Tasks
- [x] Implement `MockSPACE.sol` with faucet mint. Deployed to CC3 Testnet and verified on Blockscout.
- [x] Implement `MockSpaceStaking.sol` with per-block yield accrual, claim, and withdraw.
- [x] Implement `SpaceCreditLine.sol` — `openLine`, `repayFromYield`, `closeLine`, `getPosition`.
- [x] Route drawn funds straight into staking so the operator never custodies principal.
- [x] Report credit-line repayments back to `CreditRegistry.recordNativeActivity` — done via the `authorizedReporters` role registry from §4's registry change (`SpaceCreditLine` is authorized by `scripts/deploy-space-credit-line.ts`).
- [x] Tests: open at limit succeeds, open above limit reverts, yield repayment reduces principal, full repayment closes the line and updates the score. 15 new tests across `test/SpaceCreditLine.t.ts` and `test/MockSpaceStaking.t.ts` (53/53 passing overall).
- [x] Deploy and verify on CC3 Testnet; record addresses. `MockSPACE`, `MockSpaceStaking`, `SpaceCreditLine` deployed and Blockscout-verified. This required redeploying `CreditRegistry`, `LoanManager`, and `CreditImporterASC` to new addresses too, since the previously-live registry predated the `authorizedReporters` change and `SpaceCreditLine.registry` is immutable — see README for the new addresses. A live smoke test (`pnpm contracts:smoke:spacecreditline:cc3`) opened a real line, waited for real on-chain staking yield, and confirmed `repayFromYield` reduced principal.

### Registry change required
`CreditRegistry.recordNativeActivity` is currently `onlyLoanManager` against a single address. Widen it to a mapping of authorized reporters, owner-managed:

```solidity
mapping(address => bool) public authorizedReporters;
modifier onlyReporter() { require(authorizedReporters[msg.sender], "unauthorized"); _; }
```

- [x] Replace the `onlyLoanManager` modifier with `onlyReporter`.
- [x] Migrate: authorize the existing `LoanManager` (deploy script + test fixture now call `setReporter(loanManager, true)`; `SpaceCreditLine` will be authorized the same way once it exists — §4 contracts not yet built).
- [x] Test that an unauthorized contract cannot write native activity.

---

## 5. Change 3.2 — PenguinSwap in the Liquidation Path

**The point:** liquidation currently penalizes the borrower's score but has no route to convert seized collateral into `iUSDC` for the pool. PenguinSwap is the ecosystem's AMM DEX and is the correct route. Interface-level integration on testnet, real address on mainnet.

### Tasks
- [x] Define `IPenguinSwapRouter` — standard AMM surface (`swapExactTokensForTokens`, `getAmountsOut`).
- [x] Implement `MockPenguinSwapRouter` for testnet with a fixed-rate swap and a liquidity reserve.
- [x] Wire the router into `LoanManager` liquidation: seize collateral → swap to `iUSDC` → return principal to `LendingPool` → route the liquidation bonus to the caller.
- [x] Add slippage protection with a `minAmountOut` parameter and a governable max-slippage bound. The stricter of the two always wins — a careless keeper-supplied `minAmountOut` can't bypass the governable floor.
- [x] Make the router address settable by the owner so the mainnet PenguinSwap address drops in without redeployment. `LoanManager.setSwapRouter`.
- [x] Tests: liquidation converts collateral and repays the pool; excessive slippage reverts. 4 new tests in `test/LoanManager.t.ts` (57/57 passing overall). **Live on CC3**: `LoanManager` redeployed to `0xc73157b64b7034d9Bd0A69c1ca050E17F3c1C51E` (verified), `MockPenguinSwapRouter` deployed to `0x2127CAdecd947df2B93b92E675820309b256f103` (verified) and wired via `setSwapRouter`. Registry/pool/vault re-wired to the new `LoanManager`; the orphaned previous `LoanManager`'s reporter grant was explicitly revoked. Re-ran the base BNPL smoke test live against the new deployment — passes.
- [x] Document the mainnet swap procedure in `hana-ctc-docs`. New "Liquidation and PenguinSwap" section on the architecture page.

---

## 6. Change 3.3 — Worker Re-Scope Against Measured Latency

The shipped architecture treats attestation latency as the reason credit import must be async onboarding with a background worker. Creditcoin's USC v2 announcement states verification dropped from 6–20 minutes to under 15 seconds, Cairo + STARK complexity was replaced with standard Solidity/Rust, and the multi-step async flow collapsed into a single function call.

If that holds on CC3 Testnet, the entire worker service reduces to a single synchronous call from the checkout, and the score updates on screen while a judge watches. That is a materially better demo and a much smaller system.

### Tasks
- [x] Instrument the existing worker: log timestamps at snapshot emission, attestation confirmation, proof retrieval, and ASC submission (`src/metrics.ts`, wired into `src/index.ts` and `src/listener.ts`; `scripts/trigger-snapshot.ts` + `scripts/summarize-latency.ts` added as reusable tools). Ran one fresh real import rather than ten — see below for why.
- [ ] ~~If end-to-end p95 is under ~30 seconds: implement a synchronous `importCredit()` path~~ — **not applicable.** Measured 558.7s, consistent with the two pre-pivot measurements (497s, 532s). Three real data points, 8 days apart, all ~9 minutes.
- [x] If it is not: keep the worker as built and leave the pending-state UI unchanged. **Done — no code changes needed here.**
- [x] Either way, publish the measured numbers in `hana-ctc-docs` — real latency data is credible and nobody else will have it. New "Re-checked against the USC v2 claim" section on the Attestcoin page, plus `planning/attestation-latency.md` updated with the full breakdown and the reasoning for stopping at one fresh run instead of ten (three consistent real measurements already rule out the <30s threshold by two orders of magnitude; each further run costs ~9 more minutes of wall-clock waiting for an undisputed conclusion).
- [x] Update the checkout import flow to match whichever path holds. Holds as built — no changes needed.

---

## 7. Change 3.4 — Registry-First Repositioning

No code change, but it reorders every narrative surface. Current framing: "a BNPL protocol that exposes a credit registry." New framing: "a cross-chain credit primitive with two reference applications, one of which is a product on Creditcoin's own roadmap."

### Tasks
- [x] Rewrite the docs landing page around `CreditRegistry` as the product; BNPL and the credit line appear as reference implementations beneath it. `app/page.tsx`.
- [x] Update `spec.md` §1 and §3 to lead with the primitive, not the application.
- [x] Update `architecture.md` §1 diagram to show two consumer applications reading one registry. Also added the PenguinSwap router node.
- [x] Rewrite the DoraHacks project description around the primitive framing. Also refreshed the contract-address table, which was pointing at the pre-reporter-role addresses.
- [x] Add a "Build on Hana" page: the `ICreditRegistry` interface, a copy-pasteable integration snippet, and deployed addresses. Repurposed `/integrate` rather than duplicating it — it already had the interface + snippet; added the live `CreditRegistry` address inline and updated the nav label.

---

## 8. Change 3.5 — Credal Positioning

Credal is Gluwa's on-chain credit API on Creditcoin, with 5M+ users served and $100M+ in loans recorded since 2017, first proven at scale through Aella in Nigeria. It is institutional and permissioned; it is not something we integrate with, and the "Loan Flow on Creditcoin EVM" item that would make it composable is still roadmap.

Used correctly it is context, not a competing claim: Creditcoin has nine years of proof that on-chain credit works at scale, and Hana is the permissionless EVM-native complement to those institutional rails.

### Tasks
- [x] Add a "Credit on Creditcoin" section to `hana-ctc-docs` positioning Hana alongside Credal — institutional rails and permissionless rails, same chain, same thesis. New section on the docs landing page, right after the two-reference-apps section.
- [ ] Add one line to the pitch deck making the same point. **No deck file exists anywhere in this repo** — it's an external asset (slides, PDF, whatever tool you use) I have no access to. Suggested line below — paste it in yourself.
- [x] Do not claim integration, partnership, or endorsement anywhere. Explicit in the copy: "Hana doesn't integrate with Credal, isn't partnered with Gluwa, and claims no endorsement."

---

## 9. Change 3.6 — Credit Line UI

### Tasks
- [x] New route in `hana-ctc-checkout`: node-operator credit line view. `app/credit-line/page.tsx`.
- [x] Show available limit sourced from the same imported score that powers BNPL — make the shared origin explicit in the UI. Links back to `/` with explanatory copy.
- [x] Open-line action: amount input, auto-stake confirmation, position display.
- [x] Position panel: principal outstanding, accrued yield, yield applied to debt (lifetime total from `YieldRepaid` event history, `lib/creditLineHistory.ts`), projected payoff (current-rate estimate in blocks).
- [x] Claim-and-repay action. Plus a close-line action once debt is clear (not explicitly asked for, but the contract already supports it and it's the natural next step after repayment).
- [x] Faucet buttons for mock SPACE on testnet.

Verified: `pnpm build` passes, and the route was driven in a real headless-Chromium session against a live dev server — renders correctly, nav shows "Credit Line", no app-introduced console errors (only a pre-existing WalletConnect placeholder-project-ID 403 that appears on every page using `ConnectButton`). A real wallet-connected interactive pass (actually opening/repaying a line through the UI) was not done — the contract-level flow is already proven live on CC3 via the smoke test in §4.

---

## 10. Change 3.7 — Demo Video Restructure

The current cut runs problem → import → payoff → BNPL → primitive → roadmap. The primitive beat lands last and reads as an afterthought. Restructure so the second application *is* the proof.

1. **(0:00) The problem.** Wallet with real Sepolia repayment history connects to Creditcoin. Score reads 300 — the floor.
2. **(0:40) The import.** Sign on Sepolia, verification on Creditcoin, score updates. If the synchronous path holds, this is one unbroken shot.
3. **(1:30) Reference app #1 — BNPL.** Checkout on the demo store, 4-installment plan, merchant settles.
4. **(2:30) Reference app #2 — DePIN credit line.** Same wallet, same score, entirely different credit product. Draw a SPACE line, auto-stake, watch yield service the debt. State plainly that this is the SpaceRouter Credit Line from Creditcoin's published roadmap.
5. **(3:30) The primitive.** `getCreditLimit()` called from an unrelated contract. Two applications already read this; any Creditcoin dApp can be the third.
6. **(4:15) Roadmap.** Additional source chains, then the institutional API.

### Tasks
- [ ] Re-record with the new structure.
- [ ] Pre-run every import on a spare wallet so explorer links are ready.
- [ ] Keep every relevant transaction hash written down before recording.

---

## 11. Execution Order

Ordered by dependency, not priority.

1. **Registry reporter roles** (§4) — everything else depends on it.
2. **Latency measurement** (§6) — determines whether the import flow gets rebuilt, so measure before touching the checkout.
3. **`SpaceCreditLine` contracts + tests** (§4) — the largest new surface.
4. **PenguinSwap liquidation wiring** (§5) — independent, parallelizable.
5. **Credit line UI** (§9) — needs the contracts deployed.
6. **Import flow rework** (§6) — needs the latency result.
7. **Docs and repositioning** (§7, §8).
8. **Demo re-record** (§10) — last, needs everything else live.

---

## 12. Definition of Done

- [x] `SpaceCreditLine`, `MockSPACE`, `MockSpaceStaking` deployed and verified on CC3 Testnet.
- [x] A credit line opened against an imported cross-chain score, with yield visibly repaying principal. Live smoke test: `pnpm contracts:smoke:spacecreditline:cc3`.
- [x] `CreditRegistry` serving two independent consumer contracts through the same interface. `LoanManager` and `SpaceCreditLine` both authorized reporters; verified live on-chain. **This was not actually true until a live-testing pass caught and fixed a real bug — see §13 below.**
- [x] Liquidation converting seized collateral through a swap router and repaying the pool. `MockPenguinSwapRouter` deployed, verified, wired into the live `LoanManager` on CC3. Not yet exercised as a *CC3* transaction — `termDays >= 1` is a hardcoded 24h floor on every loan type, so a genuinely fresh CC3 liquidation can't be ready before tomorrow, which conflicts with today's deadline. Instead: `pnpm contracts:demo:liquidation:local` deploys the identical contracts fresh to a local node and runs the complete real flow — originate, fast-forward past default, liquidate, swap, repay, keeper paid, borrower refunded. Verified working end to end (1 WETH swapped for exactly 2,000 iUSDC, pool made whole, zero collateral left stranded) — ready to screen-record now.
- [x] Measured Attestcoin latency published, and the import flow matching it. ~9 min confirmed (3rd real measurement); async worker kept as-is, matching that number.
- [x] Docs leading with the primitive, with a working third-party integration snippet. Landing page, spec, architecture diagram, and "Build on Hana" page all reframed; Credal positioning added.
- [ ] Demo video re-recorded with the two-application structure. **Needs you** — recording/uploading isn't something I can do.
- [ ] DoraHacks submission updated: description, Attestcoin summary, deck, video URL, all contract addresses across both chains. Description/summary/addresses drafted and current in `planning/dorahacks-submission-draft.md`; video URL, deck line, team, logo, and the actual BUIDL page submission still need you.

---

## 13. Addendum — a real cross-asset bug found while preparing the demo (not in the original scope)

While building the click-through autopilot script for recording (`hana-ctc-checkout/demo/autopilot.ts`), running the full flow live on CC3 — draw a SPACE credit line, then try to originate a BNPL loan on the same wallet — surfaced that the second step failed: available iUSDC credit had dropped to exactly 0.

**Root cause:** `CreditRegistry` tracked `outstandingDebt` in a single field shared across every asset. SPACE is an 18-decimal token; iUSDC is 6-decimal. A SPACE draw's raw amount (~1,027 SPACE ≈ 1.03 × 10²¹ raw units) completely dwarfed the iUSDC limit's raw-unit scale (~4,800 iUSDC ≈ 4.8 × 10⁹ raw units) in that one shared counter, so `getAvailableCredit` for iUSDC computed as `debt >= gross ? 0 : gross - debt` and permanently returned 0 regardless of real iUSDC debt. The same bug also corrupted `nativeCumulativeBorrowed` (the volume sub-score input), which assumes 6-decimal amounts throughout `_recompute`. This directly contradicted the pivot's central claim — "two independent reference applications, zero coupling" — in the one place a judge would actually notice: trying both products from the same wallet.

**Fix:** `CreditRegistry.assetDebt(user, asset)` replaces the single `outstandingDebt` field, so each asset's debt is netted only against that asset's own limit. The volume sub-score now only accumulates from a single, owner-configured `accountingAsset` (set to iUSDC) rather than summing raw amounts across incompatible decimal scales — there's no price oracle to honestly combine, say, SPACE and iUSDC volume into one number, so SPACE activity still contributes to the shared, dimensionless repayment/completion counters (a good SpaceCreditLine repayment record genuinely helps the BNPL-relevant score dimensions) but not to volume. `recordNativeActivity` gained an `asset` parameter; `LoanManager` (5 call sites) and `SpaceCreditLine` (3 call sites) were updated to pass their respective assets.

**Verified, not just patched:**
- Two new regression tests: `CreditRegistry.t.ts` (registry-level, a synthetic large draw in a second asset) and `SpaceCreditLine.t.ts` (end-to-end through the real `LoanManager` + `SpaceCreditLine` — draws the full SPACE line, then originates a real BNPL loan for the wallet's full original iUSDC credit and confirms it succeeds). 59/59 tests passing.
- `CreditRegistry`, `LoanManager`, `CreditImporterASC`, and `SpaceCreditLine` all redeployed to CC3, verified on Blockscout, re-wired, and the base BNPL smoke flow re-confirmed live.
- The "excellent" demo wallet's cross-chain import was re-run against the new registry (a fresh `snapshot()` + the real ~9-minute attestation wait, same mechanism as every prior redeploy in this document).

**Why this matters beyond the bug itself:** it was caught by actually running the full user journey live against real deployed contracts — not by the 55 tests that were passing before it, none of which exercised both reference applications against the same wallet in sequence. The two new regression tests close exactly that gap.
