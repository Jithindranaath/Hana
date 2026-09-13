"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useChainId, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { LoanStatus, LoanType } from "@hana/shared";
import { SUPPORTED_CHAIN_ID, wagmiConfig } from "@/lib/wagmi";
import { CreditRegistry, IUSDC, LoanManager } from "@/lib/contracts";
import { formatTxError } from "@/lib/errors";

const LOAN_TYPE_LABELS: Record<number, string> = {
  [LoanType.INSTALLMENT]: "Installments",
  [LoanType.REVOLVING]: "Revolving line",
  [LoanType.TERM]: "Term loan",
  [LoanType.OVERCOLLATERALIZED]: "Collateralized",
};

const LOAN_STATUS_LABELS: Record<number, string> = {
  [LoanStatus.ACTIVE]: "Active",
  [LoanStatus.COMPLETED]: "Completed",
  [LoanStatus.DEFAULTED]: "Defaulted",
  [LoanStatus.LIQUIDATED]: "Liquidated",
};

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  const loanIds = useReadContract({
    address: LoanManager.address,
    abi: LoanManager.abi,
    functionName: "getUserLoans",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const gracePeriod = useReadContract({
    address: LoanManager.address,
    abi: LoanManager.abi,
    functionName: "gracePeriod",
  });

  const profile = useReadContract({
    address: CreditRegistry.address,
    abi: CreditRegistry.abi,
    functionName: "getProfile",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const [scoreDelta, setScoreDelta] = useState<{ before: number; after: number } | null>(null);

  if (!isConnected) {
    return (
      <div className="text-center py-16 space-y-6">
        <p className="text-slate-400">Connect your wallet to see your loans.</p>
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

  const ids = (loanIds.data as bigint[] | undefined) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Your loans</h1>

      {scoreDelta && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-4 text-center">
          <p className="text-emerald-400 font-medium">
            Score: {scoreDelta.before} → {scoreDelta.after} (
            {scoreDelta.after >= scoreDelta.before ? "+" : ""}
            {scoreDelta.after - scoreDelta.before})
          </p>
        </div>
      )}

      {loanIds.isLoading ? (
        <p className="text-slate-400">Loading loans...</p>
      ) : ids.length === 0 ? (
        <p className="text-slate-500">No loans yet.</p>
      ) : (
        <div className="space-y-4">
          {ids.map((id) => (
            <LoanCard
              key={id.toString()}
              loanId={id}
              gracePeriod={(gracePeriod.data as bigint) ?? 0n}
              beforeScore={profile.data ? Number((profile.data as any).compositeScore) : null}
              onPaid={async (before) => {
                const result = await profile.refetch();
                const after = result.data ? Number((result.data as any).compositeScore) : before;
                if (before !== after) setScoreDelta({ before, after });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LoanCard({
  loanId,
  gracePeriod,
  beforeScore,
  onPaid,
}: {
  loanId: bigint;
  gracePeriod: bigint;
  beforeScore: number | null;
  onPaid: (before: number) => Promise<void>;
}) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loan = useReadContract({
    address: LoanManager.address,
    abi: LoanManager.abi,
    functionName: "getLoan",
    args: [loanId],
  });

  const amountDue = useReadContract({
    address: LoanManager.address,
    abi: LoanManager.abi,
    functionName: "amountDue",
    args: [loanId],
  });

  const nextPayment = useReadContract({
    address: LoanManager.address,
    abi: LoanManager.abi,
    functionName: "nextInstallmentAmount",
    args: [loanId],
  });

  const allowance = useReadContract({
    address: IUSDC.address,
    abi: IUSDC.abi,
    functionName: "allowance",
    args: address ? [address, LoanManager.address] : undefined,
  });

  if (loan.isLoading || !loan.data) return <div className="rounded-lg border border-slate-800 p-5 text-slate-500">Loading...</div>;

  const l = loan.data as any;
  const status = Number(l.status);
  const loanType = Number(l.loanType);
  const nextDueDate = Number(l.nextDueDate);
  const now = Math.floor(Date.now() / 1000);
  const isOverdue = status === LoanStatus.ACTIVE && nextDueDate > 0 && now > nextDueDate + Number(gracePeriod);
  const [principalDue, interestDue] = (amountDue.data as [bigint, bigint] | undefined) ?? [0n, 0n];
  const totalDue = principalDue + interestDue;

  async function pay() {
    if (!address) return;
    setError(null);
    setPaying(true);
    try {
      // Small buffer over the view-computed amount: for continuously-accruing loan types,
      // a few seconds pass between this read and the tx landing, so slightly more interest
      // may have accrued by execution time. Overpayment beyond what's owed is refunded by the
      // contract (LoanManager.makePayment), so this never wastes funds.
      const payAmount = ((nextPayment.data as bigint) ?? totalDue) + 10_000n; // +0.01 iUSDC
      const currentAllowance = (allowance.data as bigint) ?? 0n;
      if (currentAllowance < payAmount) {
        const approveHash = await writeContractAsync({
          address: IUSDC.address,
          abi: IUSDC.abi,
          functionName: "approve",
          args: [LoanManager.address, payAmount],
        });
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });
      }

      const hash = await writeContractAsync({
        address: LoanManager.address,
        abi: LoanManager.abi,
        functionName: "makePayment",
        args: [loanId, payAmount],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });

      await Promise.all([loan.refetch(), amountDue.refetch(), nextPayment.refetch(), allowance.refetch()]);

      // CreditRegistry recomputes on the native-activity write inside makePayment, so a fresh
      // read right after the tx already reflects any score change.
      if (beforeScore !== null) await onPaid(beforeScore);
    } catch (err: any) {
      setError(formatTxError(err));
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className={`rounded-lg border p-5 space-y-3 ${isOverdue ? "border-red-800" : "border-slate-800"}`}>
      <div className="flex items-center justify-between">
        <p className="font-medium">{LOAN_TYPE_LABELS[loanType]}</p>
        <span
          className={`text-xs px-2 py-1 rounded-full border ${
            status === LoanStatus.COMPLETED
              ? "border-emerald-800 text-emerald-400"
              : status === LoanStatus.ACTIVE
                ? isOverdue
                  ? "border-red-800 text-red-400"
                  : "border-indigo-800 text-indigo-400"
                : "border-slate-700 text-slate-400"
          }`}
        >
          {isOverdue ? "Overdue" : LOAN_STATUS_LABELS[status]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate-500 text-xs">Principal</p>
          <p>{formatUnits(l.principal, 6)} iUSDC</p>
        </div>
        <div>
          <p className="text-slate-500 text-xs">Outstanding</p>
          <p>{formatUnits(l.outstandingPrincipal + l.outstandingInterest, 6)} iUSDC</p>
        </div>
        {loanType === LoanType.INSTALLMENT && (
          <div>
            <p className="text-slate-500 text-xs">Installments</p>
            <p>
              {Number(l.installmentsPaid)} / {Number(l.installmentCount)} paid
            </p>
          </div>
        )}
        {nextDueDate > 0 && status === LoanStatus.ACTIVE && (
          <div>
            <p className="text-slate-500 text-xs">Next due</p>
            <p className={isOverdue ? "text-red-400" : ""}>{new Date(nextDueDate * 1000).toLocaleDateString()}</p>
          </div>
        )}
      </div>

      {status === LoanStatus.ACTIVE && totalDue > 0n && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-slate-400">
            Due now: {formatUnits((nextPayment.data as bigint) ?? totalDue, 6)} iUSDC
          </p>
          <button
            onClick={pay}
            disabled={paying}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {paying ? "Paying..." : "Pay"}
          </button>
        </div>
      )}
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
