# Hana Network (Creditcoin): Project Context

## Overview
Hana is a **cross-chain credit layer** built on **Creditcoin (CC3 Testnet)**. It lets a wallet prove its lending/repayment history from another chain — via the **Attestcoin Protocol** — and borrow against that imported credit on Creditcoin. A **Buy Now, Pay Later (BNPL)** checkout flow ships as the reference application that demonstrates the primitive end-to-end.

This is a pivot of an existing Algorand project (`Hana Network`). The scoring algorithm, installment logic, utilization-based rate curve, LP mechanics, and liquidation triggers all carry over unchanged — only the chain, the contract language, and the credit-import mechanism change.

> **Hackathon:** BUIDL CTC 2026 Fall (DoraHacks) — Track: DeFi (RWA secondary)
> **Chain:** Creditcoin CC3 Testnet (EVM L1)
> **Core feature:** Attestcoin Protocol integration

---

## Repositories & Roles

### 🏗️ `hana-ctc-contracts`
* **Role:** Core protocol logic on Creditcoin.
* **Stack:** Solidity ^0.8.23, Hardhat, OpenZeppelin.
* **Contents:** `CreditRegistry` (credit scoring and limits), `LendingPool` (liquidity + LP shares), `LoanManager` (loan lifecycle, all loan types), `SettlementVault` (merchant settlement), `CreditImporterASC` (the Attestcoin integration).

### 🌉 `hana-ctc-attestor`
* **Role:** Source-chain contract, deployed on **Ethereum Sepolia** (`chainKey: 1` on CC3 Testnet, confirmed at runtime via `getSupportedChains()`).
* **Stack:** Solidity, Hardhat.
* **Contents:** `HanaCreditAttestor` — reads a user's local lending history and emits a single aggregated `CreditSnapshot` event per import.

### ⚙️ `hana-ctc-worker`
* **Role:** Off-chain orchestrator — listens for `CreditSnapshot` events, waits for attestation, fetches proofs, submits them to `CreditImporterASC` on Creditcoin.
* **Stack:** Node.js, `@gluwa/usc-sdk`, ethers v6.
* **Contents:** Event listener, attestation poller, proof fetcher, ASC submission with retry and dedupe logic.

### 🌐 `hana-ctc-checkout`
* **Role:** The Settlement Hub / Checkout UI — the evolution of `hana-core`.
* **Stack:** Next.js, wagmi + viem + RainbowKit.
* **Contents:** Wallet connection, credit-score display, installment plan selection, "Link your history" onboarding flow, transaction signing.

### 🏪 `hana-ctc-merchant`
* **Role:** Merchant Dashboard — the evolution of `hana-merchant-app-next-js`.
* **Stack:** Next.js, MongoDB.
* **Contents:** Merchant API keys, bill creation endpoint, revenue dashboard, settlement history.

### 🛒 `hana-ctc-store`
* **Role:** Demo Storefront — the evolution of `hana-shopping-app`.
* **Stack:** Next.js, Framer Motion.
* **Contents:** Reference merchant integration showing "Pay with Hana" at checkout.

### 📄 `hana-ctc-docs`
* **Role:** Protocol documentation and the Attestcoin technical write-up.
* **Stack:** Next.js, MDX.
* **Contents:** Architecture, the `CreditImporterASC` security model, deployed contract addresses, and a guide for third-party dApps reading `CreditRegistry`.

---

## Key Technical Facts (Source of Truth)

| Feature | Algorand (prior) | Creditcoin (this build) |
|---|---|---|
| **Chain** | Algorand Testnet | Creditcoin CC3 Testnet (EVM L1) |
| **Contract language** | PuyaTS | Solidity |
| **Tooling** | AlgoKit | Hardhat |
| **Wallet layer** | `@txnlab/use-wallet-react` | wagmi + viem |
| **Asset standard** | ASA | ERC20 |
| **State storage** | Box storage | Mappings |
| **Database** | MongoDB | MongoDB |
| **Credit import mechanism** | None | Attestcoin Protocol, precompile `0x0FD2` |
| **RPC** | Algorand node | `https://rpc.cc3-testnet.creditcoin.network` |
| **Prover** | — | `https://prover.cc3-testnet.creditcoin.network` |

---

## What Carries Over From the Algorand Build

The scoring algorithm (300–850 composite, dimension weights), installment schedule logic, utilization-based interest rate curve, LP share mechanics, and liquidation triggers are chain-agnostic design work and port directly. The full product surface — checkout flow, merchant dashboard, demo storefront — ports in structure, with the wallet and chain-interaction layers rewritten for EVM.

Three previously known Algorand bugs are resolved by the change of virtual machine rather than by direct fixes:

1. **Missing `@abimethod` decorators** on `CreditScore` update methods — Solidity methods are `public`/`external` with no equivalent restriction.
2. **Inner-transaction group reference bug** in `BNPLCredit.make_payment` — atomic transaction groups don't exist on EVM; this becomes a plain external call.
3. **MBR (Minimum Balance Requirement) deployment friction** — no MBR concept on EVM; no `bootstrap → fund → create_assets` sequencing required.

---

## The Attestcoin Integration

Attestcoin verifies that a transaction happened on a source chain via a Merkle inclusion proof plus a continuity proof, checked synchronously by a precompile at `0x0FD2` — no oracle operator, no bridge, no multisig committee.

Hana uses this to let a user prove their lending/repayment history from Ethereum Sepolia and have it recognized as creditworthiness on Creditcoin. `HanaCreditAttestor` emits one aggregated `CreditSnapshot` event per import (not one proof per historical transaction — batch proofs cap at 10 transactions within a 1000-block range, so a full history is summarized rather than replayed). `CreditImporterASC` verifies the snapshot via the precompile and writes the imported profile into `CreditRegistry`.

Credit import is an onboarding action, not a checkout-path operation: the user links their history once, the worker handles attestation and proof submission asynchronously, and the score becomes available in `CreditRegistry` for instant reads afterward. Checkout always reads the already-imported score — it never waits on a live cross-chain proof.
