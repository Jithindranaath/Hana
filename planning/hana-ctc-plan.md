# Hana Network (Creditcoin): Implementation Plan

> **Window:** September 4 → September 13, 2026 (submission deadline 23:59 ET)
> **Sequencing principle:** build the unfamiliar thing first. The Solidity port is estimable work; the Attestcoin integration is not, and it is the core scoring criterion.

---

## 1. Phase 1: Attestcoin Integration (Days 1–2)
**Goal:** A trivial event on Sepolia round-trips to a verified state change on Creditcoin.

### 1.1 Environment
- [ ] Get CC3 testnet CTC from the faucet; get Sepolia ETH from a faucet.
- [ ] Configure Hardhat for both networks — Creditcoin RPC `https://rpc.cc3-testnet.creditcoin.network`, Sepolia.
- [ ] Install `@gluwa/usc-sdk` and ethers v6.
- [ ] Resolve Sepolia's `chainKey` at runtime via `getSupportedChains()`.

### 1.2 Round-Trip Spike
- [ ] Run the `hello-bridge` example from `gluwa/usc-testnet-bridge-examples` unmodified, end to end.
- [ ] Deploy a throwaway contract on Sepolia emitting a trivial event.
- [ ] Deploy a throwaway ASC on Creditcoin verifying it via precompile `0x0FD2`.
- [ ] Script the full path: emit → `waitUntilHeightAttested` → `getProof` → `verifySingle`.
- [ ] **Measure and record real attestation latency.** This number drives the onboarding UX and the demo plan.

### 1.3 Production Attestor
- [ ] Implement `HanaCreditAttestor` on Sepolia with the `CreditSnapshot` event and `snapshotNonce` counter.
- [ ] Seed realistic lending history on Sepolia so snapshots are non-trivial.
- [ ] Deploy and verify on Sepolia; record the address.

---

## 2. Phase 2: Core Protocol (Days 3–5)
**Goal:** The full lending and credit protocol live on CC3 Testnet.

### 2.1 Assets & Registry
- [ ] `iUSDC` — mock ERC20 with a public faucet mint for testnet.
- [ ] `CreditRegistry` — `CreditProfile` struct, multi-dimensional scoring math (300–850 composite), `getCreditLimit(address, asset)`, `getProfile(address)`.
- [ ] Access control: `recordNativeActivity` restricted to `LoanManager`; `importAttestedHistory` restricted to `CreditImporterASC`.
- [ ] Weight imported history below native history in the composite calculation.

### 2.2 Lending & Loans
- [ ] `LendingPool` — deposit/withdraw, ERC20 LP shares, kinked utilization curve (gentle to 80%, steep beyond), yield accrual.
- [ ] `LoanManager` — loan type enum (`INSTALLMENT`, `REVOLVING`, `TERM`, `OVERCOLLATERALIZED`), origination, installment scheduling, repayment, completion, default marking, liquidation.
- [ ] `SettlementVault` — time-locked and conditional merchant settlement release, refund path.

### 2.3 The Importer
- [ ] `CreditImporterASC` with `importFromQuery(chainKey, blockHeight, encodedTransaction, merkleRoot, siblings, lowerEndpointDigest, continuityRoots)`.
- [ ] Security checks, in order: replay key `keccak256(chainKey, blockHeight, transactionIndex)` → receipt status `== 1` → emitter address matches known attestor for that `chainKey` → `snapshotNonce > importNonces[chainKey][subject]`.
- [ ] Decode the `CreditSnapshot` log and write to `CreditRegistry`.

### 2.4 Tests & Deployment
- [ ] Full lifecycle tests: deposit → borrow → repay → complete, for each loan type.
- [ ] Liquidation tests: overdue loan → liquidation trigger → score penalty.
- [ ] Negative tests on the importer, committed to the repo: replayed proof rejected, reverted source transaction rejected, wrong emitter rejected, stale nonce rejected.
- [ ] Deploy all contracts to CC3 Testnet; record and publish addresses.

---

## 3. Phase 3: The Worker (Day 6)
**Goal:** Cross-chain import runs unattended, end to end.

- [ ] Event listener on Sepolia for `CreditSnapshot`.
- [ ] Attestation poller using `waitUntilHeightAttested`.
- [ ] Proof retrieval from `https://prover.cc3-testnet.creditcoin.network`.
- [ ] `importFromQuery` submission to `CreditImporterASC` with retry and exponential backoff.
- [ ] Dedupe in-flight imports; persist job state so restarts don't double-submit.
- [ ] Status endpoint the frontend polls for pending/complete state.
- [ ] End-to-end verification: Sepolia history → attested → verified → score visible in `CreditRegistry`.

