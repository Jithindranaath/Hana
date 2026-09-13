# Hana CTC — Build Workflow (from scratch to submission)

This is the execution plan. It is ordered so that **the riskiest, least-familiar work
happens first** (Attestcoin), and so that **every layer is verified before the layer
that depends on it is started**. Do not skip an acceptance check — a green check is the
permission slip for the next step.

Contract policy for this build: **write the logic, compile it, test it, deploy it, record
the address — then, and only then, wire a frontend to that address.** No UI work begins
against a contract that is not deployed and verified.

---

## 0. Legend

- **DO** — the action.
- **WHY** — what would break if it were done later or skipped.
- **DONE WHEN** — the objective acceptance check.
- **UNBLOCKS** — what may start once this is green.

Repo layout (single git repo, pnpm workspace):

| Folder | Package name | Role |
|---|---|---|
| `hana-ctc-contracts/` | `@hana/contracts` | Core protocol on CC3 (Registry, Pool, LoanManager, SettlementVault, ImporterASC) |
| `hana-ctc-attestor/` | `@hana/attestor` | `HanaCreditAttestor` on Ethereum Sepolia (source chain) |
| `hana-ctc-worker/` | `@hana/worker` | Off-chain orchestrator: event → attest wait → proof → ASC submit |
| `hana-ctc-checkout/` | `@hana/checkout` | Checkout Hub: wallet, score, credit-import onboarding, loans, repayment |
| `hana-ctc-merchant/` | `@hana/merchant` | Merchant portal + bill API (MongoDB) |
| `hana-ctc-store/` | `@hana/store` | Demo storefront ("Pay with Hana") |
| `hana-ctc-docs/` | `@hana/docs` | Protocol docs + Attestcoin write-up |
| `packages/shared/` | `@hana/shared` | Shared TS: chain config, ABIs, address book, types |

Address book: each Hardhat package writes `deployments/<network>.json`
(`{ network, chainId, contracts: { Name: { address, txHash, blockNumber } }, abis: {...} }`).
`pnpm sync:abis` copies ABIs + addresses into `packages/shared/src/generated/`. Frontends and
the worker import **only** from `@hana/shared` — never hand-copy an address.

---

## Phase 0 — Foundations

### 0.1 Monorepo + tooling
- **DO** `pnpm install` at the repo root. Confirm Node ≥ 20.11 (`.nvmrc` = 24).
- **DO** Hardhat packages use Hardhat 2.x + `@nomicfoundation/hardhat-toolbox` + ethers v6 + TypeScript. Solidity `0.8.23`, optimizer on (200 runs), `viaIR: true`.
- **DONE WHEN** `pnpm -r build` runs (empty packages are fine) and `pnpm contracts:build` compiles the checked-in contracts with 0 errors.
- **UNBLOCKS** everything.

### 0.2 Accounts, faucets, RPC sanity
- **DO** Create two throwaway wallets: `CC3_DEPLOYER` and `SEPOLIA_DEPLOYER`. Put keys only in each package's local `.env` (git-ignored).
- **DO** Fund `CC3_DEPLOYER` from the Creditcoin CC3 faucet; fund `SEPOLIA_DEPLOYER` from a Sepolia faucet.
- **DO** `cast block latest --rpc-url $CC3_RPC_URL` (or a tiny ethers script) against both RPCs.
- **DONE WHEN** Both deployer addresses show a non-zero balance and both RPCs return a current block.
- **UNBLOCKS** 0.3, all deploys.

### 0.3 Confirm the unknowns (write the answers into `packages/shared/src/chain.ts`)
These are assumptions until verified on-chain. **Do not hardcode elsewhere until confirmed.**
- **DO** CC3 EVM `chainId` — read it: `provider.getNetwork()`. (Working assumption: `102031`.)
- **DO** CC3 block explorer base URL + whether it has a Hardhat-compatible verify endpoint (Blockscout vs Etherscan-style). Configure `hardhat-verify` accordingly.
- **DO** Attestcoin precompile address — working assumption `0x0000000000000000000000000000000000000FD2`. Confirm from `@gluwa/usc-sdk` / Creditcoin docs.
- **DO** **Sepolia's `chainKey`** as seen by the CC3 USC runtime — call `getSupportedChains()` via the SDK against CC3. (Working assumption: `1`.) This value flows into the attestor deployment, the ASC's known-emitter map, and the worker.
- **DO** The precompile's **exact Solidity ABI** (function name, params, return struct for single-tx verification) and the prover's proof-fetch response shape. Capture both from `gluwa/usc-testnet-bridge-examples`.
- **DONE WHEN** `packages/shared/src/chain.ts` has real values (not "assumed") for: cc3 chainId, cc3 explorer, precompile address, sourceChainKey. `hana-ctc-contracts/contracts/interfaces/IAttestcoin.sol` matches the real precompile ABI.
- **UNBLOCKS** Phase 1.

