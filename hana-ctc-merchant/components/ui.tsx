"use client";

import * as React from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  className,
  accent,
  hover,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { accent?: boolean; hover?: boolean }) {
  return (
    <div className={cx("card", accent && "card-accent", hover && "card-hover", "p-5", className)} {...rest} />
  );
}

const TONES = {
  neutral: "bg-surface-2 text-fg-muted border-line-strong",
  accent: "bg-accent/12 text-accent-hi border-accent/30",
  pos: "bg-pos/12 text-pos border-pos/30",
  warn: "bg-warn/12 text-warn border-warn/30",
  neg: "bg-neg/12 text-neg border-neg/30",
} as const;

export type Tone = keyof typeof TONES;

export function Chip({ tone = "neutral", dot, children, className }: {
  tone?: Tone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const dotColor = { neutral: "bg-fg-subtle", accent: "bg-accent", pos: "bg-pos", warn: "bg-warn", neg: "bg-neg" }[tone];
  return (
    <span className={cx("chip", TONES[tone], className)}>
      {dot ? <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", dotColor)} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full border border-line-strong bg-grad-accent-soft">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-fg-subtle" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M4 5h16v14H4z" />
          <path d="M8 9h8M8 13h5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="max-w-xs text-xs text-fg-muted">{body}</p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  return (
    <div className="space-y-3 rounded-card border border-neg/25 bg-neg/5 p-5">
      <div className="flex items-center gap-2 text-neg">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16.5v.01" strokeLinecap="round" />
        </svg>
        <p className="text-sm font-medium">{title}</p>
      </div>
      {detail ? <p className="break-words text-xs text-fg-muted">{detail}</p> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn btn-secondary">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs text-fg-muted">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-fg-subtle">{hint}</span> : null}
    </label>
  );
}

export function CopyText({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const t = React.useRef<ReturnType<typeof setTimeout>>();
  React.useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button
      type="button"
      title={value}
      aria-label={copied ? "Copied" : `Copy ${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          clearTimeout(t.current);
          t.current = setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — the title attribute still exposes the full value */
        }
      }}
      className={cx(
        "mono rounded-ctl px-1.5 py-1 text-xs text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg",
        className
      )}
    >
      {copied ? "Copied" : value}
    </button>
  );
}
