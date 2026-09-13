"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authedFetch, loadCreds, StoredCreds } from "@/lib/clientAuth";

interface Bill {
  billHash: string;
  amount: string;
  currency: string;
  reference: string;
  status: string;
  releaseType: string;
  checkoutUrl: string;
  createdAt: string;
}

export default function BillsPage() {
  const router = useRouter();
  const [creds, setCreds] = useState<StoredCreds | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [itemName, setItemName] = useState("");
  const [releaseType, setReleaseType] = useState<"IMMEDIATE" | "TIMELOCK" | "CONDITIONAL">("IMMEDIATE");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(c: StoredCreds) {
    const res = await authedFetch("/api/bills", c);
    if (res.ok) setBills(await res.json());
  }

  useEffect(() => {
    const c = loadCreds();
    if (!c) {
      router.replace("/");
      return;
    }
    setCreds(c);
    refresh(c).finally(() => setLoading(false));
  }, [router]);

  async function createBill() {
    if (!creds) return;
    setCreating(true);
    setError(null);
    try {
      const res = await authedFetch("/api/bills/create", creds, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount,
          reference,
          releaseType,
          items: [{ name: itemName || reference, quantity: 1, unitAmount: amount }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed to create bill");
      setAmount("");
      setReference("");
      setItemName("");
      await refresh(creds);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  if (loading || !creds) return <p className="text-slate-400">Loading...</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Bills</h1>
        <p className="text-slate-400 text-sm mt-1">{creds.name}</p>
      </div>

      <div className="rounded-lg border border-slate-800 p-5 space-y-3 max-w-lg">
        <h2 className="font-medium">New bill</h2>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Amount (iUSDC)
            <input
              className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="49.99"
            />
          </label>
          <label className="text-sm">
            Reference
            <input
              className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="order-1042"
            />
          </label>
          <label className="text-sm col-span-2">
            Item name
            <input
              className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Wireless mouse"
            />
          </label>
          <label className="text-sm col-span-2">
            Release type
            <select
              className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
              value={releaseType}
              onChange={(e) => setReleaseType(e.target.value as typeof releaseType)}
            >
              <option value="IMMEDIATE">Immediate</option>
              <option value="TIMELOCK">Timelock</option>
              <option value="CONDITIONAL">Conditional</option>
            </select>
          </label>
        </div>
        <button
          onClick={createBill}
          disabled={creating || !amount || !reference}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create bill"}
        </button>
      </div>

      <div>
        <h2 className="font-medium mb-3">All bills ({bills.length})</h2>
        {bills.length === 0 ? (
          <p className="text-slate-500 text-sm">No bills yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 text-left border-b border-slate-800">
                <tr>
                  <th className="py-2 pr-4">Bill</th>
                  <th className="py-2 pr-4">Reference</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Checkout link</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.billHash} className="border-b border-slate-900">
                    <td className="py-2 pr-4 font-mono text-xs">{b.billHash.slice(0, 10)}...</td>
                    <td className="py-2 pr-4">{b.reference}</td>
                    <td className="py-2 pr-4">
                      {b.amount} {b.currency}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          b.status === "settled"
                            ? "text-emerald-400"
                            : b.status === "originated"
                              ? "text-amber-400"
                              : "text-slate-400"
                        }
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <a href={b.checkoutUrl} className="text-indigo-400 hover:underline break-all">
                        {b.checkoutUrl}
                      </a>
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