---

## Phase 1 — Attestcoin spike (de-risk before building anything real)

> The entire project hinges on one round-trip working. Prove it with throwaway code first.

### 1.1 Run the reference example unmodified
- **DO** Clone `gluwa/usc-testnet-bridge-examples`, run its `hello-bridge` (or equivalent) end to end with your funded keys, no edits.
- **DONE WHEN** The example completes: a Sepolia event is verified on CC3 by the precompile.
- **UNBLOCKS** 1.2.

### 1.2 Minimal Hana-shaped round-trip
- **DO** `Ping.sol` on Sepolia: `emit Pinged(address indexed who, uint256 nonce)`.
- **DO** `PingImporter.sol` on CC3: `importPing(...)` takes the same `importFromQuery` param set Hana will use (`chainKey, blockHeight, encodedTransaction, merkleRoot, siblings[], lowerEndpointDigest, continuityRoots[]`), calls the precompile, decodes the `Pinged` log, stores `lastNonce[who]`.
- **DO** A script: emit on Sepolia → `waitUntilHeightAttested(blockHeight)` → fetch proof from prover → submit `importPing` on CC3 → read `lastNonce`.
- **DO** **Measure wall-clock attestation latency** (emit → attested). Write it into `planning/attestation-latency.md`. This number sets the onboarding "pending" UX copy and the demo edit plan.
- **DONE WHEN** `lastNonce[who]` on CC3 equals the nonce emitted on Sepolia, driven only by proofs. Latency recorded.
- **UNBLOCKS** Phase 2 and Phase 4 (the ASC is `PingImporter` grown up).

### 1.3 Lock the interface
- **DO** Freeze `IAttestcoin.sol` and the proof-fetch helper signature in `packages/shared`. Everything downstream codes against these.
- **DONE WHEN** `IAttestcoin.sol` compiles and the spike's importer uses it (not an inline interface).

---

## Phase 2 — Source-chain attestor (`@hana/attestor`)

### 2.1 Contract logic
- **DO** `HanaCreditAttestor.sol` on Sepolia:
  - Internal ledger of "local lending history" per address: `loansCompleted, onTimePayments, latePayments, defaults, cumulativeBorrowedWei, firstActivityTimestamp`.
  - `snapshot()` — reads the caller's ledger, increments a per-subject `snapshotNonce`, emits **one** `CreditSnapshot(subject, loansCompleted, onTimePayments, latePayments, defaults, cumulativeBorrowedWei, firstActivityTimestamp, snapshotNonce)`.
  - Seeding path for the demo: `seedHistory(address subject, ...)` (owner-only) so snapshots are non-trivial. On mainnet this contract would instead read a real lending protocol; for the hackathon the seed is explicit and disclosed.
- **DO** Unit tests: nonce strictly increments; event fields equal the ledger; `seedHistory` is owner-gated.
- **DONE WHEN** `pnpm attestor:test` green.

### 2.2 Deploy + seed
- **DO** `pnpm attestor:deploy:sepolia`. Verify on Etherscan-Sepolia. Write `deployments/sepolia.json`.
- **DO** Seed 2 demo wallets with realistic, different histories (one "excellent", one "thin").
- **DO** Send one real `snapshot()` tx from each; note the block numbers + tx hashes in `planning/demo-fixtures.md`.
- **DONE WHEN** `HANA_CREDIT_ATTESTOR_ADDRESS` is in the shared address book, verified, and two `CreditSnapshot` events exist on Sepolia.
- **UNBLOCKS** Phase 4 (real events to import), Phase 5 (worker has something to listen to).

