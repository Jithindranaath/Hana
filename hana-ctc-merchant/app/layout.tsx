import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Hana Merchant Portal",
  description: "Manage API keys, bills, and settlements for Hana CTC.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <nav className="border-b border-slate-800 px-6 py-4 flex gap-6 items-center text-sm">
          <Link href="/" className="font-semibold text-base">
            Hana Merchant
          </Link>
          <Link href="/bills" className="text-slate-300 hover:text-white">
            Bills
          </Link>
          <Link href="/settlements" className="text-slate-300 hover:text-white">
            Settlements
          </Link>
          <Link href="/register" className="ml-auto text-slate-300 hover:text-white">
            Register
          </Link>
        </nav>
        <main className="max-w-4xl mx-auto px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
