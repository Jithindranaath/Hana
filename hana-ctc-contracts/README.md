# @hana/contracts

Core protocol on Creditcoin CC3 Testnet: `iUSDC`, `CreditRegistry`, `LendingPool`, `SettlementVault`,
`LoanManager`, `CreditImporterASC`. Solidity `^0.8.23` (compiled with `0.8.24`), Hardhat, OpenZeppelin `5.1.0`.

Status: **logic complete, 38/38 tests passing, full system (including the importer) deployed +
verified + wired on CC3.** `IAttestcoin` is confirmed against the real Attestcoin precompile
(Phase 1 spike, see `planning/attestation-latency.md`) — no longer a guess.

| Contract | CC3 address |
|---|---|
| `IUSDC` | [`0xe517Ff9Db1111A9e81A34AD512E7dc438DdB0f4a`](https://creditcoin-testnet.blockscout.com/address/0xe517Ff9Db1111A9e81A34AD512E7dc438DdB0f4a#code) |
| `CreditRegistry` | [`0x856440a7dCF92371914C37E23724c85575541590`](https://creditcoin-testnet.blockscout.com/address/0x856440a7dCF92371914C37E23724c85575541590#code) |
| `LendingPool` | [`0xcB08F80fFF56C7110Eca231CafBCd2AdD5363a43`](https://creditcoin-testnet.blockscout.com/address/0xcB08F80fFF56C7110Eca231CafBCd2AdD5363a43#code) |
| `SettlementVault` | [`0xf817e4b94914b70C00e086F30d9924Fb60C7f271`](https://creditcoin-testnet.blockscout.com/address/0xf817e4b94914b70C00e086F30d9924Fb60C7f271#code) |
| `LoanManager` | [`0x3D34eD7926a1cE457DaE97dA8f00F6302b0332b9`](https://creditcoin-testnet.blockscout.com/address/0x3D34eD7926a1cE457DaE97dA8f00F6302b0332b9#code) |
| `CreditImporterASC` | [`0x32c784848B052dFe1a2480A4fdC3eAcad7781940`](https://creditcoin-testnet.blockscout.com/address/0x32c784848B052dFe1a2480A4fdC3eAcad7781940#code) |

All verified. Pool seeded with 50,000 iUSDC from the deployer. `registry.importerASC()` and
`importer.attestorOf(1)` confirmed live to point at `CreditImporterASC` and `HanaCreditAttestor`
(Sepolia) respectively — a real cross-chain import can be submitted against this deployment today.
Scripted smoke test (`pnpm smoke:cc3`: faucet → deposit → originate an `OVERCOLLATERALIZED` loan →
repay) passes against this live deployment.

## Contracts

| Contract | Purpose |
|---|---|
| `tokens/IUSDC.sol` | Mock USD stablecoin, 6 decimals, rate-limited public faucet |
| `CreditRegistry.sol` | The public credit primitive — two write paths, governable scoring & limit curve |
| `LendingPool.sol` | ERC4626 vault (`ipUSDC` shares), kinked utilization rate, cash-basis interest |
| `SettlementVault.sol` | Merchant settlement escrow — immediate / time-locked / conditional release |
| `LoanManager.sol` | Origination, servicing, completion and liquidation for all four loan types |
| `CreditImporterASC.sol` | Verifies an Attestcoin `CreditSnapshot` via the `0x0FD2` precompile and imports it |
| `libraries/ScoreModel.sol` | Pure scoring math (sub-scores, composite, limit curve) |
| `libraries/RateModel.sol` | Pure kinked utilization → borrow-rate curve |
| `interfaces/*` | The cross-contract surface, including `IAttestcoin` (confirmed live against the real precompile) |
| `mocks/*` | `MockAttestcoin` (configurable verify/txIndex responses for the importer's negative tests), `MockERC20` |

## Commands

```bash
pnpm install --ignore-workspace   # or from the repo root once every package has deps: pnpm install
pnpm build                        # hardhat compile
pnpm test                         # 38 tests: registry, pool, vault, loan lifecycle x4 types, importer x4 checks + 1
pnpm coverage                     # istanbul coverage report

pnpm node                         # local Hardhat node (separate terminal)
pnpm deploy:local                 # deploy core system to it
pnpm run scripts/deploy-importer.ts --network localhost   # deploy + wire the importer

pnpm deploy:cc3                   # deploy core system to CC3 (needs CC3_DEPLOYER_PRIVATE_KEY funded)
pnpm deploy:importer:cc3          # deploy + wire CreditImporterASC on CC3
pnpm verify:cc3                   # verify every recorded contract on the CC3 explorer
pnpm export:abis                  # publish addresses + ABIs to packages/shared/src/generated/<network>.ts
```

## Environment

Copy the relevant block from the repo-root `.env.example` into `.env` here:
`CC3_RPC_URL`, `CC3_CHAIN_ID`, `CC3_DEPLOYER_PRIVATE_KEY`, `TREASURY_ADDRESS`,
`ATTESTCOIN_PRECOMPILE`, `HANA_CREDIT_ATTESTOR_ADDRESS`, `SOURCE_CHAIN_KEY`,
`CC3_EXPLORER_API_URL` / `CC3_EXPLORER_URL`.

## Known flaky exit crash on Windows + very new Node (not a real test failure)

`pnpm test` can occasionally exit with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
file src\win\async.c, line 76` right after printing the passing count. This is a native-addon/libuv
teardown race in Hardhat's crypto dependencies (`keccak`, `secp256k1`) on Windows, triggered by a
Node version much newer than what Hardhat 2.x's prebuilt binaries were built against — see
`../hana-ctc-attestor/README.md`'s note on this (same dependency, same root cause) for details and
workarounds. The tests already passed by the time it happens.

## Design notes worth knowing before you touch this code

- **Two write paths into `CreditRegistry`, period.** `recordNativeActivity` (`onlyLoanManager`) and
  `importAttestedHistory` (`onlyImporterASC`). The LP-deposit score bonus is **pull-based** — the
  registry calls `lendingPool.maxWithdraw(user)` at score-recompute time — specifically so it isn't a
  third writer. See `CreditRegistry._lpBonus`.
- **Imported history is always weighted below native** via `importWeightBps` (default 6000 / 60%),
  enforced both in `ScoreModel` and by `setImportWeightBps` requiring `< 10000`.
- **Units**: `iUSDC` is 6dp; imported `cumulativeBorrowedWei` from the attestor is normalized to 1e18.
  `CreditRegistry._recompute` converts native amounts (`* 1e12`) before calling `ScoreModel.volumeSubscore`.
  Don't compare raw native and imported volume without going through that conversion.
- **`INSTALLMENT` loans amortize interest fixed at origination**; `TERM` / `REVOLVING` /
  `OVERCOLLATERALIZED` accrue on the outstanding balance via `LoanManager._accrue`. Don't mix the two
  patterns on one loan type.
- **The importer's four checks are ordered**: replay → receipt status → emitter → nonce. Each has a
  dedicated negative test in `test/CreditImporterASC.t.ts` — if you touch `importFromQuery`, update those.
- **`IAttestcoin` is confirmed live** (Phase 1 spike: `hello-bridge` run unmodified + a from-scratch
  `Ping`/`PingImporter` pair deployed and run end to end — see `planning/attestation-latency.md`).
  The real precompile (`verifyAndEmit`/`verify`/`calculateTxIndex`) only proves Merkle inclusion +
  continuity; it does **not** decode the transaction. `CreditImporterASC` decodes receipt status and
  logs from `encodedTransaction` itself via `@gluwa/asc-contracts`'s `EvmV1Decoder` (an all-`internal
  pure` library — no extra deployed contract). It deliberately does not inherit that package's
  `ASCBase` (which hardcodes the precompile at its fixed address); keeping `attestcoin`
  constructor-injected keeps `MockAttestcoin` swappable at an ordinary address in tests instead of
  needing an EVM cheatcode to install a mock at the precompile's address.
- **OpenZeppelin must stay pinned to the exact version `5.1.0`** (not `^5.1.0`) because
  `@gluwa/asc-contracts` (added for `EvmV1Decoder`, see above) depends on a newer OZ range;
  a caret range here lets pnpm hoist 5.6.x, whose `ERC4626` needs a Cancun-era `mcopy` opcode and
  breaks the "paris" EVM target this project compiles for. If `pnpm build` ever fails with an
  `mcopy` error, check `node_modules/@openzeppelin/contracts/package.json` — it means this pin got
  loosened. `hardhat.config.ts` compiles at two solc versions (`0.8.24` for this package's own
  contracts, `0.8.28` for `EvmV1Decoder`, both pinned to `evmVersion: "paris"`) via a per-file
  override — see its comments before changing either.