---

## Phase 3 — Core protocol contracts (`@hana/contracts`)

Build order is dependency order. Each contract: **logic → compile → unit test → integration test.**
Deploy happens once at the end of the phase (3.7), as one wired system.

### 3.1 `iUSDC.sol`
- **DO** ERC20, 6 decimals. `faucet()` mints a fixed amount to `msg.sender` with a per-address cooldown. `mint()` owner-only.
- **DONE WHEN** Tests: faucet respects cooldown; decimals == 6.

### 3.2 `CreditRegistry.sol` — the primitive
- **DO** `CreditProfile` storage (composite 300–850; `repayment/volume/tenure` sub-scores 0–1000; native aggregates; imported aggregates kept raw; `outstandingDebt`; `lastImportNonce`; `hasImportedHistory`; `firstActivityTimestamp`).
- **DO** Exactly **two write paths**, each with its own modifier:
  - `recordNativeActivity(RecordType, address user, uint256 amount)` — `onlyLoanManager`.
    Types: `LOAN_ORIGINATED, PAYMENT_ON_TIME, PAYMENT_LATE, LOAN_COMPLETED, LOAN_DEFAULTED, DEBT_REPAID`.
  - `importAttestedHistory(address subject, uint64 chainKey, ImportedSnapshot s)` — `onlyImporterASC`.
    Stores raw imported aggregates, bumps `importNonces[chainKey][subject]`, sets `hasImportedHistory`.
  - The **liquidity-provision bonus is pull-based**, not a third writer: the score math reads
    `lendingPool.maxWithdraw(user)` (or share balance → assets) and adds a capped tenure/volume bonus.
    This keeps the write surface at two paths as specified.
- **DO** `ScoreModel` library — pure functions:
  - `repaymentSubscore(native, imported, importWeightBps)` — on-time vs `2×late` vs `5×default`; imported aggregates counted at `importWeightBps` (default 6000 = 60% of native).
  - `volumeSubscore(nativeBorrowed, importedBorrowed, importWeightBps)` — tiered thresholds, no `log`.
  - `tenureSubscore(firstActivityTs, now, lpBonus)` — linear to 1000 over ~730 days, plus LP bonus.
  - `composite(rep, vol, ten, weights)` — `300 + 550 * weightedAvg(...) / 1000`. Weights governable, sum 10000.
- **DO** `getCreditLimit(address user, address asset) view` — score → gross limit in `asset` units via a
  governable piecewise curve (score ≤ 500 → 0; 500→850 ramps 0 → `maxLimit`), then `− outstandingDebt`,
  clamped to a per-account exposure cap. `getProfile(address) view` returns the struct.
- **DO** Governance (`Ownable`): setters for sub-score weights, `importWeightBps`, limit curve params,
  per-asset config, exposure cap, and the wired addresses (`loanManager`, `importerASC`, `lendingPool`).
  Emit an event on every governance change. (Testnet: owner-settable. Note in docs that mainnet locks these.)
- **DONE WHEN** Tests: fresh address reads composite 300; on-time payments raise it; a default drops it hard;
  imported history raises it **less** than the same native history; limit is 0 below the score floor and
  monotonic above it; `outstandingDebt` reduces available limit; both writer modifiers reject `msg.sender`
  that is not the wired contract.

### 3.3 `LendingPool.sol`
- **DO** OZ `ERC4626` vault over `iUSDC` (LP share token "Hana LP iUSDC" / `ipUSDC`).
- **DO** `totalAssets() = idle iUSDC + totalPrincipalOutstanding + accruedInterestReceivable`.
- **DO** `borrow(address to, uint256 amount)` / `repay(uint256 principal, uint256 interest)` — `onlyLoanManager`.
  On `repay`, split `interest` into `reserveFactorBps` → `treasury`, remainder stays in the pool (raises share price).
- **DO** `currentBorrowRateBps() view` — kinked utilization curve via `RateModel` library:
  `util = totalBorrowed / (totalBorrowed + idle)`; slope1 up to `kink` (8000 bps = 80%), steeper slope2 beyond.
  All of `baseRateBps, slope1Bps, slope2Bps, kinkBps, reserveFactorBps` governable.
