"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const LINKS = [
  { href: "/", label: "Profile" },
  { href: "/link-history", label: "Link history" },
  { href: "/dashboard", label: "Loans" },
  { href: "/credit-line", label: "Credit line" },
  { href: "/lend", label: "Lend" },
];

export function NavLinks() {
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
              active ? "text-fg" : "text-fg-muted hover:text-fg hover:bg-surface-2"
            )}
          >
            {l.label}
            {/* The active marker is a gradient underline rather than a filled pill — it reads
                at a glance on video without boxing in the label. */}
            {active ? (
              <span
                className="absolute inset-x-3 -bottom-px h-px bg-grad-accent-r"
                aria-hidden
              />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
