"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCart } from "@/lib/cart";
import { PRODUCTS } from "@/lib/products";

export function CartDrawer() {
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and focus returns to the button that opened it — otherwise keyboard users
  // are dumped back at the top of the document.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) triggerRef.current?.focus();
  }, [open]);

  async function checkout() {
    setCheckingOut(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines: cart.lines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "checkout failed");
      cart.clear();
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      setError(err.message);
      setCheckingOut(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="btn btn-primary fixed right-4 top-5 z-40 md:right-6"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 6h15l-1.5 9h-12z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 6L5 3H3" strokeLinecap="round" />
          <circle cx="9" cy="20" r="1.5" />
          <circle cx="18" cy="20" r="1.5" />
        </svg>
        Cart
        {cart.count > 0 ? (
          <span className="mono ml-0.5 rounded-full bg-black/25 px-1.5 text-xs">{cart.count}</span>
        ) : null}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Your cart"
              tabIndex={-1}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-line bg-surface p-6 shadow-pop outline-none"
              initial={reduce ? { opacity: 0 } : { x: "100%" }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: "100%" }}
              transition={reduce ? { duration: 0.15 } : { type: "spring", damping: 32, stiffness: 320 }}
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-base font-semibold tracking-tight2">Your cart</h2>
                <button onClick={() => setOpen(false)} aria-label="Close cart" className="btn btn-ghost h-10 w-10 p-0">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {cart.lines.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                  <p className="text-sm font-medium">Your cart is empty</p>
                  <p className="max-w-[15rem] text-xs text-fg-muted">
                    Add something from the store and pay for it in instalments.
                  </p>
                </div>
              ) : (
                <ul className="flex-1 space-y-3 overflow-y-auto">
                  {cart.lines.map((line) => {
                    const product = PRODUCTS.find((p) => p.id === line.productId);
                    if (!product) return null;
                    return (
                      <li key={line.productId} className="flex items-center gap-3 rounded-ctl bg-surface-2 p-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-ctl bg-grad-accent-soft text-xl" aria-hidden>
                          {product.emoji}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{product.name}</p>
                          <p className="mono text-xs text-fg-subtle">{product.price} iUSDC each</p>
                        </div>
                        <label className="sr-only" htmlFor={`qty-${line.productId}`}>
                          Quantity of {product.name}
                        </label>
                        <input
                          id={`qty-${line.productId}`}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={line.quantity}
                          onChange={(e) => cart.setQuantity(line.productId, Number(e.target.value))}
                          className="input mono w-16 px-2 text-center"
                        />
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-4 space-y-3 border-t border-line pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-fg-muted">Total</span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="mono text-xl font-semibold">{cart.total.toFixed(2)}</span>
                    <span className="text-xs text-fg-subtle">iUSDC</span>
                  </span>
                </div>
                {error ? (
                  <p className="rounded-ctl border border-neg/25 bg-neg/5 p-3 text-xs text-neg">{error}</p>
                ) : null}
                <button
                  onClick={checkout}
                  disabled={cart.lines.length === 0 || checkingOut}
                  aria-busy={checkingOut}
                  className="btn btn-primary w-full py-3"
                >
                  {checkingOut ? "Redirecting…" : "Pay with Hana"}
                </button>
                <p className="text-center text-xs text-fg-subtle">
                  Split into instalments against your on-chain credit.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
