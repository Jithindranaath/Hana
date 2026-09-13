"use client";

import { motion } from "framer-motion";
import { CartDrawer } from "@/components/CartDrawer";
import { useCart } from "@/lib/cart";
import { PRODUCTS } from "@/lib/products";

export default function HomePage() {
  const cart = useCart();

  return (
    <div>
      <CartDrawer />
      <header className="max-w-5xl mx-auto px-6 pt-10 pb-6">
        <h1 className="text-3xl font-semibold">Hana Demo Store</h1>
        <p className="text-slate-400 mt-2 max-w-lg">
          A reference storefront. Checkout is powered by Hana — pay in installments backed by
          your on-chain credit history, no bank required.
        </p>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {PRODUCTS.map((product, i) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -4 }}
            className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col"
          >
            <div className="text-5xl mb-4">{product.emoji}</div>
            <h2 className="font-medium">{product.name}</h2>
            <p className="text-slate-500 text-sm mt-1 flex-1">{product.description}</p>
            <div className="flex items-center justify-between mt-4">
              <span className="font-semibold">{product.price} iUSDC</span>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => cart.add(product.id)}
                className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500"
              >
                Add to cart
              </motion.button>
            </div>
          </motion.div>
        ))}
      </main>
    </div>
  );
}
