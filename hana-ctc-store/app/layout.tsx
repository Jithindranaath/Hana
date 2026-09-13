import "./globals.css";
import type { Metadata } from "next";
import { CartProvider } from "@/lib/cart";

export const metadata: Metadata = {
  title: "Hana Demo Store",
  description: "A reference storefront that pays with Hana — BNPL backed by your on-chain credit history.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
