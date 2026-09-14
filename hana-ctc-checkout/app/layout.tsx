import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Providers } from "./providers";
import { NavLinks } from "@/components/NavLinks";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Hana Checkout",
  description: "Prove your credit history, borrow against it, pay with Hana.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">
        <Providers>
          <header className="sticky top-0 z-40 border-b border-line bg-base/85 backdrop-blur-xl">
            <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 md:px-6">
              <Link
                href="/"
                className="flex shrink-0 items-center gap-2 rounded-ctl pr-2 text-[15px] font-semibold tracking-tight2"
              >
                <span className="h-5 w-5 rounded-md bg-grad-accent shadow-glow-accent" aria-hidden />
                Hana
              </Link>

              <nav aria-label="Primary" className="min-w-0 flex-1">
                <NavLinks />
              </nav>

              <div className="hidden shrink-0 md:block">
                {/* Testnet is called out in the chrome so nobody mistakes a demo for mainnet. */}
                <span className="chip border-warn/30 bg-warn/10 text-warn">CC3 Testnet</span>
              </div>
              <div className="shrink-0">
                <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
              </div>
            </div>
            <div className="hairline" aria-hidden />
          </header>

          <main className="surface-mesh min-h-[calc(100vh-57px)]">
            <div className="relative mx-auto max-w-5xl px-4 py-10 md:px-6">{children}</div>
          </main>
        </Providers>
      </body>
    </html>
  );
}
