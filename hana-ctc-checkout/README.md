# @hana/checkout

The Checkout Hub — wallet connection, credit profile, "Link your Ethereum history" onboarding,
loan origination, and the repayment dashboard. Next.js, wagmi + viem + RainbowKit.

**Status: Phase 7 (7.1–7.5) and Phase 8.2 (`/lend`) built and verified live** against the real
Sepolia + CC3 deployments — no mocks, no local chain.

## Routes

- `/` — connect wallet, wrong-network guard, credit profile (composite gauge + 3 sub-scores,
  `hasImportedHistory` badge, available credit).
- `/link-history` — Sepolia `snapshot()` tx, then a pending timeline driven by
  `NEXT_PUBLIC_WORKER_STATUS_URL/status/:address`. Survives a page refresh by checking for an
  existing job on mount instead of always starting at "idle" — the worker is the source of truth,
  not React state (confirmed live: reloaded mid-import in a fresh browser context, resumed with
  the correct elapsed time from the job's `createdAt`).
- `/pay/[billHash]` — reads the bill from the Merchant API (CORS-enabled there for this), gates
  the plan selector on live `getAvailableCredit`, falls back to an `OVERCOLLATERALIZED` collateral
  flow when the score-based limit isn't enough, `approve` + `originate`, then marks the bill
  `originated` via a same-origin proxy route (see "Design notes").
- `/dashboard` — `getUserLoans`, per-loan schedule/status/next-due/overdue, pay action
  (`approve` + `makePayment`), shows a score-delta banner after a payment changes the composite
  score.
- `/lend` — deposit/withdraw against `LendingPool` (an ERC4626 vault), pool stats (utilization,
  borrow APR), the caller's `ipUSDC` position + live share price, and a chart of `Repaid` events
  (interest paid into the pool). Confirmed live: deposited 3,000 iUSDC, let a real borrower's
  interest accrue for 5 minutes, redeemed for 3,000.000047 iUSDC — a real, unambiguous yield, not
  a rounding artifact (see "Design notes" for why the first, smaller attempt at this rounded
  *down* instead).

## Commands

```bash
pnpm install   # from the repo root once every package has deps: pnpm install
pnpm dev       # next dev -p 3001
pnpm typecheck
```

## Environment

Copy the relevant block from the repo-root `.env.example` into `.env` here:
`NEXT_PUBLIC_CC3_RPC_URL`, `NEXT_PUBLIC_CC3_CHAIN_ID`, `NEXT_PUBLIC_SEPOLIA_RPC_URL`,
`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (optional), `NEXT_PUBLIC_WORKER_STATUS_URL`,
`NEXT_PUBLIC_MERCHANT_API_URL`, and `MERCHANT_INTERNAL_TOKEN` (server-only, no `NEXT_PUBLIC_`
prefix — must match the Merchant API's own value).

## Verified live (not just built)

Every flow below was driven end to end against the real Sepolia + CC3 deployments using a
Playwright + a minimal injected-wallet mock (a real `viem` local account signs for real, no
extension needed — see the design notes on testing below), not simulated:

- Connect, wrong-network guard, switch to CC3 — real score (786) and sub-scores rendered for a
  wallet with real imported history.
- Full "link your history" onboarding: fired a real `snapshot()`, watched it picked up live by the
  worker, killed and resumed the flow mid-`ATTEST_WAIT` via a page refresh, reached `CONFIRMED`,
  saw `hasImportedHistory` flip on the profile.
- Full loan origination: a real bill, `OVERCOLLATERALIZED` path (150% collateral computed from the
  contract's own `collateralRatioBps`, not hardcoded) — confirmed on-chain that `SettlementVault`
  received the exact bill amount and the bill's status flipped to `originated`.
- Full repayment to completion: paid a real 4-installment loan one installment at a time from the
  dashboard, reached `COMPLETED`, saw a live score-delta banner (787 → 788).
- Full single-payment payoff of an `OVERCOLLATERALIZED` loan — confirmed the 150% collateral was
  refunded on completion (net cost matched principal + interest, not principal + un-refunded
  collateral).
- `/lend`: deposited 3,000 iUSDC (minted `ipUSDC`), originated a separate 4,000 iUSDC loan and let
  real interest accrue for 5 minutes, repaid it, then redeemed the full LP position for
  **3,000.000047 iUSDC** — genuinely more than deposited, not a display rounding artifact.

**Not verified live**: the "late payment visibly penalizes" half of 7.5's acceptance check. That
needs a real testnet due date to actually pass — not something a live session can fast-forward.
The UI's overdue detection (`nextDueDate + gracePeriod` read from the contract) and the contract's
own late-fee logic are both implemented and the latter is unit-tested (`hana-ctc-contracts`), but
nobody has watched the red "Overdue" badge and a late fee land against a live loan.

## Design notes worth knowing before you touch this code

- **RainbowKit's default wallet list is broken out of the box in this project as of the versions
  currently resolved.** `@wagmi/connectors`' "Base Account" (Coinbase Smart Wallet) connector
  pulls in `@coinbase/cdp-sdk`, whose x402 payment integration imports several `@x402/evm/*`
  submodules that aren't installed — this is a hard webpack compile failure, not a warning, and it
  takes down the *entire* app, not just that connector. `next.config.js` stubs the whole package
  via a webpack alias. If a version bump removes the need for this, feel free to drop it — but
  verify by actually compiling, not just by reading the changelog.
- **RainbowKit's branded `metaMaskWallet` connects via `@metamask/sdk`, not the page's actual
  `window.ethereum`.** It works against a real extension or the MetaMask mobile app, but hangs on
  "Opening MetaMask..." forever against anything else — including our own test harness's injected
  provider. `lib/wagmi.ts` lists `injectedWallet` first specifically so RainbowKit's generic
  injected connector (which does just call `window.ethereum.request` directly) is what a plain
  injected provider actually uses. This isn't only a test convenience — it's also just a better
  default for any real injected wallet RainbowKit doesn't have a curated branded entry for (Rabby,
  Frame, etc.).
- **A revert from a *different* contract's ABI decodes to a useless "An unknown RPC error
  occurred."** `LoanManager.makePayment` can revert with an IUSDC error (e.g.
  `ERC20InsufficientBalance`, hit live during testing) via its internal `SafeERC20` call — viem
  can only name a revert if it's in the ABI of the contract you *called*, so a `LoanManager` call
  reverting with an ERC20 error decodes to nothing useful. `lib/errors.ts`'s `formatTxError` walks
  the error chain for a `ContractFunctionRevertedError` and maps known ERC20 error names to real
  copy. Use it for every write's catch block, not just `err.shortMessage`.
- **The onboarding page's `phase` state does not persist — the worker does.** Never add local
  state that has to survive a refresh without also checking the worker's `/status/:address` on
  mount. See `/link-history`'s initial-check effect.
- **`/api/mark-originated` exists because the browser must never hold `MERCHANT_INTERNAL_TOKEN`.**
  That token gates the Merchant API's `POST /bills/:billHash/status` and is a server-to-server
  secret, not a merchant's own client secret — nothing in the checkout UI is scoped to one
  merchant, so there's no client-side credential that could stand in for it. This route holds the
  token server-side (no `NEXT_PUBLIC_` prefix) and the client calls this same-origin route
  instead.
- **The Merchant API needs CORS for the one route the checkout calls cross-origin.**
  `GET /api/bills/:billHash` is fetched directly from the browser (different port = different
  origin); every other Merchant API route the checkout touches goes through a same-origin proxy
  (`/api/mark-originated`) or isn't called from checkout at all. `curl` doesn't enforce CORS, so a
  route that "works" via `curl` can still be silently blocked in a real browser — verify
  cross-origin reads in an actual browser context, not just with `curl`.
- **Testing wallet-signing flows**: a minimal EIP-1193 provider injected via
  `page.addInitScript`, backed by a real `viem` local account whose actual signing happens
  Node-side (via `page.exposeFunction`, since the in-page script can't hold a private key). No
  browser extension, no `chromium-cli` mocking needed — this is a real account signing real
  transactions against real testnets. Give it no `isMetaMask`/`isCoinbaseWallet` flags (see the
  RainbowKit note above) and use `injectedWallet` from `lib/wagmi.ts`'s wallet list.
- **ERC4626's floor-rounding can hide real yield from a small depositor in a large pool.** The
  first attempt at proving `/lend`'s yield mechanism deposited 200 iUSDC into the ~50,000 iUSDC
  pool, let one small loan accrue interest for 90s, and redeemed for *199.999999* iUSDC — one unit
  **less** than deposited. Not a bug: the depositor's ~0.4% pool share of a tiny (104-unit)
  interest payment rounded to zero across two successive floor-divisions (mint, then redeem), and
  OZ's ERC4626 always rounds in the vault's favor by design (anti-inflation-attack protection).
  The fix wasn't code — it was test design: redo it with a stake and an interest amount both large
  enough to survive double rounding (3,000 iUSDC deposit, a 4,000 iUSDC loan, 5 minutes of
  accrual), which produced an unambiguous +47-unit gain. If you need to demo or test yield on this
  pool later, size the numbers accordingly — a "the redeemed value doesn't look like it changed"
  result on a small stake is expected, not evidence of a broken pool.
- **`page.addInitScript` + real chain waits compose fine, but hydration timing is a real test
  race everywhere in this app, not just the storefront.** A click fired the instant target text
  appears can land before React has attached event listeners (SSR paints the text first). Give a
  freshly-loaded page a beat (or wait for a second, more specific signal) before interacting with
  it in a Playwright script.