- **DO** `withdraw`/`redeem` revert if the amount exceeds idle liquidity (`maxWithdraw` accounts for this).
- **DO** `recordBadDebt(uint256)` — `onlyLoanManager`, writes down `totalPrincipalOutstanding` on an
  unrecoverable undercollateralized default (socialized loss → share price falls).
- **DONE WHEN** Tests: deposit mints shares 1:1 on an empty pool; rate rises with utilization and kinks at 80%;
  interest repayment raises `convertToAssets(1e18)`; withdraw blocked when funds are lent; reserve cut lands at treasury.

### 3.4 `SettlementVault.sol`
- **DO** `registerSettlement(bytes32 billHash, address merchant, uint256 amount, ReleaseType rt, uint64 releaseTime)` — `onlyLoanManager`. Funds are sent here by `LoanManager` at origination.
- **DO** `ReleaseType { IMMEDIATE, TIMELOCK, CONDITIONAL }`. `markConditionMet(bytes32)` — `onlyLoanManager`.
- **DO** `claim(bytes32 billHash)` — merchant pulls when eligible (`IMMEDIATE`, or `now ≥ releaseTime`, or condition met). Idempotent; no double claim.
- **DO** `refund(bytes32 billHash, address to)` — `onlyLoanManager`, for a reverted/disputed origination.
- **DONE WHEN** Tests: each release type gates correctly; double-claim reverts; refund returns exact balance.

### 3.5 `LoanManager.sol`
- **DO** `LoanType { INSTALLMENT, REVOLVING, TERM, OVERCOLLATERALIZED }`, `LoanStatus { ACTIVE, COMPLETED, DEFAULTED, LIQUIDATED }`.
- **DO** `Loan` struct: borrower, asset, type, status, principal, outstandingPrincipal, aprBps (snapshot at origination),
  installmentCount, installmentsPaid, amountPerInstallment, nextDueDate, startDate, maturityDate,
  collateralAsset, collateralAmount, billHash, merchant, gracePeriod.
- **DO** `originate(OriginateParams)`:
  - Non-overcollateralized: `require(principal + registry.getCreditLimitUsed(borrower) ≤ registry.getCreditLimit(borrower, asset))`; no collateral.
  - `OVERCOLLATERALIZED`: pull `collateralAmount ≥ principal * collateralRatioBps / 10000`; **no score check**.
  - `pool.borrow(recipient, principal)` where `recipient = settlementVault` when `billHash != 0` (merchant flow), else `borrower` (cash line).
  - If merchant flow: `settlementVault.registerSettlement(billHash, merchant, principal, releaseType, releaseTime)`.
  - `registry.recordNativeActivity(LOAN_ORIGINATED, borrower, principal)`.
  - Build the schedule: `INSTALLMENT` → equal `amountPerInstallment = (principal + totalInterest) / n`, `totalInterest = principal * aprBps * termDays / 365 / 10000`, `nextDueDate = start + interval`. `TERM`/`OVERCOLLATERALIZED` → single due at `maturityDate`. `REVOLVING` → `creditLine = getCreditLimit(...)`, interest accrues on `outstandingPrincipal` from `lastAccrualTs`.
- **DO** `makePayment(uint256 loanId, uint256 amount)`:
  - Pull `amount` of `asset` from `msg.sender`. Split into interest-first then principal.
  - `pool.repay(principalPart, interestPart)`; `registry.recordNativeActivity(DEBT_REPAID, borrower, principalPart)`.
  - On-time if `now ≤ nextDueDate + gracePeriod` → `PAYMENT_ON_TIME`; else `PAYMENT_LATE` + `lateFeeBps` added to what's owed.
  - Advance `installmentsPaid` / `nextDueDate`. If `outstandingPrincipal == 0`: status `COMPLETED`,
    `recordNativeActivity(LOAN_COMPLETED)`, refund `OVERCOLLATERALIZED` collateral, `settlementVault.markConditionMet(billHash)` if `CONDITIONAL`.
