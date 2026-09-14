"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCreds } from "@/lib/clientAuth";
import { Card, Chip, ErrorState, Field, CopyText } from "@/components/ui";

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
      <div className="mx-auto max-w-lg space-y-5 py-6">
        <div>
          <Chip tone="warn" dot className="mb-3">
            Shown once
          </Chip>
          <h1 className="text-xl font-semibold tracking-tight2">Save your API keys</h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            We store only a hash of the secret, so this is the only time it’s visible. It’s already
            saved in this browser — write it down if a server will call the bill API directly.
          </p>
        </div>

        <Card accent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-fg-muted">Client ID</span>
            <CopyText value={revealed.clientId} />
          </div>
          <div className="hairline" aria-hidden />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-fg-muted">Client secret</span>
            <CopyText value={revealed.clientSecret} />
          </div>
        </Card>

        <button onClick={() => router.push("/")} className="btn btn-primary">
          Continue to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight2">Register your business</h1>
        <p className="mt-2 text-sm text-fg-muted">
          You’ll get API keys for creating bills and a payout address for settled funds.
        </p>
      </div>

      {error ? <ErrorState title="Registration failed" detail={error} /> : null}

      <Card className="space-y-4">
        <Field label="Business name">
          <input className="input" autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Supply Co." />
        </Field>
        <Field label="Payout address" hint="On CC3 Testnet — receives settled funds from the vault.">
          <input
            className="input mono"
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            value={payoutAddress}
            onChange={(e) => setPayoutAddress(e.target.value)}
          />
        </Field>
        <button onClick={submit} disabled={busy || !name || !payoutAddress} aria-busy={busy} className="btn btn-primary w-full">
          {busy ? "Registering…" : "Register"}
        </button>
      </Card>
    </div>
  );
}
