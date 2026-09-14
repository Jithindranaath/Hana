"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/bills", label: "Bills" },
  { href: "/settlements", label: "Settlements" },
  { href: "/register", label: "Register" },
];

export function MerchantNav() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative whitespace-nowrap rounded-ctl px-3 py-2 text-sm transition-colors duration-100",
              active ? "text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
            )}
          >
            {l.label}
            {active ? <span className="absolute inset-x-3 -bottom-px h-px bg-grad-accent-r" aria-hidden /> : null}
          </Link>
        );
      })}
    </div>
  );
}