- **DO** `draw(uint256 loanId, uint256 amount)` — `REVOLVING` only, borrower only, `outstandingPrincipal + amount ≤ creditLine`.
- **DO** `liquidate(uint256 loanId)` — anyone, if `ACTIVE` and `now > dueReference + gracePeriod + defaultWindow`:
  - `registry.recordNativeActivity(LOAN_DEFAULTED, borrower, outstandingPrincipal)`.
  - `OVERCOLLATERALIZED` → seize collateral, swap-free: send up to owed to pool via `repay`, remainder (minus keeper incentive) back to borrower; status `LIQUIDATED`.
  - Undercollateralized → `pool.recordBadDebt(outstandingPrincipal)`; status `DEFAULTED`. Keeper gets a fixed incentive from `lateFee`/treasury.
- **DO** Views: `getLoan`, `getUserLoans`, `amountDue(loanId)`, `getSchedule(loanId)`.
- **DO** `ReentrancyGuard` on all state-changing external fns; checks-effects-interactions; `SafeERC20`.
- **DONE WHEN** Integration tests below (3.6) pass.

### 3.6 Integration tests (single Hardhat test suite, forked-free, local)
- **DO** Fixture wires `iUSDC → LendingPool → LoanManager → SettlementVault → CreditRegistry` and a `MockAttestcoin`.
- **DO** Scenarios:
  1. LP deposits 100k iUSDC → shares minted.
  2. `INSTALLMENT` (BNPL): merchant bill → originate for 1,000 in 4 installments → vault holds 1,000 → borrower pays 4 installments on time → loan `COMPLETED` → merchant `claim`s → LP share price up → borrower score up.
  3. `OVERCOLLATERALIZED`: originate with no credit score, 150% collateral → repay → collateral returned.
  4. `TERM`: bullet → single repayment at maturity.
  5. `REVOLVING`: open line → `draw` twice → partial repay → interest accrues correctly.
  6. **Liquidation**: installment loan goes overdue past the default window → anyone calls `liquidate` → borrower score drops hard → undercollateralized loss socialized (share price down).
  7. Limit enforcement: origination reverts when `principal` exceeds available credit limit.
- **DONE WHEN** `pnpm contracts:test` green, coverage on the 5 contracts ≥ 85% lines.

### 3.7 Deploy the core system to CC3
- **DO** `scripts/deploy.ts` (idempotent, resumable via `deployments/cc3.json`):
  deploy `iUSDC` → `CreditRegistry` → `LendingPool(iUSDC, treasury)` → `SettlementVault` →
  `LoanManager(registry, pool, vault, iUSDC)` → then wire:
  `registry.setLoanManager(loanManager)`, `registry.setLendingPool(pool)`,
  `pool.setLoanManager(loanManager)`, `vault.setLoanManager(loanManager)`,
  set rate params, score weights, limit curve.
- **DO** Verify every contract on the CC3 explorer. Seed the pool with faucet `iUSDC` deposited by the deployer.
- **DO** `pnpm sync:abis`.
- **DONE WHEN** `deployments/cc3.json` holds 5 verified addresses; a scripted local→CC3 smoke
  (`faucet → deposit → originate small overcollateralized loan → repay`) succeeds on real CC3.
- **UNBLOCKS** Phase 4 wiring, all frontends.

---

## Phase 4 — Importer ASC + wiring (`@hana/contracts`)

### 4.1 `CreditImporterASC.sol` logic
- **DO** Constructor: `IAttestcoin precompile`, `CreditRegistry registry`, `owner`.
- **DO** `setAttestor(uint64 chainKey, address attestor)` — owner. Known-emitter map.
- **DO** `importFromQuery(uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, bytes32[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots)`:
  1. Decode `encodedTransaction` enough to get `transactionIndex` + logs (pure).
  2. `replayKey = keccak256(abi.encodePacked(chainKey, blockHeight, transactionIndex))`;
     `require(!consumedProofs[replayKey], "replay")`; **set it now**, before the external call.
  3. `result = precompile.verify(...)` with the exact ABI from Phase 1. `require(result.verified)`.
  4. `require(result.receiptStatus == 1, "reverted source tx")`.
  5. Find the `CreditSnapshot` log; `require(log.emitter == attestorOf[chainKey], "bad emitter")`.
  6. Decode log → `(subject, loansCompleted, onTimePayments, latePayments, defaults, cumulativeBorrowedWei, firstActivityTimestamp, snapshotNonce)`.
  7. `require(snapshotNonce > registry.importNonceOf(chainKey, subject), "stale nonce")`.
  8. `registry.importAttestedHistory(subject, chainKey, ImportedSnapshot{...})`.
  9. `emit HistoryImported(subject, chainKey, snapshotNonce, blockHeight)`.
