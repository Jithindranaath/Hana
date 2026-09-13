# @hana/docs

Protocol documentation and the Attestcoin technical write-up. Next.js + Tailwind Typography.
Phase 9.1 of [`WORKFLOW.md`](../WORKFLOW.md).

**Status: built and verified live.** Five pages, each rendered in a real browser (Playwright)
against the running dev server with zero console errors.

## Pages

- `/` — overview: what Hana is, status snapshot, links to the rest of the docs.
- `/architecture` — the cross-chain import flow (hand-drawn inline SVG diagram, no external
  library), the import walked step by step, and the cross-cutting design rules from
  `WORKFLOW.md`.
- `/attestcoin` — the full technical write-up: the real `INativeQueryVerifier` interface (as
  confirmed live in Phase 1, not the original wrong guess), how proofs are generated via
  `@gluwa/usc-sdk`, and each of `CreditImporterASC`'s four checks linked to its exact negative
  test name in `hana-ctc-contracts/test/CreditImporterASC.t.ts`.
- `/addresses` — deployed contract addresses on both chains, imported directly from
  `@hana/shared/src/generated/{cc3,sepolia}.ts` (never hand-typed — if this page and a
  package's runtime ever disagree, this page is wrong).
- `/integrate` — the one-line `getCreditLimit(address, asset)` call, the full `ICreditRegistry`
  interface, and what a third-party contract is (and isn't) trusting by reading it.

## Design notes

- **No placeholder links.** An early draft of `/` linked to a guessed GitHub URL as a stand-in
  for "read the root README" — caught before shipping and replaced with a plain-text reference,
  since the actual repository URL was never confirmed.
- **The flow diagram is a hand-coded inline SVG**, not a diagramming library — a handful of
  boxes and arrows didn't justify a dependency, and it keeps the page's bundle size and load
  time identical to the rest of the site.
- **The addresses page has no fallback data.** If `@hana/shared`'s generated files are stale or
  a network's deployment is missing, the table renders "No deployments recorded for this network
  yet." rather than a stale or fabricated address.

## Run it

```bash
pnpm --filter @hana/docs dev     # http://localhost:3004
pnpm --filter @hana/docs typecheck
```

No environment variables — everything it renders is either static prose or imported from
`@hana/shared`, which is populated by `pnpm sync:abis`.
