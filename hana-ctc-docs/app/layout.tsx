import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Hana Docs",
  description: "Architecture, the Attestcoin write-up, deployed addresses, and an integration guide for Hana.",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/architecture", label: "Architecture" },
  { href: "/attestcoin", label: "Attestcoin" },
  { href: "/addresses", label: "Addresses" },
  { href: "/integrate", label: "Integrate" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <div className="flex">
          <aside className="w-56 shrink-0 border-r border-slate-800 min-h-screen px-4 py-6 hidden sm:block">
            <Link href="/" className="font-semibold text-lg block mb-6">
              Hana Docs
            </Link>
            <nav className="space-y-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="flex-1 max-w-3xl px-6 sm:px-10 py-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
