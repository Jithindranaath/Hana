"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch, clearCreds, loadCreds, saveCreds, StoredCreds } from "@/lib/clientAuth";
import { Card, ErrorState, Field, CopyText, PageSkeleton } from "@/components/ui";

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

  if (!checked) return <PageSkeleton />;

  if (!creds) {
    return <PasteKeysOrRegister error={error} onSaved={setCreds} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight2">{creds.name}</h1>
        <p className="mt-1 text-sm text-fg-muted">Signed in on this device.</p>
      </div>

      <Card accent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-fg-muted">Client ID</span>
          <CopyText value={creds.clientId} />
        </div>
        <div className="hairline" aria-hidden />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-fg-muted">Payout address</span>
          <CopyText value={creds.payoutAddress} />
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link href="/bills" className="btn btn-primary">
          Manage bills
        </Link>
        <Link href="/settlements" className="btn btn-secondary">
          Settlement history
        </Link>
      </div>

      <button
        onClick={() => {
          clearCreds();
          setCreds(null);
        }}
        className="btn btn-ghost -ml-3 text-xs"
      >
        Sign out and forget these keys
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
    <div className="mx-auto max-w-md space-y-6 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight2">Merchant portal</h1>
        <p className="mt-2 text-sm text-fg-muted">
          New here?{" "}
          <Link href="/register" className="text-accent-hi underline underline-offset-2 hover:text-fg">
            Register your business
          </Link>{" "}
          to get API keys.
        </p>
      </div>

      <Card className="space-y-4">
        <h2 className="text-sm font-medium">Already have keys?</h2>
        {error || formError ? <ErrorState title="Couldn’t sign you in" detail={error ?? formError ?? undefined} /> : null}
        <Field label="Client ID">
          <input
            className="input mono"
            placeholder="mch_…"
            autoComplete="username"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </Field>
        <Field label="Client secret" hint="Stored only in this browser.">
          <input
            className="input mono"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
          />
        </Field>
        <button
          onClick={submit}
          disabled={busy || !clientId || !clientSecret}
          aria-busy={busy}
          className="btn btn-primary w-full"
        >
          {busy ? "Checking…" : "Continue"}
        </button>
      </Card>
    </div>
  );
}
