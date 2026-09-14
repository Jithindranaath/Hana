"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatUnits } from "ethers";
import { authedFetch, loadCreds, StoredCreds } from "@/lib/clientAuth";
import { Card, Chip, EmptyState, ErrorState, CopyText, PageSkeleton } from "@/components/ui";

interface Settlement {
  billHash: string;
  amount: string;
  releaseType: number;
  claimed: boolean;
  registeredTxHash: string;
  claimedTxHash?: string;
}

const RELEASE_LABELS = ["Immediate", "Timelock", "Conditional"];

export default function SettlementsPage() {
  const router = useRouter();
  const [creds, setCreds] = useState<StoredCreds | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = loadCreds();
    if (!c) {
      router.replace("/");
      return;
    }
    setCreds(c);
    authedFetch("/api/settlements", c)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "failed to load settlements");
        return res.json();
      })
      .then(setSettlements)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading || !creds) return <PageSkeleton />;

  const claimedAmounts = settlements.filter((s) => s.claimed).map((s) => Number(formatUnits(s.amount, 6)));
  const totalSettled = claimedAmounts.reduce((a, b) => a + b, 0);
  const maxAmount = Math.max(1, ...claimedAmounts);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight2">Settlements</h1>
        <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-fg-muted">
          Live from <code className="mono text-fg-subtle">SettlementVault</code> on CC3
          <span aria-hidden>·</span>
          <CopyText value={creds.payoutAddress} />
        </p>
      </div>

      {error ? <ErrorState title="Couldn’t load settlements" detail={error} /> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card accent className="p-6">
          <p className="text-xs text-fg-muted">Total settled</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="mono text-3xl font-semibold tracking-tight2 gradient-text">
              {totalSettled.toLocaleString()}
            </span>
            <span className="text-xs text-fg-subtle">iUSDC</span>
          </p>
          <p className="mt-1 text-xs text-fg-subtle">Claimed and paid out</p>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="text-sm font-medium">Revenue by settlement</h2>
          {claimedAmounts.length === 0 ? (
            <p className="mt-5 text-sm text-fg-subtle">
              Nothing claimed yet — bars appear as settlements are released from the vault.
            </p>
          ) : (
            <svg
              viewBox={`0 0 ${claimedAmounts.length * 40} 120`}
              className="mt-4 h-28 w-full"
              role="img"
              aria-label="Revenue by settlement"
            >
              <defs>
                <linearGradient id="hana-rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7C5CFF" />
                  <stop offset="100%" stopColor="#22D3EE" />
                </linearGradient>
              </defs>
              {claimedAmounts.map((amt, i) => {
                const h = Math.max(2, (amt / maxAmount) * 100);
                return <rect key={i} x={i * 40 + 8} y={110 - h} width={24} height={h} rx={3} fill="url(#hana-rev)" />;
              })}
            </svg>
          )}
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">All settlements</h2>
          <span className="mono text-xs text-fg-subtle">{settlements.length}</span>
        </div>
        {settlements.length === 0 ? (
          <EmptyState
            title="No settlements yet"
            body="These appear once a loan is originated against one of your bills."
          />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {["Bill", "Amount", "Release", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-medium text-fg-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.billHash} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3">
                      <CopyText value={`${s.billHash.slice(0, 10)}…`} className="-ml-1.5" />
                    </td>
                    <td className="mono whitespace-nowrap px-4 py-3">
                      {formatUnits(s.amount, 6)} <span className="text-fg-subtle">iUSDC</span>
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{RELEASE_LABELS[s.releaseType] ?? s.releaseType}</td>
                    <td className="px-4 py-3">
                      <Chip tone={s.claimed ? "pos" : "warn"} dot>
                        {s.claimed ? "claimed" : "pending"}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
