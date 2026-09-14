import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono } from "next/font/google";
import { DocsNav } from "@/components/DocsNav";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Hana Docs",
  description: "Architecture, the Attestcoin write-up, deployed addresses, and an integration guide for Hana.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">
        <div className="flex">
          <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line px-4 py-6 sm:block">
            <Link href="/" className="mb-7 flex items-center gap-2 rounded-ctl text-[15px] font-semibold tracking-tight2">
              <span className="h-5 w-5 rounded-md bg-grad-accent shadow-glow-accent" aria-hidden />
              Hana
              <span className="text-fg-subtle">Docs</span>
            </Link>
            <DocsNav />
            <div className="mt-7 border-t border-line pt-5">
              <span className="chip border-warn/30 bg-warn/10 text-warn">CC3 Testnet</span>
            </div>
          </aside>

          <main className="surface-mesh min-h-screen flex-1">
            <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-10">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
