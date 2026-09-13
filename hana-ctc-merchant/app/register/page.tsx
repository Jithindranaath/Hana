"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCreds } from "@/lib/clientAuth";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [payoutAddress, setPayoutAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ clientId: string; clientSecret: string } | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/merchants/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, payoutAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "registration failed");
      setRevealed({ clientId: data.clientId, clientSecret: data.clientSecret });
      saveCreds({ clientId: data.clientId, clientSecret: data.clientSecret, name: data.name, payoutAddress: data.payoutAddress });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (revealed) {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="text-xl font-semibold">Save your API keys</h1>
        <p className="text-slate-400 text-sm">
          The client secret is shown <strong>once</strong> — we only store its hash. It's already
          saved in this browser for you, but write it down if you'll need it elsewhere (e.g. a
          server calling the bill API directly).
        </p>
        <div className="rounded-lg border border-slate-800 p-4 space-y-2 font-mono text-sm break-all">
          <div>
            <span className="text-slate-500">Client ID: </span>
            {revealed.clientId}
          </div>
          <div>
            <span className="text-slate-500">Client secret: </span>
            {revealed.clientSecret}
          </div>
        </div>
        <button
          onClick={() => router.push("/")}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
        >
          Continue to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Register your business</h1>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="space-y-3">
        <label className="block text-sm">
          Business name
          <input
            className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Payout address (CC3, receives settled funds)
          <input
            className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono"
            placeholder="0x..."
            value={payoutAddress}
            onChange={(e) => setPayoutAddress(e.target.value)}
          />
        </label>
        <button
          onClick={submit}
          disabled={busy || !name || !payoutAddress}
          className="w-full rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "Registering..." : "Register"}
        </button>
      </div>
    </div>
  );
}
