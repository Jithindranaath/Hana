"use client";

import * as React from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ layout */

export function Card({
  className,
  accent,
  hover,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { accent?: boolean; hover?: boolean }) {
  return (
    <div
      className={cx("card", accent && "card-accent", hover && "card-hover", "p-5", className)}
      {...rest}
    />
  );
}

export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        <h2 className="text-sm font-medium text-fg">{title}</h2>
        {hint ? <p className="text-xs text-fg-subtle mt-0.5">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ status */

const TONES = {
  neutral: "bg-surface-2 text-fg-muted border-line-strong",
  accent: "bg-accent/12 text-accent-hi border-accent/30",
  pos: "bg-pos/12 text-pos border-pos/30",
  warn: "bg-warn/12 text-warn border-warn/30",
  neg: "bg-neg/12 text-neg border-neg/30",
} as const;

export type Tone = keyof typeof TONES;

export function Chip({
  tone = "neutral",
  dot,
  pulse,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const dotColor = {
    neutral: "bg-fg-subtle",
    accent: "bg-accent",
    pos: "bg-pos",
    warn: "bg-warn",
    neg: "bg-neg",
  }[tone];
  return (
    <span className={cx("chip", TONES[tone], className)}>
      {dot ? (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {pulse ? (
            <span
              className={cx("absolute inset-0 rounded-full motion-safe:animate-ring-out", dotColor)}
              aria-hidden
            />
          ) : null}
          <span className={cx("relative h-1.5 w-1.5 rounded-full", dotColor)} aria-hidden />
        </span>
      ) : null}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ numbers */

/**
 * A labelled figure. `value` is rendered in tabular mono so a number that updates in place
 * never shifts the characters around it.
 */
export function Stat({
  label,
  value,
  unit,
  sub,
  tone,
  size = "md",
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  tone?: "accent" | "pos" | "neg";
  size?: "sm" | "md" | "lg";
}) {
  const sizes = { sm: "text-lg", md: "text-2xl", lg: "text-4xl" }[size];
  const toneCls = tone ? { accent: "text-accent-hi", pos: "text-pos", neg: "text-neg" }[tone] : "text-fg";
  return (
    <div>
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className={cx("mono font-semibold tracking-tight2", sizes, toneCls)}>{value}</span>
        {unit ? <span className="text-xs text-fg-subtle">{unit}</span> : null}
      </p>
      {sub ? <p className="text-xs text-fg-subtle mt-1">{sub}</p> : null}
    </div>
  );
}

/**
 * Counts from the previous value to the next one. Capped at 480ms — long enough to read as
 * movement on camera, short enough to stay inside the motion budget. Honours reduced motion
 * by snapping straight to the target.
 */
export function useCountUp(target: number, durationMs = 480) {
  const [display, setDisplay] = React.useState(target);
  const fromRef = React.useRef(target);

  React.useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    if (reduce || from === target) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return display;
}

/* ------------------------------------------------------------------ states */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

/** Skeletons mirror the shape of what's coming so nothing jumps when data lands. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card p-5 space-y-3">
      <Skeleton className="h-3 w-24" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card p-10 flex flex-col items-center text-center gap-3">
      <div className="h-10 w-10 rounded-full bg-grad-accent-soft border border-line-strong grid place-items-center">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-fg-subtle" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M3 7h18M3 12h18M3 17h10" strokeLinecap="round" />
        </svg>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="text-xs text-fg-muted max-w-xs">{body}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-card border border-neg/25 bg-neg/5 p-5 space-y-3">
      <div className="flex items-center gap-2 text-neg">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16.5v.01" strokeLinecap="round" />
        </svg>
        <p className="text-sm font-medium">{title}</p>
      </div>
      {detail ? <p className="text-xs text-fg-muted break-words">{detail}</p> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn btn-secondary">
          Try again
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ chain */

export function truncate(addr: string, chars = 4) {
  if (!addr || addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}

/** Truncated for scanning, copyable for use, full value recoverable via the native tooltip. */
export function AddressChip({ address, href }: { address: string; href?: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (insecure origin / denied permission) — the title attribute still
         exposes the full address for manual selection, so fail quietly rather than alarm. */
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={copy}
        title={address}
        aria-label={copied ? "Address copied" : `Copy address ${address}`}
        className="mono text-xs text-fg-muted hover:text-fg transition-colors duration-100 px-1.5 py-1 rounded-ctl hover:bg-surface-2"
      >
        {copied ? "Copied" : truncate(address)}
      </button>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label="View on Blockscout"
          className="text-fg-subtle hover:text-accent-hi transition-colors duration-100 p-1 rounded-ctl"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      ) : null}
    </span>
  );
}
