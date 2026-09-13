# @hana/attestor

`HanaCreditAttestor` — the source-chain contract, deployed on **Ethereum Sepolia**. Reads a user's
local lending history and emits one aggregated `CreditSnapshot` event per import.

Status: **logic complete, 7/7 tests passing, deployed and verified on Sepolia.**
[`0x89D15677c532eccDf5c8eBff69e38DB13ce966C5`](https://sepolia.etherscan.io/address/0x89D15677c532eccDf5c8eBff69e38DB13ce966C5#code) —
demo fixtures (seeded wallets, snapshot tx hashes) in `../planning/demo-fixtures.md`.

## Contents

- `contracts/HanaCreditAttestor.sol` — per-subject ledger, `snapshot()` (strictly-incrementing
  `snapshotNonce`, one `CreditSnapshot` event per call), owner-only `seedHistory()` for demo
  fixtures.
- `scripts/deploy.ts` — idempotent deploy, writes `deployments/<network>.json`.
- `scripts/verify.ts` — verifies every recorded contract on the block explorer.
- `scripts/seed.ts` — generates (or reuses) two demo wallets, seeds "excellent" / "thin" histories,
  fires their first `snapshot()`. Demo wallets need their own Sepolia ETH for gas — the script
  prints their addresses and warns if either is unfunded.
- `scripts/export-abis.ts` — publishes the address + ABI to `packages/shared/src/generated/<network>.ts`.
- `test/HanaCreditAttestor.t.ts` — nonce monotonicity, event fields match the ledger, `seedHistory`
  access control, per-subject isolation.

## Commands

```bash
pnpm install    # from the repo root once every package has deps: pnpm install
pnpm build      # hardhat compile
pnpm test       # 7 tests

pnpm node                # local Hardhat node (separate terminal)
pnpm deploy:local        # deploy to it

pnpm deploy:sepolia      # needs SEPOLIA_DEPLOYER_PRIVATE_KEY funded with Sepolia ETH
pnpm verify:sepolia      # needs ETHERSCAN_API_KEY
pnpm seed:sepolia        # generates/reuses two demo wallets, seeds + snapshots both
pnpm export:abis         # publish address + ABI to @hana/shared
```

## Environment

Copy the relevant block from the repo-root `.env.example` into `.env` here:
`SEPOLIA_RPC_URL`, `SEPOLIA_CHAIN_ID`, `SEPOLIA_DEPLOYER_PRIVATE_KEY`, `ETHERSCAN_API_KEY`.

## Known flaky exit crash on Windows + very new Node (not a real test failure)

`pnpm test` here (and in `@hana/contracts`, same dependency) can occasionally exit with:

```
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
```

after printing `7 passing`. This is a native-addon/libuv teardown race in Hardhat's crypto
dependencies (`keccak`, `secp256k1`) on Windows — triggered by running on a Node version much
newer than what Hardhat 2.x's prebuilt native binaries were built against (this repo has hit it on
Node v24.12.0; 5 back-to-back reruns of the identical command reproduced it 0/5 times, confirming
it's a rare race, not deterministic). **The tests themselves already passed** by the time it
happens — check for `N passing` above the assertion before assuming anything actually failed.
Workarounds, in order of effort: just re-run the command; or run on Node 20.x/22.x LTS (the repo's
root `package.json` now pins `engines.node` to `<23.0.0` as a hint, non-blocking). Not something
fixable from this repo's own code — it's an upstream native-addon/Node-ABI mismatch.

## Event shape (frozen — `@hana/contracts/interfaces/IAttestcoin.sol` and `CreditImporterASC` decode against this)

```solidity
event CreditSnapshot(
    address indexed subject,
    uint64  loansCompleted,
    uint64  onTimePayments,
    uint64  latePayments,
    uint64  defaults,
    uint128 cumulativeBorrowedWei,   // normalized 1e18 USD-equivalent units — see contracts README "Units"
    uint64  firstActivityTimestamp,
    uint64  snapshotNonce
);
```

Confirmed against the real Attestcoin precompile during the Phase 1 spike (see
`../planning/attestation-latency.md`): `subject` is the only indexed field (matches
`CreditImporterASC._decodeSnapshot`'s `log.topics.length == 2` check), and the remaining seven
fields are ABI-encoded into `data` in the exact order shown above.

## Design notes

- **`seedHistory` never advances `snapshotNonce`.** Only `snapshot()` does. Seeding is meant to be
  called any number of times to update a demo wallet's story before the next `snapshot()` — the
  importer's nonce check on the CC3 side only cares that each accepted import strictly increases,
  not that seeding is idempotent.
- **A fresh, never-seeded address can still call `snapshot()`** and gets a legitimate all-zero
  "thin history" snapshot (nonce 1), not a revert — this is the "no credit history yet" case the
  checkout onboarding flow needs to demo alongside the "excellent" one.
- **This is an explicit, disclosed demo seed**, not a real lending protocol. WORKFLOW.md's own
  framing: "On mainnet this contract would instead read a real lending protocol; for the hackathon
  the seed is explicit and disclosed." Don't build anything downstream that assumes `seedHistory`
  reflects real activity.
