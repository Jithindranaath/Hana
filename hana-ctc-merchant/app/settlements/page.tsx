"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatUnits } from "ethers";
import { authedFetch, loadCreds, StoredCreds } from "@/lib/clientAuth";

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

  if (loading || !creds) return <p className="text-slate-400">Loading...</p>;

  const claimedAmounts = settlements.filter((s) => s.claimed).map((s) => Number(formatUnits(s.amount, 6)));
  const totalSettled = claimedAmounts.reduce((a, b) => a + b, 0);
  const maxAmount = Math.max(1, ...claimedAmounts);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Settlements</h1>
        <p className="text-slate-400 text-sm mt-1">
          Live from <code>SettlementVault</code> on CC3 — {creds.payoutAddress}
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="rounded-lg border border-slate-800 p-5">
        <p className="text-slate-400 text-sm">Total settled (claimed)</p>
        <p className="text-3xl font-semibold mt-1">{totalSettled.toLocaleString()} iUSDC</p>
      </div>

      {claimedAmounts.length > 0 && (
        <div className="rounded-lg border border-slate-800 p-5">
          <h2 className="font-medium mb-4">Revenue by settlement</h2>
          <svg viewBox={`0 0 ${claimedAmounts.length * 40} 120`} className="w-full h-32">
            {claimedAmounts.map((amt, i) => {
              const h = Math.max(2, (amt / maxAmount) * 100);
              return (
                <rect
                  key={i}
                  x={i * 40 + 8}
                  y={110 - h}
                  width={24}
                  height={h}
                  rx={2}
                  className="fill-indigo-500"
                />
              );
            })}
          </svg>
        </div>
      )}

      <div>
        <h2 className="font-medium mb-3">All settlements ({settlements.length})</h2>
        {settlements.length === 0 ? (
          <p className="text-slate-500 text-sm">No settlements yet — they appear once a loan is originated against one of your bills.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-left border-b border-slate-800">
                <tr>
                  <th className="py-2 pr-4">Bill</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Release</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.billHash} className="border-b border-slate-900">
                    <td className="py-2 pr-4 font-mono text-xs">{s.billHash.slice(0, 10)}...</td>
                    <td className="py-2 pr-4">{formatUnits(s.amount, 6)} iUSDC</td>
                    <td className="py-2 pr-4">{RELEASE_LABELS[s.releaseType] ?? s.releaseType}</td>
                    <td className="py-2 pr-4">
                      <span className={s.claimed ? "text-emerald-400" : "text-amber-400"}>
                        {s.claimed ? "claimed" : "pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
