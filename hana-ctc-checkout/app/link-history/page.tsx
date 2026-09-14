"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { cc3, sepolia } from "@/lib/chains";
import { CreditRegistry, HanaCreditAttestor } from "@/lib/contracts";
import { formatTxError } from "@/lib/errors";
import { Card, Chip, ErrorState, AddressChip } from "@/components/ui";

const WORKER_STATUS_URL = process.env.NEXT_PUBLIC_WORKER_STATUS_URL ?? "http://localhost:8787";

type Phase =
  | "loading"
  | "idle"
  | "connect-sepolia"
  | "signing"
  | "sepolia-confirming"
  | "switch-back"
  | "SEEN"
  | "ATTEST_WAIT"
  | "PROOF_FETCH"
  | "SUBMIT"
  | "CONFIRMED"
  | "FAILED"
  | "error";

const TIMELINE_STEPS: { key: Phase; label: string }[] = [
  { key: "ATTEST_WAIT", label: "Waiting for attestation on Ethereum (~9 min, most of the wait)" },
  { key: "PROOF_FETCH", label: "Fetching the cross-chain proof" },
  { key: "SUBMIT", label: "Submitting to Creditcoin" },
  { key: "CONFIRMED", label: "Imported" },
];

function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function LinkHistoryPage() {
  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<Phase>("loading");
  const [sepoliaTxHash, setSepoliaTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const profile = useReadContract({
    address: CreditRegistry.address,
    abi: CreditRegistry.abi,
    functionName: "getProfile",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const receipt = useWaitForTransactionReceipt({
    hash: sepoliaTxHash,
    chainId: sepolia.id,
    query: { enabled: Boolean(sepoliaTxHash) && phase === "sepolia-confirming" },
  });

  // Resume in place on a page refresh — the worker's status endpoint is the source of truth, not
  // React state (WORKFLOW.md 7.3 gotcha). Only show the "Start linking" button if there's
  // genuinely no import job yet for this address.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${WORKER_STATUS_URL}/status/${address}`);
        if (cancelled) return;
        if (!res.ok) {
          setPhase("idle");
          return;
        }
        const data = await res.json();
        setStartedAt(new Date(data.createdAt).getTime());
        if (data.state === "FAILED") setError(data.error ?? "Import failed.");
        setPhase(data.state as Phase);
      } catch {
        if (!cancelled) setPhase("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const startLinking = useCallback(async () => {
    if (!address) return;
    setError(null);
    try {
      setPhase("connect-sepolia");
      await switchChainAsync({ chainId: sepolia.id });

      setPhase("signing");
      const hash = await writeContractAsync({
        address: HanaCreditAttestor.address,
        abi: HanaCreditAttestor.abi,
        functionName: "snapshot",
        chainId: sepolia.id,
      });
      setSepoliaTxHash(hash);
      setPhase("sepolia-confirming");
    } catch (err: any) {
      setError(formatTxError(err));
      setPhase("error");
    }
  }, [address, switchChainAsync, writeContractAsync]);

  // Once the Sepolia snapshot tx is mined, switch back to CC3 and start polling the worker.
  useEffect(() => {
    if (receipt.isSuccess && phase === "sepolia-confirming") {
      (async () => {
        try {
          setPhase("switch-back");
          await switchChainAsync({ chainId: cc3.id });
          setPhase("SEEN");
          setStartedAt(Date.now());
        } catch (err: any) {
          setError(formatTxError(err));
          setPhase("error");
        }
      })();
    }
  }, [receipt.isSuccess, phase, switchChainAsync]);

  // Poll the worker's status endpoint (WORKFLOW.md 5.1 / 7.3) once we're past the Sepolia step.
  useEffect(() => {
    if (!address) return;
    if (!["SEEN", "ATTEST_WAIT", "PROOF_FETCH", "SUBMIT"].includes(phase)) return;

    const poll = async () => {
      try {
        const res = await fetch(`${WORKER_STATUS_URL}/status/${address}`);
        if (!res.ok) return; // worker hasn't picked up the event yet — keep waiting
        const data = await res.json();
        setPhase(data.state as Phase);
        if (data.state === "CONFIRMED") {
          profile.refetch();
        }
      } catch {
        // worker unreachable this tick — try again next interval
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, phase]);

  useEffect(() => {
    if (!startedAt || phase === "CONFIRMED" || phase === "error" || phase === "FAILED") return;
    const t = setInterval(() => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt, phase]);

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <p className="text-sm text-fg-muted">Connect your wallet to import a credit history.</p>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="mx-auto max-w-md space-y-3 py-24">
        <div className="skeleton mx-auto h-3 w-40" />
        <div className="skeleton mx-auto h-3 w-56" />
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card accent className="p-7 text-center motion-safe:animate-fade-rise">
          <Chip tone="accent" dot className="mb-5">
            One signature on Ethereum
          </Chip>
          <h1 className="text-2xl font-semibold tracking-tight2">Link your Ethereum history</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fg-muted">
            You&apos;ll switch to Sepolia and sign a single transaction — a snapshot of your
            lending record there. No funds move. Hana proves it on Creditcoin and your score
            updates on its own.
          </p>
          <button onClick={startLinking} className="btn btn-primary mx-auto mt-6 px-6">
            Start linking
          </button>
          <p className="mt-4 text-xs text-fg-subtle">Takes about 9 minutes, almost all of it Ethereum finality.</p>
        </Card>
      </div>
    );
  }

  if (phase === "error" || phase === "FAILED") {
    return (
      <div className="mx-auto max-w-md py-14">
        <ErrorState
          title="Import didn't complete"
          detail={error ?? "Nothing was lost — starting again is safe and costs one more signature."}
          onRetry={() => {
            setPhase("idle");
            setError(null);
            setSepoliaTxHash(undefined);
          }}
        />
      </div>
    );
  }

  if (["connect-sepolia", "signing", "sepolia-confirming", "switch-back"].includes(phase)) {
    const copy: Record<string, string> = {
      "connect-sepolia": "Switching your wallet to Sepolia…",
      signing: "Confirm the snapshot transaction in your wallet.",
      "sepolia-confirming": "Waiting for the snapshot to be mined on Sepolia…",
      "switch-back": "Switching back to Creditcoin CC3…",
    };
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <span className="relative mx-auto flex h-2.5 w-2.5">
          <span className="absolute inset-0 rounded-full bg-accent motion-safe:animate-ring-out" aria-hidden />
          <span className="relative h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
        </span>
        <p className="mt-5 text-sm text-fg">{copy[phase]}</p>
        {sepoliaTxHash ? (
          <div className="mt-3 flex justify-center">
            <AddressChip address={sepoliaTxHash} href={`https://sepolia.etherscan.io/tx/${sepoliaTxHash}`} />
          </div>
        ) : null}
      </div>
    );
  }

  if (phase === "CONFIRMED") {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Card accent className="p-8 text-center motion-safe:animate-fade-rise">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-pos/30 bg-pos/10">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-pos" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight2">History imported</h1>
          <p className="mt-2 text-sm text-fg-muted">
            A Merkle proof of your Sepolia record was verified on Creditcoin. Your score has been
            recomputed on-chain.
          </p>
          <Link href="/" className="btn btn-primary mx-auto mt-6 px-6">
            View your new score
          </Link>
        </Card>
      </div>
    );
  }

  // SEEN / ATTEST_WAIT / PROOF_FETCH / SUBMIT — the long wait.
  const stepIndex = TIMELINE_STEPS.findIndex((s) => s.key === phase);
  // Measured p50 across three live runs is ~9 minutes; the bar is capped at 95% so it can
  // never claim to be finished before the chain actually says so.
  const progressPct = Math.min(95, (elapsedSec / 560) * 100);

  return (
    <div className="mx-auto max-w-xl space-y-6 py-8">
      <div className="text-center">
        <Chip tone="accent" dot pulse>
          Verifying on Creditcoin
        </Chip>
        <h1 className="mt-4 text-xl font-semibold tracking-tight2">Importing your history</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
          Almost all of this is Ethereum&apos;s own finality, not anything Hana controls.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-fg-muted">Elapsed</span>
          <span className="mono text-2xl font-semibold tracking-tight2">{formatElapsed(elapsedSec)}</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-grad-accent-r motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-fg-subtle">Typically ~9:20 end to end</p>

        <ol className="mt-6 space-y-1">
          {TIMELINE_STEPS.map((step, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <li key={step.key} className="flex items-start gap-3 rounded-ctl px-2 py-2.5">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                  {done ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-pos" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : active ? (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inset-0 rounded-full bg-accent motion-safe:animate-ring-out" aria-hidden />
                      <span className="relative h-2 w-2 rounded-full bg-accent" aria-hidden />
                    </span>
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-line-strong" aria-hidden />
                  )}
                </span>
                <span
                  className={
                    done
                      ? "text-sm text-fg-muted"
                      : active
                        ? "text-sm text-fg motion-safe:animate-breathe"
                        : "text-sm text-fg-subtle"
                  }
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </Card>

      <p className="text-center text-xs text-fg-subtle">
        Safe to leave this page — the import finishes without you.{" "}
        <Link href="/" className="text-fg-muted underline underline-offset-2 hover:text-fg">
          Back to your profile
        </Link>
      </p>
    </div>
  );
}
