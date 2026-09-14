"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authedFetch, loadCreds, StoredCreds } from "@/lib/clientAuth";
import { Card, Chip, Tone, EmptyState, ErrorState, Field, CopyText, PageSkeleton } from "@/components/ui";

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

  if (loading || !creds) return <PageSkeleton />;

  const statusTone = (status: string): Tone =>
    status === "settled" ? "pos" : status === "originated" ? "warn" : "neutral";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight2">Bills</h1>
        <p className="mt-1 text-sm text-fg-muted">{creds.name}</p>
      </div>

      <Card accent className="max-w-2xl space-y-4">
        <h2 className="text-sm font-medium">New bill</h2>
        {error ? <ErrorState title="Couldn’t create the bill" detail={error} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (iUSDC)">
            <input className="input mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="49.99" />
          </Field>
          <Field label="Reference">
            <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="order-1042" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Item name">
              <input className="input" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Wireless mouse" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Release type" hint="When the vault releases funds to your payout address.">
              <select
                className="input"
                value={releaseType}
                onChange={(e) => setReleaseType(e.target.value as typeof releaseType)}
              >
                <option value="IMMEDIATE">Immediate</option>
                <option value="TIMELOCK">Timelock</option>
                <option value="CONDITIONAL">Conditional</option>
              </select>
            </Field>
          </div>
        </div>
        <button onClick={createBill} disabled={creating || !amount || !reference} aria-busy={creating} className="btn btn-primary">
          {creating ? "Creating…" : "Create bill"}
        </button>
      </Card>

      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">All bills</h2>
          <span className="mono text-xs text-fg-subtle">{bills.length}</span>
        </div>
        {bills.length === 0 ? (
          <EmptyState title="No bills yet" body="Create one above, or let the demo storefront create it for you at checkout." />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {["Bill", "Reference", "Amount", "Status", "Checkout link"].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-medium text-fg-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.billHash} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3">
                      <CopyText value={`${b.billHash.slice(0, 10)}…`} className="-ml-1.5" />
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{b.reference}</td>
                    <td className="mono whitespace-nowrap px-4 py-3">
                      {b.amount} <span className="text-fg-subtle">{b.currency}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Chip tone={statusTone(b.status)} dot>
                        {b.status}
                      </Chip>
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <a
                        href={b.checkoutUrl}
                        className="mono break-all text-xs text-accent-hi underline underline-offset-2 hover:text-fg"
                      >
                        {b.checkoutUrl}
                      </a>
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
