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
import { Card, Chip, CardSkeleton, EmptyState, ErrorState, Tone } from "@/components/ui";

/** iUSDC is a 6-decimal token, but raw formatUnits output (85.772501) next to a rounded
 *  figure (114) reads as unconsidered. Every money figure in this view shares 2 decimals. */
function usdc(value: bigint): string {
  return Number(formatUnits(value, 6)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm text-fg-muted">Connect your wallet to see your loans.</p>
        <div className="mt-6 flex justify-center">
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

  const ids = (loanIds.data as bigint[] | undefined) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight2">Your loans</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Reference application #1 — retail BNPL, originated against your imported credit limit.
        </p>
      </div>

      {scoreDelta ? (
        <Card accent className="motion-safe:animate-fade-rise flex items-center justify-between gap-4 border-pos/25 bg-pos/5">
          <div>
            <p className="text-xs text-fg-muted">On-time payment recorded on-chain</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="mono text-lg text-fg-muted">{scoreDelta.before}</span>
              <span className="text-fg-subtle" aria-hidden>&rarr;</span>
              <span className="mono text-2xl font-semibold text-pos">{scoreDelta.after}</span>
            </p>
          </div>
          <Chip tone="pos">
            {scoreDelta.after >= scoreDelta.before ? "+" : ""}
            {scoreDelta.after - scoreDelta.before} points
          </Chip>
        </Card>
      ) : null}

      {loanIds.isLoading ? (
        <div className="space-y-4">
          <CardSkeleton rows={2} />
          <CardSkeleton rows={2} />
        </div>
      ) : ids.length === 0 ? (
        <EmptyState
          title="No loans yet"
          body="Check out on the demo store with Hana and your first installment plan will appear here."
        />
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

  if (loan.isLoading || !loan.data) return <CardSkeleton rows={2} />;

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

  const statusTone: Tone =
    status === LoanStatus.COMPLETED ? "pos" : isOverdue ? "neg" : status === LoanStatus.ACTIVE ? "accent" : "neutral";
  const dueNow = (nextPayment.data as bigint) ?? totalDue;

  return (
    <Card hover className={isOverdue ? "border-neg/40" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{LOAN_TYPE_LABELS[loanType]}</p>
          <p className="mt-0.5 text-xs text-fg-subtle">Loan #{loanId.toString()}</p>
        </div>
        <Chip tone={statusTone} dot pulse={status === LoanStatus.ACTIVE && !isOverdue}>
          {isOverdue ? "Overdue" : LOAN_STATUS_LABELS[status]}
        </Chip>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-fg-muted">Principal</dt>
          <dd className="mono mt-1 text-sm">{usdc(l.principal)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">Outstanding</dt>
          <dd className="mono mt-1 text-sm">
            {usdc(l.outstandingPrincipal + l.outstandingInterest)}
          </dd>
        </div>
        {loanType === LoanType.INSTALLMENT ? (
          <div>
            <dt className="text-xs text-fg-muted">Installments</dt>
            <dd className="mt-2 flex items-center gap-2">
              {/* One pill per installment — paid progress is readable at a glance on video. */}
              <span className="flex gap-1" aria-hidden>
                {Array.from({ length: Number(l.installmentCount) }).map((_, idx) => (
                  <span
                    key={idx}
                    className={
                      idx < Number(l.installmentsPaid)
                        ? "h-1.5 w-4 rounded-full bg-grad-accent-r"
                        : "h-1.5 w-4 rounded-full bg-surface-3"
                    }
                  />
                ))}
              </span>
              <span className="mono text-xs text-fg-muted">
                {Number(l.installmentsPaid)}/{Number(l.installmentCount)}
              </span>
            </dd>
          </div>
        ) : null}
        {nextDueDate > 0 && status === LoanStatus.ACTIVE ? (
          <div>
            <dt className="text-xs text-fg-muted">Next due</dt>
            <dd className={`mono mt-1 text-sm ${isOverdue ? "text-neg" : ""}`}>
              {new Date(nextDueDate * 1000).toLocaleDateString()}
            </dd>
          </div>
        ) : null}
      </dl>

      {status === LoanStatus.ACTIVE && totalDue > 0n ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="text-xs text-fg-muted">Due now</p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className="mono text-lg font-semibold">{usdc(dueNow)}</span>
              <span className="text-xs text-fg-subtle">iUSDC</span>
            </p>
          </div>
          <button onClick={pay} disabled={paying} aria-busy={paying} className="btn btn-primary">
            {paying ? "Paying…" : "Pay installment"}
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <ErrorState title="Payment didn’t go through" detail={error} onRetry={pay} />
        </div>
      ) : null}
    </Card>
  );
}
