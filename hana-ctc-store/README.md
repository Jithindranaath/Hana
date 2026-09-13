# @hana/store

Demo storefront — "Pay with Hana" reference merchant integration. Next.js + Framer Motion.

**Status: built and verified live.** Full storefront → checkout → settlement path driven
end to end against the real Merchant API and Checkout Hub (see root `README.md`'s
"what's proven" section).

## Contents

- `lib/products.ts` — a small static catalog. Prices span a range on purpose: cheaper items sit
  under most wallets' score-based credit limit, the chair is priced to exercise the
  `OVERCOLLATERALIZED` fallback for a wallet without much imported history.
- `lib/cart.tsx` — cart state (React context + `localStorage`, same pattern as the merchant
  portal's stored credentials).
- `components/CartDrawer.tsx` — slide-in cart (Framer Motion), "Pay with Hana" checkout button.
- `app/api/checkout/route.ts` — server-side only. Holds this store's own Merchant API credentials
  (never sent to the browser) and creates the bill.

## Commands

```bash
pnpm install   # from the repo root once every package has deps: pnpm install
pnpm dev       # next dev -p 3003
pnpm typecheck
```

## Environment

Copy the relevant block from the repo-root `.env.example`... actually this package isn't in the
root `.env.example` (it's a demo-only integration, not core infra) — set directly in `.env` here:
`MERCHANT_API_URL`, `MERCHANT_CLIENT_ID`, `MERCHANT_CLIENT_SECRET`. Register a merchant account via
`POST /api/merchants/register` on the Merchant API (or its portal's `/register` page) to get the
last two.

## Design notes worth knowing before you touch this code

- **The checkout route recomputes the total server-side from `lib/products.ts`, never from the
  client's request body.** The client sends product IDs + quantities; prices come from the
  catalog on the server. Never trust a client-supplied price for anything that creates a real
  on-chain settlement.
- **This store's Merchant API credentials are server-only** (`MERCHANT_CLIENT_ID`/`SECRET`, no
  `NEXT_PUBLIC_` prefix) — same reasoning as the Checkout Hub's `MERCHANT_INTERNAL_TOKEN`: nothing
  that can create bills against real settlement should reach the browser.
- **The Checkout Hub URL isn't configured here at all.** The redirect target
  (`window.location.href = data.checkoutUrl`) comes straight from the Merchant API's response to
  `POST /api/bills/create` — the store never needs to know where the Checkout Hub lives.
- **Testing note (not a product issue): React hydration is a real race in fast Playwright
  scripts.** A click fired immediately after the target text appears in the DOM can land before
  React has attached its event listeners (the text is there from SSR before hydration completes),
  silently doing nothing. Give the page ~1s after the first meaningful text appears before
  interacting with it in a test.