---

## 4. Phase 4: Product Surface (Days 7–8)
**Goal:** The complete user-facing product on Creditcoin.

### 4.1 Checkout Hub (`hana-ctc-checkout`)
- [ ] Swap the wallet layer to wagmi + viem + RainbowKit; point at CC3 Testnet.
- [ ] Credit profile view — composite score plus the dimension breakdown.
- [ ] "Link your Ethereum history" onboarding flow with a pending state driven by the worker status endpoint.
- [ ] Installment plan selection and loan origination against the imported limit.
- [ ] Repayment dashboard — active loans, schedules, pay-installment action.

### 4.2 Merchant Portal (`hana-ctc-merchant`)
- [ ] Port to Creditcoin; keep MongoDB.
- [ ] Bill creation endpoint returning `billHash` and `checkoutUrl`.
- [ ] Update chain identifiers in API responses to Creditcoin, with Sepolia retained as the source-chain identifier.
- [ ] API key management, settlement history, revenue dashboard.

### 4.3 Demo Store (`hana-ctc-store`)
- [ ] Point "Pay with Hana" at the new checkout URL.
- [ ] Verify the full storefront → checkout → settlement path.

### 4.4 Lender Interface
- [ ] Deposit and withdraw against `LendingPool`.
- [ ] Display pool utilization, current rates, and LP share position.

---

## 5. Phase 5: Documentation & Submission (Day 9)
**Goal:** Everything a judge needs, in one place.

### 5.1 Documentation (`hana-ctc-docs`)
- [ ] Architecture overview and the cross-chain import flow.
- [ ] **Attestcoin integration write-up:** how proofs are generated, verified via `0x0FD2`, and the four security checks with links to the negative tests.
- [ ] Deployed contract addresses on both chains.
- [ ] Integration guide: how a third-party Creditcoin dApp reads `CreditRegistry`.
- [ ] README on every repo.

### 5.2 Demo Video
1. **(0:00) The problem.** A wallet with real Sepolia repayment history connects to Creditcoin. Score reads 300 — the floor.
2. **(0:45) The import.** "Link Ethereum history," sign on Sepolia, show the worker log: attestation wait, proof fetch, ASC call. Cut to the verification transaction on the Creditcoin explorer.
3. **(2:00) The payoff.** Score jumps. Credit limit unlocks. Show the profile breakdown — no oracle in the path, only a Merkle proof and a continuity proof.
4. **(2:45) The application.** Checkout on the demo store, 4-installment plan, borrow against the imported limit, merchant settles.
5. **(4:00) The primitive.** `getCreditLimit()` called from an unrelated contract. Any Creditcoin dApp can read this.
6. **(4:30) Roadmap.** Additional source chains, then the institutional API.

**Recording notes:** pre-run the import against a second wallet so explorer links are ready; record the worker terminal separately and time-compress the attestation wait with a visible elapsed-time caption; write down every relevant transaction hash in advance.

### 5.3 Submission
- [ ] Project deck / whitepaper PDF.
- [ ] GitHub repositories public, with READMEs.
- [ ] DoraHacks BUIDL page: description, Attestcoin integration summary, logo, sector (DeFi), demo video URL, team information.
- [ ] Confirm all contracts are deployed and verified on testnet.

---

## 6. Judge Q&A Preparation

**"Isn't this just a bridge?"**
A bridge moves assets and requires trusting a validator set. This moves an attested claim about past behavior and trusts only the proof. Nothing custodial exists in the path.

**"Why not just sign a message claiming your history?"**
A signature proves key control, not that anything happened. The Merkle proof plus continuity proof establish that the transactions were actually included in the source chain's canonical history.

**"How is undercollateralized lending safe here?"**
Conservative limits, imported history weighted below native history, per-account exposure caps, and honest sequencing: bootstrap the credit graph with overcollateralized loans, graduate proven counterparties to undercollateralized credit lines later.

**"What stops me forging a snapshot?"**
Four checks, all in the repo with negative tests: emitter address verification, receipt status, replay key, nonce monotonicity.

**"Why does this need Creditcoin?"**
The verification primitive doesn't exist elsewhere. On any other chain this design requires a trusted oracle operator, reintroducing exactly the intermediary the protocol removes.

---

## 7. Post-Hackathon Roadmap

- Additional source chains beyond Sepolia — each one compounds the credit graph.
- Open-source the scoring algorithm as a verifiable public good.
- B2B institutional API (from `pivot-context.md`): programmatic lending, borrowing, settlement, FX, and treasury yield, with BNPL as one loan type among several.
- Governance contract for rate curves, score weights, and fee parameters.
- Secondary market for LP share tokens.
