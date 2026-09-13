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
- [ ] Implement `MockSPACE.sol` with faucet mint; deploy to CC3 Testnet.
- [ ] Implement `MockSpaceStaking.sol` with per-block yield accrual, claim, and withdraw.
- [ ] Implement `SpaceCreditLine.sol` — `openLine`, `repayFromYield`, `closeLine`, `getPosition`.
- [ ] Route drawn funds straight into staking so the operator never custodies principal.
- [ ] Report credit-line repayments back to `CreditRegistry.recordNativeActivity` — grant `SpaceCreditLine` the loan-manager role, or add a role registry if the existing modifier is single-address.
- [ ] Tests: open at limit succeeds, open above limit reverts, yield repayment reduces principal, full repayment closes the line and updates the score.
- [ ] Deploy and verify on CC3 Testnet; record addresses.

### Registry change required
`CreditRegistry.recordNativeActivity` is currently `onlyLoanManager` against a single address. Widen it to a mapping of authorized reporters, owner-managed:

```solidity
mapping(address => bool) public authorizedReporters;
modifier onlyReporter() { require(authorizedReporters[msg.sender], "unauthorized"); _; }
```

- [ ] Replace the `onlyLoanManager` modifier with `onlyReporter`.
- [ ] Migrate: authorize the existing `LoanManager`, then authorize `SpaceCreditLine`.
- [ ] Test that an unauthorized contract cannot write native activity.

---

## 5. Change 3.2 — PenguinSwap in the Liquidation Path

**The point:** liquidation currently penalizes the borrower's score but has no route to convert seized collateral into `iUSDC` for the pool. PenguinSwap is the ecosystem's AMM DEX and is the correct route. Interface-level integration on testnet, real address on mainnet.

### Tasks
- [ ] Define `IPenguinSwapRouter` — standard AMM surface (`swapExactTokensForTokens`, `getAmountsOut`).
- [ ] Implement `MockPenguinSwapRouter` for testnet with a fixed-rate swap and a liquidity reserve.
- [ ] Wire the router into `LoanManager` liquidation: seize collateral → swap to `iUSDC` → return principal to `LendingPool` → route the liquidation bonus to the caller.
- [ ] Add slippage protection with a `minAmountOut` parameter and a governable max-slippage bound.
- [ ] Make the router address settable by the owner so the mainnet PenguinSwap address drops in without redeployment.
- [ ] Tests: liquidation converts collateral and repays the pool; excessive slippage reverts.
- [ ] Document the mainnet swap procedure in `hana-ctc-docs`.

---

## 6. Change 3.3 — Worker Re-Scope Against Measured Latency

The shipped architecture treats attestation latency as the reason credit import must be async onboarding with a background worker. Creditcoin's USC v2 announcement states verification dropped from 6–20 minutes to under 15 seconds, Cairo + STARK complexity was replaced with standard Solidity/Rust, and the multi-step async flow collapsed into a single function call.

If that holds on CC3 Testnet, the entire worker service reduces to a single synchronous call from the checkout, and the score updates on screen while a judge watches. That is a materially better demo and a much smaller system.

### Tasks
- [ ] Instrument the existing worker: log timestamps at snapshot emission, attestation confirmation, proof retrieval, and ASC submission. Run ten imports and record the distribution.
- [ ] If end-to-end p95 is under ~30 seconds: implement a synchronous `importCredit()` path callable directly from the checkout, with the worker retained only as a retry fallback for failed submissions.
- [ ] If it is not: keep the worker as built and leave the pending-state UI unchanged.
- [ ] Either way, publish the measured numbers in `hana-ctc-docs` — real latency data is credible and nobody else will have it.
- [ ] Update the checkout import flow to match whichever path holds.

---

## 7. Change 3.4 — Registry-First Repositioning

No code change, but it reorders every narrative surface. Current framing: "a BNPL protocol that exposes a credit registry." New framing: "a cross-chain credit primitive with two reference applications, one of which is a product on Creditcoin's own roadmap."

### Tasks
- [ ] Rewrite the docs landing page around `CreditRegistry` as the product; BNPL and the credit line appear as reference implementations beneath it.
- [ ] Update `spec.md` §1 and §3 to lead with the primitive, not the application.
- [ ] Update `architecture.md` §1 diagram to show two consumer applications reading one registry.
- [ ] Rewrite the DoraHacks project description around the primitive framing.
- [ ] Add a "Build on Hana" page: the `ICreditRegistry` interface, a copy-pasteable integration snippet, and deployed addresses.

---

## 8. Change 3.5 — Credal Positioning

Credal is Gluwa's on-chain credit API on Creditcoin, with 5M+ users served and $100M+ in loans recorded since 2017, first proven at scale through Aella in Nigeria. It is institutional and permissioned; it is not something we integrate with, and the "Loan Flow on Creditcoin EVM" item that would make it composable is still roadmap.

Used correctly it is context, not a competing claim: Creditcoin has nine years of proof that on-chain credit works at scale, and Hana is the permissionless EVM-native complement to those institutional rails.

### Tasks
- [ ] Add a "Credit on Creditcoin" section to `hana-ctc-docs` positioning Hana alongside Credal — institutional rails and permissionless rails, same chain, same thesis.
- [ ] Add one line to the pitch deck making the same point.
- [ ] Do not claim integration, partnership, or endorsement anywhere.

---

## 9. Change 3.6 — Credit Line UI

### Tasks
- [ ] New route in `hana-ctc-checkout`: node-operator credit line view.
- [ ] Show available limit sourced from the same imported score that powers BNPL — make the shared origin explicit in the UI.
- [ ] Open-line action: amount input, auto-stake confirmation, position display.
- [ ] Position panel: principal outstanding, accrued yield, yield applied to debt, projected payoff.
- [ ] Claim-and-repay action.
- [ ] Faucet buttons for mock SPACE on testnet.

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

- [ ] `SpaceCreditLine`, `MockSPACE`, `MockSpaceStaking` deployed and verified on CC3 Testnet.
- [ ] A credit line opened against an imported cross-chain score, with yield visibly repaying principal.
- [ ] `CreditRegistry` serving two independent consumer contracts through the same interface.
- [ ] Liquidation converting seized collateral through a swap router and repaying the pool.
- [ ] Measured Attestcoin latency published, and the import flow matching it.
- [ ] Docs leading with the primitive, with a working third-party integration snippet.
- [ ] Demo video re-recorded with the two-application structure.
- [ ] DoraHacks submission updated: description, Attestcoin summary, deck, video URL, all contract addresses across both chains.
