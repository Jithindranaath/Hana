# Hana Network (Creditcoin): Project Specification

## 1. Project Vision
Hana is a **cross-chain credit layer** on **Creditcoin**, providing portable financial identity and accessible credit. A wallet proves its lending and repayment history from another chain using the **Attestcoin Protocol**, and borrows against that history on Creditcoin. A **Buy Now, Pay Later (BNPL)** checkout ships as the reference application demonstrating the primitive end-to-end.

Hana is infrastructure first, application second. `CreditRegistry` is a public good — any Creditcoin dApp can call `getCreditLimit(address, asset)` and act on an attested, multi-chain credit profile.

---

## 2. Problem Statement
* **Credit history is chain-local.** A wallet with two years of clean repayments on Ethereum arrives on Creditcoin as an anonymous address and is treated as a stranger. Every new chain resets everyone's creditworthiness to zero.
* **The usual fix reintroduces trust.** Porting credit across chains normally requires a centralized oracle or an attestation service you have to trust — the exact intermediary decentralized credit is meant to remove.
* **Credit accessibility.** Traditional credit systems are exclusionary and slow, especially for the unbanked.
* **Merchant risk.** Merchants face volatility and settlement delays when offering credit.

---

## 3. Solution Overview
Hana provides a unified credit infrastructure where:
1. **Shoppers** import their cross-chain credit history cryptographically, then purchase goods using installments.
2. **Lenders** provide liquidity to a pool and earn yield from protocol fees and interest.
3. **Merchants** receive immediate or escrowed settlement, increasing sales conversion.
4. **Credit scoring** is handled on-chain via a transparent, behavior-based algorithm that spans multiple chains.
5. **Other protocols** read `CreditRegistry` directly as a shared ecosystem primitive.

### Why Creditcoin
The Attestcoin Protocol verifies that a transaction occurred on a source chain using a Merkle inclusion proof plus a continuity proof, checked synchronously by a precompile at `0x0FD2`. This makes portable credit a cryptographic claim rather than a trust assumption. On any other chain this design requires a trusted oracle operator.

---

## 4. Key Entities

### 4.1 The Shopper
* **Roles:** Imports cross-chain credit history, borrows for purchases, repays installments, builds native credit history.
* **Incentive:** Credit access without a bank, and a credit score that follows them across chains rather than resetting.

### 4.2 The Merchant
* **Roles:** Integrates Hana checkout, initiates payment bills, receives funds.
* **Incentive:** Increased conversion rates and access to a global Web3 customer base.

### 4.3 The Lender
* **Roles:** Deposits assets (`iUSDC`) into the Lending Pool, receives LP shares.
* **Incentive:** Earns yield from loan interest and late fees.

### 4.4 The Integrating Protocol
* **Roles:** Reads `CreditRegistry` to underwrite its own users.
* **Incentive:** Instant access to a multi-chain credit graph without building attestation infrastructure.

---

## 5. Technical Requirements

### 5.1 Blockchain Layer (Creditcoin CC3 Testnet)
* **Contracts:** Solidity ^0.8.23, Hardhat, OpenZeppelin.
* **Assets:** Primary transaction asset is `iUSDC` (ERC20, faucet-mintable on testnet). LP shares are ERC20 (ERC-4626 compatible).
* **Storage:** Mappings for credit profiles, loan records, and per-user loan lists.
* **RPC:** `https://rpc.cc3-testnet.creditcoin.network`

### 5.2 Attestation Layer (Attestcoin Protocol)
* **Precompile:** `0x0FD2` — synchronous verification of Merkle inclusion + continuity proofs.
* **SDK:** `@gluwa/usc-sdk` (peer dependency: ethers v6).
* **Prover:** `https://prover.cc3-testnet.creditcoin.network`
* **Source chain:** Ethereum Sepolia, `chainKey: 1`, resolved at runtime via `getSupportedChains()`.
* **Pattern:** Separated ASC — `CreditImporterASC` is distinct from business logic, keeping `CreditRegistry` reusable by other protocols.

