# @hana/merchant

Merchant portal + bill API. Next.js (App Router) + MongoDB.

**Status: built.** API + portal UI both functional against a real MongoDB (or the zero-setup
in-memory one below).

## Contents

- `app/api/merchants/register/route.ts` — `POST`, creates a merchant, returns `{ clientId,
  clientSecret }` **once** (only the bcrypt hash is stored).
- `app/api/merchants/me/route.ts` — `GET`, authenticated, returns merchant identity (the portal
  uses this to validate stored credentials).
- `app/api/bills/create/route.ts` — `POST`, `x-client-id`/`x-client-secret` auth, computes
  `billHash`, stores the bill, returns `{ billHash, checkoutUrl, amount, merchant }`.
- `app/api/bills/route.ts` — `GET`, authenticated, lists the caller's own bills (powers the portal).
- `app/api/bills/[billHash]/route.ts` — `GET`, public — the Checkout Hub reads a bill by hash.
- `app/api/bills/[billHash]/status/route.ts` — `POST`, internal (`x-internal-token`, a shared
  secret — not a merchant's own client secret, since checkout/an indexer calls this, not the
  merchant). Marks a bill `originated` / `settled`.
- `app/api/settlements/route.ts` — `GET`, authenticated, live `SettlementVault` event read via
  `@hana/shared` (`lib/chain.ts`) for the merchant's own payout address.
- Portal pages: `/register` (get keys, shown once), `/` (dashboard / "I already have keys"), `/bills`
  (list + create form), `/settlements` (history + a simple SVG revenue chart).

Chain identifiers in every API response are CC3; Sepolia never appears (it's the credit-import
source chain, invisible to the merchant/checkout flow).

## Commands

```bash
pnpm install                # from the repo root once every package has deps: pnpm install

# Zero-setup local MongoDB — no Docker, no account. Run in its own terminal (mirrors
# hana-ctc-contracts's "pnpm node"), then copy the printed MONGODB_URI into .env.
pnpm db:memory

pnpm dev                    # next dev -p 3002
pnpm typecheck
pnpm build && pnpm start    # production
```

## Environment

Copy the relevant block from the repo-root `.env.example` into `.env` here:
`MONGODB_URI`, `MERCHANT_API_PORT`, `CHECKOUT_BASE_URL`, `MERCHANT_INTERNAL_TOKEN`, `CC3_RPC_URL`,
`SETTLEMENT_VAULT_DEPLOY_BLOCK`.

## Design notes worth knowing before you touch this code

- **Money is on-chain; this only stores metadata**, joined by `billHash` (WORKFLOW.md rule #8).
  `bills` never records an amount as anything other than a decimal string — it's display/API
  metadata, not the source of truth for what actually settles on `SettlementVault`.
- **`billHash = keccak256(clientId, reference, amount, nonce)`** (`lib/billHash.ts`), where `nonce`
  is an atomically-incremented per-merchant counter (`$inc` on `merchants.billCounter`) — this is
  what makes the hash collision-free even for identical `{reference, amount}` pairs from the same
  merchant.
- **`POST /api/bills/:billHash/status` is not merchant-authenticated.** It's called by the
  checkout app or an on-chain indexer, neither of which has (or should have) a merchant's own
  client secret. It uses a separate shared `MERCHANT_INTERNAL_TOKEN` instead.
- **The portal never has its own login/session system.** After registering (or pasting existing
  keys on `/`), the client ID + secret live in the browser's `localStorage`
  (`lib/clientAuth.ts`) and are sent as headers on every API call the portal itself makes — the
  portal is just a browser-side client of its own public API, not a separately-authenticated app.
  Don't build a cookie/JWT session layer on top of this without a reason; it isn't needed for
  what WORKFLOW.md 6.2 asks for.
- **`mongodb-memory-server` downloads a real `mongod` binary** (~600MB) the first time
  `pnpm db:memory` (or `pnpm install`'s postinstall) runs — this needs network access once, then
  it's cached under the repo's `node_modules/.cache`. Its data is in-memory only; point
  `MONGODB_URI` at a real MongoDB for anything that must survive a restart.
