import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Hana Checkout",
  description: "Prove your credit history, borrow against it, pay with Hana.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <Providers>
          <nav className="border-b border-slate-800 px-6 py-4 flex gap-6 items-center text-sm">
            <Link href="/" className="font-semibold text-base">
              Hana
            </Link>
            <Link href="/link-history" className="text-slate-300 hover:text-white">
              Link history
            </Link>
            <Link href="/dashboard" className="text-slate-300 hover:text-white">
              Dashboard
            </Link>
            <Link href="/lend" className="text-slate-300 hover:text-white">
              Lend
            </Link>
            <div className="ml-auto">
              <ConnectButton />
            </div>
          </nav>
          <main className="max-w-3xl mx-auto px-6 py-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
