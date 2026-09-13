"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "@/lib/cart";
import { PRODUCTS } from "@/lib/products";

export function CartDrawer() {
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        onClick={() => setOpen(true)}
        className="fixed top-6 right-6 z-40 rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium shadow-lg hover:bg-indigo-500"
      >
        Cart ({cart.count})
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="fixed top-0 right-0 h-full w-full max-w-sm bg-slate-900 border-l border-slate-800 z-50 p-6 flex flex-col"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">Your cart</h2>
                <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
                  ✕
                </button>
              </div>

              {cart.lines.length === 0 ? (
                <p className="text-slate-500 text-sm">Nothing here yet.</p>
              ) : (
                <div className="flex-1 space-y-4 overflow-y-auto">
                  {cart.lines.map((line) => {
                    const product = PRODUCTS.find((p) => p.id === line.productId);
                    if (!product) return null;
                    return (
                      <div key={line.productId} className="flex items-center gap-3">
                        <span className="text-2xl">{product.emoji}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{product.name}</p>
                          <p className="text-xs text-slate-500">{product.price} iUSDC each</p>
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={line.quantity}
                          onChange={(e) => cart.setQuantity(line.productId, Number(e.target.value))}
                          className="w-14 rounded bg-slate-800 border border-slate-700 px-2 py-1 text-sm text-center"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-4 border-t border-slate-800 mt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Total</span>
                  <span className="font-semibold">{cart.total.toFixed(2)} iUSDC</span>
                </div>
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <button
                  onClick={checkout}
                  disabled={cart.lines.length === 0 || checkingOut}
                  className="w-full rounded bg-indigo-600 px-4 py-3 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
                >
                  {checkingOut ? "Redirecting..." : "Pay with Hana"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