- **DO** The four checks in that exact order (replay → receipt status → emitter → nonce).

### 4.2 Negative tests (committed to the repo — these are a scoring criterion)
- **DO** With `MockAttestcoin` returning attacker-controlled results:
  1. **Replayed proof** — same `(chainKey, blockHeight, txIndex)` twice → second reverts `"replay"`.
  2. **Reverted source tx** — `receiptStatus = 0` → reverts `"reverted source tx"`.
  3. **Wrong emitter** — log `emitter` ≠ registered attestor → reverts `"bad emitter"`.
  4. **Stale nonce** — `snapshotNonce ≤` stored → reverts `"stale nonce"`.
- **DO** Positive test: valid proof → `CreditRegistry` profile shows `hasImportedHistory`, score rises,
  `importNonceOf` updated.
- **DONE WHEN** `pnpm contracts:test` green including all four negatives.

### 4.3 Deploy + wire
- **DO** Deploy `CreditImporterASC(precompile, registry, owner)`; `registry.setImporterASC(asc)`;
  `asc.setAttestor(SOURCE_CHAIN_KEY, HANA_CREDIT_ATTESTOR_ADDRESS)`.
- **DO** Verify. Update `deployments/cc3.json`. `pnpm sync:abis`.
- **DONE WHEN** `CREDIT_IMPORTER_ASC_ADDRESS` in the address book, `registry.importerASC()` returns it.
- **UNBLOCKS** Phase 5 end-to-end.

---

## Phase 5 — Worker (`@hana/worker`)

### 5.1 Pipeline
- **DO** Config from env; import addresses/ABIs from `@hana/shared`.
- **DO** **Listener**: subscribe to `CreditSnapshot` on Sepolia (`queryFilter` backfill on boot + live subscription).
- **DO** **Job store**: append-only JSON/SQLite in `WORKER_STATE_DIR`, keyed by `keccak256(chainKey, blockHeight, txIndex)`. States: `SEEN → ATTEST_WAIT → PROOF_FETCH → SUBMIT → CONFIRMED | FAILED`. Restart re-reads and resumes; never re-submits a `CONFIRMED` job.
- **DO** **Attest wait**: `waitUntilHeightAttested(blockHeight)` polling at `WORKER_POLL_INTERVAL_MS` (15s).
- **DO** **Proof fetch**: from `ATTESTCOIN_PROVER_URL` using the SDK; store the raw proof blob on the job.
- **DO** **Submit**: `CreditImporterASC.importFromQuery(...)` signed by `WORKER_SUBMITTER_PRIVATE_KEY`; exponential backoff up to `WORKER_MAX_RETRIES`; treat "replay"/"stale nonce" reverts as terminal-success (already imported), not failure.
- **DO** **Dedupe**: an in-flight or confirmed job for the same replay key short-circuits.
- **DO** **HTTP status endpoint** on `WORKER_HTTP_PORT`: `GET /status/:address` → `{ state, snapshotNonce, blockHeight, txHash, updatedAt }` for the newest job for that subject. CORS for the checkout origin.
- **DONE WHEN** From a cold start: fire `snapshot()` on Sepolia → within one attestation window the worker
  submits → `CreditRegistry.getProfile(subject)` on CC3 shows the imported history → `GET /status/:address` reports `CONFIRMED`. Kill the worker mid-`ATTEST_WAIT` and restart → it resumes, does not double-submit.
- **UNBLOCKS** Checkout onboarding flow (Phase 7).

---

## Phase 6 — Merchant API + portal (`@hana/merchant`)

### 6.1 API
- **DO** Next.js route handlers + MongoDB (`MONGODB_URI`). Collections: `merchants` (id, name, `clientId`, hashed `clientSecret`, payout address), `bills`.
- **DO** `POST /api/bills/create` — headers `x-client-id` / `x-client-secret`; body `{ amount, currency, reference, items[], releaseType }`;
  computes `billHash = keccak256(clientId, reference, amount, nonce)`; stores the bill + item metadata;
  returns `{ billHash, checkoutUrl: ${CHECKOUT_BASE_URL}/pay/${billHash}, amount, merchant }`.
