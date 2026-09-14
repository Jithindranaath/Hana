"use client";

import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SUPPORTED_CHAIN_ID, wagmiConfig } from "@/lib/wagmi";
import { IUSDC, LendingPool } from "@/lib/contracts";
import { formatTxError } from "@/lib/errors";
import { getRepaidHistory, RepaidEvent } from "@/lib/lendHistory";
import { Card, Chip, ErrorState, Stat } from "@/components/ui";

export default function LendPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"deposit" | "withdraw" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RepaidEvent[] | null>(null);

  const totalAssets = useReadContract({ address: LendingPool.address, abi: LendingPool.abi, functionName: "totalAssets" });
  const totalBorrowed = useReadContract({ address: LendingPool.address, abi: LendingPool.abi, functionName: "totalBorrowed" });
  const utilizationBps = useReadContract({ address: LendingPool.address, abi: LendingPool.abi, functionName: "utilizationBps" });
  const borrowRateBps = useReadContract({ address: LendingPool.address, abi: LendingPool.abi, functionName: "currentBorrowRateBps" });
  const sharePrice = useReadContract({
    address: LendingPool.address,
    abi: LendingPool.abi,
    functionName: "convertToAssets",
    args: [parseUnits("1", 6)],
  });

  const shareBalance = useReadContract({
    address: LendingPool.address,
    abi: LendingPool.abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });
  const positionValue = useReadContract({
    address: LendingPool.address,
    abi: LendingPool.abi,
    functionName: "convertToAssets",
    args: [(shareBalance.data as bigint) ?? 0n],
    query: { enabled: shareBalance.data !== undefined },
  });
  const maxWithdraw = useReadContract({
    address: LendingPool.address,
    abi: LendingPool.abi,
    functionName: "maxWithdraw",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });
  const allowance = useReadContract({
    address: IUSDC.address,
    abi: IUSDC.abi,
    functionName: "allowance",
    args: address ? [address, LendingPool.address] : undefined,
    query: { enabled: Boolean(address) },
  });

  useEffect(() => {
    if (!publicClient) return;
    getRepaidHistory(publicClient).then(setHistory).catch(() => setHistory([]));
  }, [publicClient]);

  function refetchAll() {
    totalAssets.refetch();
    totalBorrowed.refetch();
    utilizationBps.refetch();
    borrowRateBps.refetch();
    sharePrice.refetch();
    shareBalance.refetch();
    positionValue.refetch();
    maxWithdraw.refetch();
    allowance.refetch();
    if (publicClient) getRepaidHistory(publicClient).then(setHistory).catch(() => {});
  }

  async function deposit() {
    if (!address || !amount) return;
    setError(null);
    setBusy("deposit");
    try {
      const units = parseUnits(amount, 6);
      const currentAllowance = (allowance.data as bigint) ?? 0n;
      if (currentAllowance < units) {
        const approveHash = await writeContractAsync({
          address: IUSDC.address,
          abi: IUSDC.abi,
          functionName: "approve",
          args: [LendingPool.address, units],
        });
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });
      }
      const hash = await writeContractAsync({
        address: LendingPool.address,
        abi: LendingPool.abi,
        functionName: "deposit",
        args: [units, address],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      setAmount("");
      refetchAll();
    } catch (err: any) {
      setError(formatTxError(err));
    } finally {
      setBusy(null);
    }
  }

  async function withdraw() {
    if (!address || !amount) return;
    setError(null);
    setBusy("withdraw");
    try {
      const units = parseUnits(amount, 6);
      const hash = await writeContractAsync({
        address: LendingPool.address,
        abi: LendingPool.abi,
        functionName: "withdraw",
        args: [units, address, address],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      setAmount("");
      refetchAll();
    } catch (err: any) {
      setError(formatTxError(err));
    } finally {
      setBusy(null);
    }
  }

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-2xl font-semibold tracking-tight2">Lend iUSDC</h1>
        <p className="mt-3 text-sm text-fg-muted">
          Supply the pool that funds every Hana loan and earn the borrow rate.
        </p>
        <div className="mt-7 flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (chainId !== SUPPORTED_CHAIN_ID) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card accent className="space-y-4 text-center">
          <Chip tone="warn" dot>
            Wrong network
          </Chip>
          <p className="text-sm text-fg-muted">Hana runs on Creditcoin CC3 Testnet.</p>
          <button
            onClick={() => switchChain({ chainId: SUPPORTED_CHAIN_ID })}
            disabled={switching}
            aria-busy={switching}
            className="btn btn-primary w-full"
          >
            {switching ? "Switching…" : "Switch to CC3 Testnet"}
          </button>
        </Card>
      </div>
    );
  }

  const maxInterest = history?.length ? Math.max(...history.map((h) => Number(formatUnits(h.interest, 6)))) : 1;
  const utilPct = utilizationBps.data !== undefined ? Number(utilizationBps.data) / 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight2">Lend iUSDC</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Every Hana loan is funded from this pool. Depositors earn the borrow rate, scaled by
          utilisation.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><Stat label="Total supplied" value={fmt(totalAssets.data)} unit="iUSDC" size="sm" /></Card>
        <Card><Stat label="Total borrowed" value={fmt(totalBorrowed.data)} unit="iUSDC" size="sm" /></Card>
        <Card>
          <Stat label="Utilisation" value={bps(utilizationBps.data)} unit="%" size="sm" />
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
            {/* The curve is gentle to 80% and steep past it — the marker makes the kink visible. */}
            <div
              className={utilPct > 80 ? "h-full rounded-full bg-warn" : "h-full rounded-full bg-grad-accent-r"}
              style={{ width: `${Math.min(100, utilPct)}%` }}
            />
          </div>
        </Card>
        <Card><Stat label="Borrow APR" value={bps(borrowRateBps.data)} unit="%" size="sm" tone="pos" /></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card accent className="p-6">
          <p className="text-xs text-fg-muted">Your position</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="mono text-3xl font-semibold tracking-tight2">{fmt(positionValue.data)}</span>
            <span className="text-xs text-fg-subtle">iUSDC</span>
          </p>
          <p className="mt-2 text-xs text-fg-subtle">
            <span className="mono">{fmt(shareBalance.data)}</span> ipUSDC &middot; 1 ipUSDC ={" "}
            <span className="mono">
              {sharePrice.data ? formatUnits(sharePrice.data as bigint, 6) : "—"}
            </span>{" "}
            iUSDC
          </p>
        </Card>

        <Card className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="lend-amount" className="block text-xs text-fg-muted">
              Amount
            </label>
            <div className="relative">
              <input
                id="lend-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input mono pr-16"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-fg-subtle">
                iUSDC
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={deposit} disabled={!amount || busy !== null} aria-busy={busy === "deposit"} className="btn btn-primary flex-1">
              {busy === "deposit" ? "Depositing…" : "Deposit"}
            </button>
            <button onClick={withdraw} disabled={!amount || busy !== null} aria-busy={busy === "withdraw"} className="btn btn-secondary flex-1">
              {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
            </button>
          </div>
          <p className="text-xs text-fg-subtle">
            Max withdraw <span className="mono text-fg-muted">{fmt(maxWithdraw.data)}</span> iUSDC
          </p>
          {error ? <ErrorState title="Transaction didn’t go through" detail={error} /> : null}
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-sm font-medium">Interest paid into the pool</h2>
        <p className="mt-1 text-xs text-fg-muted">Every bar is a real repayment landing on CC3.</p>
        {history === null ? (
          <div className="mt-5 flex h-32 items-end gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton flex-1" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="mt-6 text-sm text-fg-subtle">
            No repayments yet — the first loan repayment will show up here.
          </p>
        ) : (
          <svg viewBox={`0 0 ${history.length * 40} 120`} className="mt-5 h-32 w-full" role="img" aria-label="Interest paid into the pool over time">
            <defs>
              <linearGradient id="hana-bar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7C5CFF" />
                <stop offset="100%" stopColor="#22D3EE" />
              </linearGradient>
            </defs>
            {history.map((h, i) => {
              const amt = Number(formatUnits(h.interest, 6));
              const height = Math.max(2, (amt / maxInterest) * 100);
              return (
                <rect key={i} x={i * 40 + 8} y={110 - height} width={24} height={height} rx={3} fill="url(#hana-bar)" />
              );
            })}
          </svg>
        )}
      </Card>
    </div>
  );
}

function fmt(value: unknown): string {
  if (value === undefined || value === null) return "—";
  return Number(formatUnits(value as bigint, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function bps(value: unknown): string {
  if (value === undefined || value === null) return "—";
  return (Number(value) / 100).toFixed(2);
}
