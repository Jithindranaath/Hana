"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch, clearCreds, loadCreds, saveCreds, StoredCreds } from "@/lib/clientAuth";

export default function HomePage() {
  const [creds, setCreds] = useState<StoredCreds | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = loadCreds();
    if (!c) {
      setChecked(true);
      return;
    }
    authedFetch("/api/merchants/me", c)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "invalid stored credentials");
        return res.json();
      })
      .then((data) => setCreds({ ...c, name: data.name, payoutAddress: data.payoutAddress }))
      .catch((err) => {
        setError(err.message);
        clearCreds();
      })
      .finally(() => setChecked(true));
  }, []);

  if (!checked) return <p className="text-slate-400">Loading...</p>;

  if (!creds) {
    return <PasteKeysOrRegister error={error} onSaved={setCreds} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{creds.name}</h1>
        <p className="text-slate-400 text-sm mt-1">
          Client ID: <code className="text-slate-300">{creds.clientId}</code>
        </p>
        <p className="text-slate-400 text-sm">
          Payout address: <code className="text-slate-300">{creds.payoutAddress}</code>
        </p>
      </div>
      <div className="flex gap-4">
        <Link href="/bills" className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500">
          Manage bills
        </Link>
        <Link
          href="/settlements"
          className="rounded border border-slate-700 px-4 py-2 text-sm font-medium hover:border-slate-500"
        >
          Settlement history
        </Link>
      </div>
      <button
        onClick={() => {
          clearCreds();
          setCreds(null);
        }}
        className="text-xs text-slate-500 hover:text-slate-300"
      >
        Sign out (forget stored keys on this device)
      </button>
    </div>
  );
}

function PasteKeysOrRegister({
  error,
  onSaved,
}: {
  error: string | null;
  onSaved: (creds: StoredCreds) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setFormError(null);
    try {
      const creds = { clientId, clientSecret, name: "", payoutAddress: "" };
      const res = await authedFetch("/api/merchants/me", creds);
      if (!res.ok) throw new Error((await res.json()).error ?? "invalid credentials");
      const data = await res.json();
      const full = { ...creds, name: data.name, payoutAddress: data.payoutAddress };
      saveCreds(full);
      onSaved(full);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Hana Merchant Portal</h1>
        <p className="text-slate-400 mt-2">
          New here?{" "}
          <Link href="/register" className="text-indigo-400 hover:underline">
            Register your business
          </Link>{" "}
          to get API keys.
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 p-5 space-y-3 max-w-sm">
        <h2 className="font-medium">Already have keys?</h2>
        {(error || formError) && <p className="text-sm text-red-400">{error ?? formError}</p>}
        <input
          className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
          placeholder="Client ID"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        />
        <input
          className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
          placeholder="Client secret"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
        />
        <button
          onClick={submit}
          disabled={busy || !clientId || !clientSecret}
          className="w-full rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "Checking..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
