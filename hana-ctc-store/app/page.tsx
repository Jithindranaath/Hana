"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CartDrawer } from "@/components/CartDrawer";
import { useCart } from "@/lib/cart";
import { PRODUCTS } from "@/lib/products";

export default function HomePage() {
  const cart = useCart();
  const reduce = useReducedMotion();

  return (
    <div className="surface-mesh min-h-screen">
      <CartDrawer />

      <header className="relative mx-auto max-w-5xl px-4 pb-8 pt-14 md:px-6">
        <span className="chip border-accent/30 bg-accent/10 text-accent-hi">Reference storefront</span>
        <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.1] tracking-display md:text-5xl">
          Buy it now.<br />
          <span className="gradient-text">Pay with your reputation.</span>
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-fg-muted">
          Checkout here runs on Hana — split any purchase into instalments backed by your on-chain
          credit history. No bank, no card, no application.
        </p>
      </header>

      <main className="relative mx-auto grid max-w-5xl grid-cols-1 gap-4 px-4 pb-24 sm:grid-cols-2 md:px-6 lg:grid-cols-3">
        {PRODUCTS.map((product, i) => (
          <motion.article
            key={product.id}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: reduce ? 0 : i * 0.04, ease: [0, 0, 0.2, 1] }}
            className="card card-hover flex flex-col p-5"
          >
            <div className="mb-4 grid h-20 place-items-center rounded-ctl bg-grad-accent-soft text-4xl" aria-hidden>
              {product.emoji}
            </div>
            <h2 className="text-sm font-medium">{product.name}</h2>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-fg-muted">{product.description}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="flex items-baseline gap-1">
                <span className="mono text-lg font-semibold">{product.price}</span>
                <span className="text-xs text-fg-subtle">iUSDC</span>
              </p>
              <button
                onClick={() => cart.add(product.id)}
                className="btn btn-secondary"
                aria-label={`Add ${product.name} to cart`}
              >
                Add to cart
              </button>
            </div>
          </motion.article>
        ))}
      </main>
    </div>
  );
}
