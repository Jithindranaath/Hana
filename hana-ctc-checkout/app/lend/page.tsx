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
      <div className="text-center py-16 space-y-6">
        <h1 className="text-2xl font-semibold">Lend iUSDC</h1>
        <p className="text-slate-400">Connect your wallet to deposit into the pool.</p>
        <ConnectButton />
      </div>
    );
  }

  if (chainId !== SUPPORTED_CHAIN_ID) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-slate-400">Hana runs on Creditcoin CC3 Testnet.</p>
        <button
          onClick={() => switchChain({ chainId: SUPPORTED_CHAIN_ID })}
          disabled={switching}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {switching ? "Switching..." : "Switch to CC3 Testnet"}
        </button>
      </div>
    );
  }

  const maxInterest = history?.length ? Math.max(...history.map((h) => Number(formatUnits(h.interest, 6)))) : 1;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Lend iUSDC</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Total supplied" value={fmt(totalAssets.data)} suffix="iUSDC" />
        <Stat label="Total borrowed" value={fmt(totalBorrowed.data)} suffix="iUSDC" />
        <Stat label="Utilization" value={bps(utilizationBps.data)} suffix="%" />
        <Stat label="Borrow APR" value={bps(borrowRateBps.data)} suffix="%" />
      </div>

      <div className="rounded-lg border border-slate-800 p-5 space-y-2">
        <p className="text-slate-400 text-sm">Your position</p>
        <p className="text-2xl font-semibold">{fmt(positionValue.data)} iUSDC</p>
        <p className="text-slate-500 text-xs">
          {fmt(shareBalance.data)} ipUSDC · 1 ipUSDC = {sharePrice.data ? formatUnits(sharePrice.data as bigint, 6) : "-"} iUSDC
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 p-5 space-y-3 max-w-sm">
        <input
          type="number"
          placeholder="Amount (iUSDC)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
        />
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={deposit}
            disabled={!amount || busy !== null}
            className="flex-1 rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy === "deposit" ? "Depositing..." : "Deposit"}
          </button>
          <button
            onClick={withdraw}
            disabled={!amount || busy !== null}
            className="flex-1 rounded border border-slate-700 px-4 py-2 text-sm font-medium hover:border-slate-500 disabled:opacity-50"
          >
            {busy === "withdraw" ? "Withdrawing..." : "Withdraw"}
          </button>
        </div>
        <p className="text-slate-600 text-xs">Max withdraw: {fmt(maxWithdraw.data)} iUSDC</p>
      </div>

      <div className="rounded-lg border border-slate-800 p-5">
        <h2 className="font-medium mb-4">Interest paid into the pool</h2>
        {history === null ? (
          <p className="text-slate-500 text-sm">Loading history...</p>
        ) : history.length === 0 ? (
          <p className="text-slate-500 text-sm">No repayments yet.</p>
        ) : (
          <svg viewBox={`0 0 ${history.length * 40} 120`} className="w-full h-32">
            {history.map((h, i) => {
              const amt = Number(formatUnits(h.interest, 6));
              const height = Math.max(2, (amt / maxInterest) * 100);
              return (
                <rect key={i} x={i * 40 + 8} y={110 - height} width={24} height={height} rx={2} className="fill-indigo-500" />
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

function fmt(value: unknown): string {
  if (value === undefined || value === null) return "-";
  return Number(formatUnits(value as bigint, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function bps(value: unknown): string {
  if (value === undefined || value === null) return "-";
  return (Number(value) / 100).toFixed(2);
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <div className="rounded-lg border border-slate-800 p-4">
      <p className="text-slate-500 text-xs">{label}</p>
      <p className="text-lg font-semibold mt-1">
        {value} <span className="text-slate-500 text-sm font-normal">{suffix}</span>
      </p>
    </div>
  );
}