- **DO** `GET /api/bills/:billHash` — public read for the checkout (amount, merchant payout address, items, releaseType, status).
- **DO** `POST /api/bills/:billHash/status` — internal/authenticated; checkout or an indexer marks `originated | settled`.
- **DO** Chain identifiers in every response are CC3; Sepolia appears only as the credit-import source label.
- **DONE WHEN** `curl` create → get round-trips; bad secret → 401; unknown hash → 404.

### 6.2 Portal UI
- **DO** API-key management, bill list + create form, settlement history (read `SettlementVault` events via `@hana/shared`), simple revenue chart.
- **DONE WHEN** A merchant can register, get keys, create a bill, and see it appear.
- **UNBLOCKS** Store + Checkout have real bills.

---

## Phase 7 — Checkout Hub (`@hana/checkout`)

### 7.1 Wallet + chain
- **DO** Next.js + wagmi + viem + RainbowKit. Single supported chain = CC3 (config from `@hana/shared`). Wrong-network guard with "switch network".
- **DONE WHEN** Connect + network switch work against CC3.

### 7.2 Credit profile view
- **DO** Read `CreditRegistry.getProfile` + `getCreditLimit`. Show composite (gauge, 300–850), the three sub-scores, `hasImportedHistory` badge, available limit.
- **DONE WHEN** A funded/seeded address shows a live score from CC3.

### 7.3 "Link your Ethereum history" onboarding
- **DO** Step 1: prompt to switch to Sepolia, call `HanaCreditAttestor.snapshot()` (wagmi write), capture tx hash.
- **DO** Step 2: switch back to CC3, poll `NEXT_PUBLIC_WORKER_STATUS_URL/status/:address` → render pending timeline (`ATTEST_WAIT → PROOF_FETCH → SUBMIT → CONFIRMED`) with the elapsed-time copy tuned to the measured latency.
- **DO** Step 3: on `CONFIRMED`, refetch the profile; animate the score jump.
- **DONE WHEN** A wallet with a seeded Sepolia history completes the flow and its CC3 score rises, no manual steps.

### 7.4 Loan origination
- **DO** `/pay/:billHash` — fetch bill from Merchant API; show amount + items; plan selector (`INSTALLMENT` n = 4/6, `TERM`, `REVOLVING` if a line exists); if score too low, offer `OVERCOLLATERALIZED` with a collateral input.
- **DO** `approve` iUSDC if needed → `LoanManager.originate(...)` → on success `POST /api/bills/:billHash/status = originated`.
- **DONE WHEN** A bill from the store is paid via a 4-installment plan; `SettlementVault` holds the funds; the loan shows in the dashboard.

### 7.5 Repayment dashboard
- **DO** `/dashboard` — list `getUserLoans` with schedule, amount due, next due date, status. Pay-installment action (`approve` → `makePayment`). Show score delta after completion.
- **DONE WHEN** Every installment of a live loan can be paid to completion from the UI; late payment path visibly penalizes.

---

## Phase 8 — Demo store + Lender interface

### 8.1 Demo Store (`@hana/store`)
- **DO** Next.js + Framer Motion. Product grid, cart, checkout button → `POST` to Merchant API `bills/create` → redirect to `checkoutUrl`.
- **DONE WHEN** Storefront → checkout → settlement path works unbroken with a real merchant account.

### 8.2 Lender interface
- **DO** Add to Checkout Hub (or a `/lend` route): deposit/withdraw `iUSDC` against `LendingPool`, show utilization, current APR, LP share balance + value, historical yield.
- **DONE WHEN** Deposit mints `ipUSDC`; after borrower interest accrues, redeem returns more `iUSDC` than deposited.

---

## Phase 9 — Docs, demo, submission

### 9.1 Docs (`@hana/docs`)
- **DO** Next.js + MDX: architecture + the cross-chain import flow diagram; **Attestcoin write-up** (proof generation, `0x0FD2` verification, the four checks each linked to its negative test in the repo); deployed addresses on both chains (auto-included from `@hana/shared`); third-party integration guide (`getCreditLimit` one-liner + `ICreditRegistry` ABI).
- **DO** README on every package: what it is, env vars, run commands.
- **DONE WHEN** A judge can go from the docs index to a working `getCreditLimit` call in another contract.

