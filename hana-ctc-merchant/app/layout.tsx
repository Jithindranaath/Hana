import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono } from "next/font/google";
import { MerchantNav } from "@/components/MerchantNav";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Hana Merchant Portal",
  description: "Manage API keys, bills, and settlements for Hana CTC.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">
        <header className="sticky top-0 z-40 border-b border-line bg-base/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 md:px-6">
            <Link href="/" className="flex shrink-0 items-center gap-2 rounded-ctl pr-2 text-[15px] font-semibold tracking-tight2">
              <span className="h-5 w-5 rounded-md bg-grad-accent shadow-glow-accent" aria-hidden />
              Hana
              <span className="text-fg-subtle">Merchant</span>
            </Link>
            <nav aria-label="Primary" className="min-w-0 flex-1">
              <MerchantNav />
            </nav>
            <span className="chip hidden border-warn/30 bg-warn/10 text-warn md:inline-flex">CC3 Testnet</span>
          </div>
          <div className="hairline" aria-hidden />
        </header>
        <main className="surface-mesh min-h-[calc(100vh-57px)]">
          <div className="relative mx-auto max-w-5xl px-4 py-10 md:px-6">{children}</div>
        </main>
      </body>
    </html>
  );
}
