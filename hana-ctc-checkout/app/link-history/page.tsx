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
    return <p className="text-slate-400 text-center py-20">Connect your wallet first.</p>;
  }

  if (phase === "loading") {
    return <p className="text-slate-400 text-center py-20">Checking import status...</p>;
  }

  if (phase === "idle") {
    return (
      <div className="space-y-6 text-center py-10">
        <h1 className="text-2xl font-semibold">Link your Ethereum history</h1>
        <p className="text-slate-400 max-w-md mx-auto">
          We'll ask you to switch to Sepolia and sign one transaction — a snapshot of your lending
          history there. No funds move. Hana then verifies it cross-chain and your Creditcoin
          score updates automatically — no further action needed from you.
        </p>
        <button
          onClick={startLinking}
          className="rounded bg-indigo-600 px-6 py-3 font-medium hover:bg-indigo-500"
        >
          Start linking
        </button>
      </div>
    );
  }

  if (phase === "error" || phase === "FAILED") {
    return (
      <div className="text-center py-10 space-y-4">
        <p className="text-red-400 max-w-md mx-auto">{error ?? "Import failed. You can safely try again."}</p>
        <button
          onClick={() => {
            setPhase("idle");
            setError(null);
            setSepoliaTxHash(undefined);
          }}
          className="rounded border border-slate-700 px-4 py-2 text-sm hover:border-slate-500"
        >
          Try again
        </button>
      </div>
    );
  }

  if (["connect-sepolia", "signing", "sepolia-confirming", "switch-back"].includes(phase)) {
    const copy: Record<string, string> = {
      "connect-sepolia": "Switching to Sepolia...",
      signing: "Confirm the snapshot transaction in your wallet...",
      "sepolia-confirming": "Waiting for the snapshot to be mined on Sepolia...",
      "switch-back": "Switching back to Creditcoin CC3...",
    };
    return (
      <div className="text-center py-16 space-y-4">
        <div className="mx-auto h-8 w-8 rounded-full border-2 border-slate-700 border-t-indigo-400 animate-spin" />
        <p className="text-slate-300">{copy[phase]}</p>
        {sepoliaTxHash && <p className="text-xs text-slate-500 font-mono break-all">{sepoliaTxHash}</p>}
      </div>
    );
  }

  if (phase === "CONFIRMED") {
    return (
      <div className="text-center py-16 space-y-6">
        <h1 className="text-2xl font-semibold text-emerald-400">History imported!</h1>
        <p className="text-slate-400">Your Creditcoin credit score has been updated.</p>
        <Link
          href="/"
          className="inline-block rounded bg-indigo-600 px-6 py-3 font-medium hover:bg-indigo-500"
        >
          View your new score
        </Link>
      </div>
    );
  }

  // SEEN / ATTEST_WAIT / PROOF_FETCH / SUBMIT — pending timeline
  const stepIndex = TIMELINE_STEPS.findIndex((s) => s.key === phase);
  return (
    <div className="space-y-8 py-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Linking your history...</h1>
        <p className="text-slate-400 text-sm mt-2">
          This takes about 9 minutes, mostly Ethereum's own finality — not anything Hana
          controls. Elapsed: {formatElapsed(elapsedSec)}
        </p>
      </div>
      <ol className="space-y-3 max-w-sm mx-auto">
        {TIMELINE_STEPS.map((step, i) => (
          <li
            key={step.key}
            className={`flex items-center gap-3 rounded-lg border p-3 ${
              i <= stepIndex ? "border-indigo-700 bg-indigo-950/30" : "border-slate-800"
            }`}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                i < stepIndex ? "bg-emerald-500" : i === stepIndex ? "bg-indigo-400 animate-pulse" : "bg-slate-700"
              }`}
            />
            <span className={i <= stepIndex ? "text-slate-200" : "text-slate-500"}>{step.label}</span>
          </li>
        ))}
      </ol>
      <p className="text-center text-xs text-slate-600">
        You can leave this page — your score updates automatically once it's done. Check{" "}
        <Link href="/" className="underline">
          your profile
        </Link>{" "}
        anytime.
      </p>
    </div>
  );
}
