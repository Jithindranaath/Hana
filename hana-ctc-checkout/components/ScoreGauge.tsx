"use client";

import * as React from "react";
import { useCountUp, cx } from "./ui";

const FLOOR = 300;
const CEIL = 850;
/** Semicircle of radius 88 — the sweep length the dash offset is computed against. */
const ARC = Math.PI * 88;

function band(score: number) {
  if (score >= 740) return { label: "Excellent", tone: "text-pos" };
  if (score >= 670) return { label: "Good", tone: "text-aqua" };
  if (score >= 580) return { label: "Fair", tone: "text-warn" };
  return { label: "Building", tone: "text-fg-muted" };
}

/**
 * The emotional beat of the whole product: an imported cross-chain history turning into a
 * number. The arc sweeps and the digits count on mount and on every change, so the 300 → 788
 * jump after an import is legible on camera rather than a silent re-render.
 */
export function ScoreGauge({
  score,
  imported,
  className,
}: {
  score: number;
  imported: boolean;
  className?: string;
}) {
  const shown = useCountUp(score);
  const pct = Math.max(0, Math.min(1, (score - FLOOR) / (CEIL - FLOOR)));
  const { label, tone } = band(score);

  return (
    <div className={cx("flex flex-col items-center", className)}>
      <div className="relative w-full max-w-[300px]">
        <svg viewBox="0 0 200 116" className="w-full" role="img" aria-label={`Credit score ${score} of ${CEIL}`}>
          <defs>
            <linearGradient id="hana-score" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7C5CFF" />
              <stop offset="55%" stopColor="#22D3EE" />
              <stop offset="100%" stopColor="#34D399" />
            </linearGradient>
          </defs>

          <path
            d="M 12 104 A 88 88 0 0 1 188 104"
            fill="none"
            stroke="#1E2331"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M 12 104 A 88 88 0 0 1 188 104"
            fill="none"
            stroke="url(#hana-score)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={ARC}
            strokeDashoffset={ARC - ARC * pct}
            className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500 motion-safe:ease-out"
          />
        </svg>

        {/* Optically centred inside the arc rather than the viewBox: the semicircle's visual
            mass sits above the baseline, so the figure is pulled up off dead centre. */}
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
          <span className="mono text-5xl font-semibold tracking-display text-fg leading-none">
            {shown}
          </span>
          <span className={cx("text-xs font-medium mt-1.5", tone)}>{label}</span>
        </div>
      </div>

      <div className="flex w-full max-w-[300px] justify-between text-[11px] text-fg-subtle mono -mt-1">
        <span>{FLOOR}</span>
        <span>{CEIL}</span>
      </div>

      <p className="text-xs text-fg-muted mt-3 text-center">
        {imported ? "Composite of imported and native activity" : "No imported history — this is the floor"}
      </p>
    </div>
  );
}

/** The three sub-scores, as slim meters. Each is 0–1000 on its own scale. */
export function SubScoreBar({ label, value }: { label: string; value: number }) {
  const shown = useCountUp(value);
  const pct = Math.max(0, Math.min(100, (value / 1000) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-fg-muted">{label}</span>
        <span className="mono text-sm font-medium text-fg">{shown}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-grad-accent-r motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