### 9.2 Demo video (~5 min)
- **DO** Beats: (0:00) wallet with real Sepolia history connects to CC3, score 300 → (0:45) Link history, sign on Sepolia, worker log, verification tx on CC3 explorer → (2:00) score jumps, limit unlocks, "no oracle in the path" → (2:45) checkout on the demo store, 4 installments, merchant settles → (4:00) `getCreditLimit()` from an unrelated contract → (4:30) roadmap.
- **DO** Pre-run the import on a second wallet so explorer links are ready; record the worker terminal separately; time-compress the attestation wait with a visible elapsed caption; keep a list of every tx hash.
- **DONE WHEN** Video uploaded, URL in the submission.

### 9.3 Submission (DoraHacks BUIDL — deadline Sep 13, 23:59 ET)
- **DO** All repos/folders public; per-package READMEs; deck/whitepaper PDF; BUIDL page (description, Attestcoin integration summary, logo, sector = DeFi, demo URL, team); confirm every contract on both chains is deployed **and verified**; addresses page live in docs.
- **DONE WHEN** Submission is entered and every link in it resolves.

---

## Cross-cutting rules (so the architecture doesn't drift)

1. **One source of truth for addresses/ABIs**: `packages/shared/src/generated/`, produced by `pnpm sync:abis`. Nothing hand-copies an address or ABI.
2. **A contract is not "done" until deployed + verified + in the address book.** Frontend work against it starts only then.
3. **`CreditRegistry` stays reusable**: no import-flow or loan-flow specifics leak into it beyond the two write methods. Importer logic lives in `CreditImporterASC`; loan logic in `LoanManager`.
4. **Two write paths into the registry, period.** LP bonus is pull-based.
5. **The four importer checks are ordered and each has a committed negative test.** If you touch the importer, you touch its tests.
6. **Imported history is always weighted below native** (`importWeightBps < 10000`) everywhere it is combined.
7. **Checkout never blocks on a live proof.** It reads already-imported state. All attestation latency lives in the onboarding flow, handled by the worker.
8. **Money is on-chain; metadata is in Mongo**, joined by `billHash`.
9. **Every state-changing contract fn**: `nonReentrant`, checks-effects-interactions, `SafeERC20`, custom errors.
10. **Deploy scripts are idempotent and resumable** from `deployments/<network>.json`.

## Critical-path dependency graph

```
0.1 ─ 0.2 ─ 0.3 ─ 1.1 ─ 1.2 ─ 1.3 ─┬─ 2.1 ─ 2.2 ─────────────┐
                                     └─ 3.1..3.6 ─ 3.7 ─ 4.1 ─ 4.2 ─ 4.3 ─ 5.1
3.7 ─ 6.1 ─ 6.2 ─ 8.1
3.7 + 4.3 + 5.1 ─ 7.1 ─ 7.2 ─ 7.3 ─ 7.4 ─ 7.5 ─ 8.2
(7.x + 8.x) ─ 9.1 ─ 9.2 ─ 9.3
```

## Known gotchas

- **`chainKey` ≠ `chainId`.** `chainKey` is the USC runtime's own index for a source chain; confirm via `getSupportedChains()`. Wrong value → every import reverts on the emitter check or never matches.
- **Prover confirms inclusion, not success.** Always check `receiptStatus == 1` (check #2).
- **Batch proofs cap at 10 tx / 1000 blocks** — the reason the attestor emits one aggregated event. Don't try to import per-transaction.
- **CC3 gas/fee model** may differ from mainnet Ethereum; set `gasPrice`/`type` explicitly in Hardhat network config if estimation misbehaves.
- **ERC4626 share inflation / first-deposit** — seed the pool with a deployer deposit in `deploy.ts` (or use OZ's virtual-shares mitigation) so the first real LP isn't grieved.
- **6-decimal `iUSDC` vs 18-decimal shares** — keep the vault's asset decimals explicit; don't assume 18 anywhere.
- **Attestation latency drives UX** — measure it in Phase 1; if it's minutes, the onboarding "pending" screen must survive a page refresh (worker status endpoint is the source of truth, not React state).