### 5.3 Backend Layer
* **Framework:** Next.js (Server Actions & API Routes) for the merchant API.
* **Database:** MongoDB for merchant applications, API keys, and bill metadata.
* **Worker:** Node.js service handling attestation waits, proof retrieval, and ASC submission.

### 5.4 Frontend Layer
* **Checkout Hub:** Portal for credit import, loan initiation, and signature management.
* **Merchant Portal:** Dashboard for API keys, bills, and settlement history.
* **Demo Store:** Reference merchant integration.
* **Wallet:** wagmi + viem + RainbowKit.

---

## 6. Functional Requirements

### 6.1 Credit Protocol
* **Scoring Algorithm:** Composite score ranges from **300 to 850**.
* **Dimensions (0–1000 each, governable weights):**
  * `repaymentScore` — on-time repayment history
  * `volumeScore` — cumulative borrow volume
  * `tenureScore` — wallet age and protocol tenure
* **Score Factors:** Initial bootstrap, lending pool deposits (bonus), on-time repayments (bonus), late repayments (penalty), defaults (heavy penalty), imported cross-chain history (weighted contribution).
* **Imported vs. native weighting:** Attested foreign history is weighted below native Creditcoin activity, since it was earned under a different protocol's risk parameters.
* **Borrow Limits:** Dynamically calculated from the composite score via `getCreditLimit(address, asset)`.

### 6.2 Cross-Chain Credit Import
1. **Snapshot:** User triggers `HanaCreditAttestor` on the source chain, which reads their local history and emits one aggregated `CreditSnapshot` event.
2. **Attestation:** The worker waits for the source block to be attested on Creditcoin.
3. **Proof:** The worker retrieves the Merkle inclusion proof and continuity proof from the prover.
4. **Verification:** `CreditImporterASC` verifies the proof via precompile `0x0FD2`, decodes the event, and applies its security checks.
5. **Write:** The verified snapshot is written into `CreditRegistry`, raising the user's composite score.

**Import is asynchronous onboarding.** Checkout reads the already-imported score from local state via a single `view` call and never blocks on a live cross-chain proof.

### 6.3 Loan Lifecycle
1. **Initiate:** Merchant creates a bill; user signs a transaction to borrow the principal from the Lending Pool.
2. **Settlement:** Funds route to `SettlementVault` (time-locked) or pay the merchant directly.
3. **Repay:** User pays installments on schedule.
4. **Completion:** On final payment the loan closes and the credit score updates.
5. **Default / Liquidation:** If a loan is overdue, any user can trigger liquidation, penalizing the borrower's score.

**Loan types:** `INSTALLMENT` (BNPL), `REVOLVING` (credit line, draw/repay anytime), `TERM` (bullet loan, full repay at maturity), `OVERCOLLATERALIZED` (no credit score required).

### 6.4 Lending & Yield
* **Liquidity Provision:** Users deposit `iUSDC` and receive LP share tokens.
* **Utilization Rate:** Interest rates scale with pool utilization on a kinked curve — gentle slope to 80% utilization, steep beyond.
* **Yield Distribution:** Lenders earn a portion of interest paid by borrowers.

### 6.5 Security Model — `CreditImporterASC`
Four checks, each with a committed negative test:
1. **Replay protection.** Key on `keccak256(chainKey, blockHeight, transactionIndex)`; reject duplicates before any other processing. The protocol does not deduplicate for you.
2. **Receipt status.** The prover confirms inclusion in a block, not success. Require `receipt.receiptStatus == 1` to avoid importing the results of a reverted transaction.
3. **Emitter address.** Confirm the log originated from the known `HanaCreditAttestor` address for that `chainKey`, so a lookalike contract cannot mint itself a high score.
4. **Nonce monotonicity.** Require `snapshotNonce > importNonces[chainKey][subject]`, preventing replay of an older, more favorable snapshot.
