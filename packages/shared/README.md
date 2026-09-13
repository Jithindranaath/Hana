# @hana/shared

Single source of truth for chain config, generated ABIs/addresses, and cross-package TypeScript types.
Nothing else in the monorepo should hand-copy a contract address or ABI — see `WORKFLOW.md` rule #1.

- `src/chain.ts` — CC3 / Sepolia / Attestcoin constants, all confirmed live during WORKFLOW.md
  Phase 0.3 / 1.1 (chain IDs, the `0x0FD2`/`0x0FD3` precompiles, `sourceChainKey=1` for Sepolia,
  and the Blockscout explorer URL every CC3 contract is actually verified on).
- `src/types.ts` — `LoanType`, `LoanStatus`, `ReleaseType`, `CreditProfile`, the worker's `ImportStatus` shape.
- `src/generated/<network>.ts` — **auto-generated**, one file per network, produced by
  `pnpm sync:abis` (which runs `hana-ctc-contracts` and `hana-ctc-attestor`'s `export:abis` scripts).
  Do not hand-edit; re-run the sync instead. Not present until the first deploy.
