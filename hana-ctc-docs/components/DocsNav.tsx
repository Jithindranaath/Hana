"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/integrate", label: "Build on Hana" },
  { href: "/architecture", label: "Architecture" },
  { href: "/attestcoin", label: "Attestcoin" },
  { href: "/addresses", label: "Addresses" },
];

export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Documentation" className="space-y-0.5">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "relative block rounded-ctl bg-surface-2 px-3 py-2 text-sm text-fg"
                : "block rounded-ctl px-3 py-2 text-sm text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg"
            }
          >
            {active ? (
              <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-grad-accent" aria-hidden />
            ) : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
