"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useChainId, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ReleaseType } from "@hana/shared";
import { SUPPORTED_CHAIN_ID, wagmiConfig } from "@/lib/wagmi";
import { CreditRegistry, IUSDC, LoanManager } from "@/lib/contracts";
import { Bill, fetchBill, markBillOriginated } from "@/lib/bills";
import { formatTxError } from "@/lib/errors";
import { Card, Chip, CardSkeleton, ErrorState, AddressChip } from "@/components/ui";

type PlanKind = "INSTALLMENT_4" | "INSTALLMENT_6" | "TERM" | "OVERCOLLATERALIZED";

const RELEASE_TYPE_MAP: Record<Bill["releaseType"], ReleaseType> = {
  IMMEDIATE: ReleaseType.IMMEDIATE,
  TIMELOCK: ReleaseType.TIMELOCK,
  CONDITIONAL: ReleaseType.CONDITIONAL,
};

export default function PayBillPage({ params }: { params: { billHash: string } }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  const [bill, setBill] = useState<Bill | null | undefined>(undefined); // undefined = loading
  const [plan, setPlan] = useState<PlanKind | null>(null);
  const [step, setStep] = useState<"select" | "approving" | "originating" | "done" | "error">("select");
  const [error, setError] = useState<string | null>(null);
  const [loanTxHash, setLoanTxHash] = useState<string | null>(null);
  const [merchantSyncFailed, setMerchantSyncFailed] = useState(false);

  const { writeContractAsync } = useWriteContract();

  useEffect(() => {
    fetchBill(params.billHash).then(setBill);
  }, [params.billHash]);

  const available = useReadContract({
    address: CreditRegistry.address,
    abi: CreditRegistry.abi,
    functionName: "getAvailableCredit",
    args: address ? [address, IUSDC.address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const collateralRatioBps = useReadContract({
    address: LoanManager.address,
    abi: LoanManager.abi,
    functionName: "collateralRatioBps",
    query: { enabled: Boolean(address) },
  });

  const allowance = useReadContract({
    address: IUSDC.address,
    abi: IUSDC.abi,
    functionName: "allowance",
    args: address ? [address, LoanManager.address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const amountUnits = useMemo(() => (bill ? parseUnits(bill.amount, 6) : 0n), [bill]);
  const hasEnoughCredit = available.data !== undefined && (available.data as bigint) >= amountUnits;
  const requiredCollateral = useMemo(() => {
    if (!collateralRatioBps.data) return 0n;
    return (amountUnits * (collateralRatioBps.data as bigint)) / 10_000n;
  }, [amountUnits, collateralRatioBps.data]);

  if (bill === undefined) return <div className="mx-auto max-w-md py-16"><CardSkeleton rows={3} /></div>;
  if (bill === null) {
    return (
      <div className="mx-auto max-w-md py-20">
        <ErrorState title="Bill not found" detail="This checkout link is invalid or has expired." />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-md space-y-6 py-12">
        <BillSummary bill={bill} />
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (chainId !== SUPPORTED_CHAIN_ID) {
    return (
      <div className="mx-auto max-w-md space-y-6 py-12">
        <BillSummary bill={bill} />
        <button
          onClick={() => switchChain({ chainId: SUPPORTED_CHAIN_ID })}
          disabled={switching}
          aria-busy={switching}
          className="btn btn-primary w-full"
        >
          {switching ? "Switching…" : "Switch to CC3 Testnet"}
        </button>
      </div>
    );
  }

  if (bill.status !== "created") {
    return (
      <div className="mx-auto max-w-md space-y-6 py-12">
        <BillSummary bill={bill} />
        <div className="text-center">
          <Chip tone="warn" dot>
            Already {bill.status}
          </Chip>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="mx-auto max-w-md py-14">
        <Card accent className="motion-safe:animate-fade-rise p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-pos/30 bg-pos/10">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-pos" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight2">Payment plan started</h1>
          <p className="mt-2 text-sm text-fg-muted">
            {bill.merchant.name} is settled from the vault on your schedule.
          </p>
          {loanTxHash ? (
            <div className="mt-4 flex justify-center">
              <AddressChip
                address={loanTxHash}
                href={`https://creditcoin-testnet.blockscout.com/tx/${loanTxHash}`}
              />
            </div>
          ) : null}
          {merchantSyncFailed ? (
            <p className="mx-auto mt-4 max-w-xs text-xs leading-relaxed text-warn">
              Your loan is confirmed on-chain, but the merchant&apos;s bill status couldn&apos;t be
              updated just now. It may take a moment to show as paid on their end.
            </p>
          ) : null}
          <Link href="/dashboard" className="btn btn-primary mx-auto mt-6 px-6">
            View in dashboard
          </Link>
        </Card>
      </div>
    );
  }

  async function originate(selected: PlanKind) {
    if (!address || !bill) return;
    setError(null);
    setPlan(selected);
    try {
      const needed = selected === "OVERCOLLATERALIZED" ? requiredCollateral : 0n;
      const currentAllowance = (allowance.data as bigint) ?? 0n;
      if (needed > 0n && currentAllowance < needed) {
        setStep("approving");
        const approveHash = await writeContractAsync({
          address: IUSDC.address,
          abi: IUSDC.abi,
          functionName: "approve",
          args: [LoanManager.address, needed],
        });
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });
      }

      setStep("originating");
      const releaseType = RELEASE_TYPE_MAP[bill.releaseType];
      const releaseTime = releaseType === ReleaseType.TIMELOCK ? BigInt(Math.floor(Date.now() / 1000) + 86_400) : 0n;

      const planParams = planToOriginateParams(selected, amountUnits, requiredCollateral);
      const hash = await writeContractAsync({
        address: LoanManager.address,
        abi: LoanManager.abi,
        functionName: "originate",
        args: [
          {
            loanType: planParams.loanType,
            principal: amountUnits,
            installmentCount: planParams.installmentCount,
            termDays: planParams.termDays,
            billHash: bill.billHash as `0x${string}`,
            merchant: bill.merchant.payoutAddress as `0x${string}`,
            releaseType,
            releaseTime,
            collateralAsset: planParams.loanType === 3 ? IUSDC.address : "0x0000000000000000000000000000000000000000",
            collateralAmount: planParams.loanType === 3 ? requiredCollateral : 0n,
          },
        ],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      setLoanTxHash(hash);

      // The loan is real and confirmed on-chain by this point — a failure to notify the merchant
      // must not surface as a purchase failure. Retry a couple of times (transient network blips
      // are the expected failure mode here, same as the worker's own retry pattern), then fall
      // through to a non-blocking warning rather than losing the sync silently.
      let synced = false;
      for (let attempt = 0; attempt < 3 && !synced; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        synced = await markBillOriginated(bill.billHash);
      }
      setMerchantSyncFailed(!synced);
      setStep("done");
    } catch (err: any) {
      setError(formatTxError(err));
      setStep("error");
    }
  }

  if (step === "approving" || step === "originating") {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <span className="relative mx-auto flex h-2.5 w-2.5">
          <span className="absolute inset-0 rounded-full bg-accent motion-safe:animate-ring-out" aria-hidden />
          <span className="relative h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
        </span>
        <p className="mt-5 text-sm text-fg">
          {step === "approving" ? "Approving iUSDC…" : "Originating your loan…"}
        </p>
        <p className="mt-1.5 text-xs text-fg-subtle">Confirm in your wallet if prompted.</p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="mx-auto max-w-md py-14">
        <ErrorState
          title="Couldn’t start the plan"
          detail={error ?? undefined}
          onRetry={() => setStep("select")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-8">
      <BillSummary bill={bill} />

      {available.isLoading ? (
        <div className="space-y-3">
          <div className="skeleton h-3 w-28" />
          <CardSkeleton rows={3} />
        </div>
      ) : hasEnoughCredit ? (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Choose a plan</p>
            <span className="text-xs text-fg-subtle">
              <span className="mono">{fmtUsdc((available.data as bigint) ?? 0n)}</span> iUSDC available
            </span>
          </div>
          <PlanOption
            title="Pay in 4"
            subtitle="Bi-weekly instalments over 60 days"
            badge="Most popular"
            onClick={() => originate("INSTALLMENT_4")}
          />
          <PlanOption
            title="Pay in 6"
            subtitle="Bi-weekly instalments over 90 days"
            onClick={() => originate("INSTALLMENT_6")}
          />
          <PlanOption
            title="Pay in full in 30 days"
            subtitle="One payment at maturity"
            onClick={() => originate("TERM")}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <Card className="border-warn/25 bg-warn/5">
            <p className="text-sm leading-relaxed text-fg">
              Your available credit (
              <span className="mono">{fmtUsdc((available.data as bigint) ?? 0n)}</span> iUSDC)
              doesn&apos;t cover this purchase yet.
            </p>
            <p className="mt-2 text-xs text-fg-muted">
              <Link href="/link-history" className="underline underline-offset-2 hover:text-fg">
                Link your Ethereum history
              </Link>{" "}
              to raise your limit — or post collateral instead.
            </p>
          </Card>
          <PlanOption
            title="Pay with collateral"
            subtitle={`No credit check — requires ${fmtUsdc(requiredCollateral)} iUSDC collateral`}
            onClick={() => originate("OVERCOLLATERALIZED")}
          />
        </div>
      )}
    </div>
  );
}

/** Matches the 2-decimal money precision used across the checkout. */
function fmtUsdc(value: bigint): string {
  return Number(formatUnits(value, 6)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function BillSummary({ bill }: { bill: Bill }) {
  return (
    <Card accent className="p-6">
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 rounded bg-grad-accent" aria-hidden />
        <p className="text-sm text-fg-muted">{bill.merchant.name}</p>
      </div>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="mono text-4xl font-semibold tracking-display">{bill.amount}</span>
        <span className="text-sm text-fg-subtle">{bill.currency}</span>
      </p>
      <ul className="mt-4 space-y-1.5 border-t border-line pt-4">
        {bill.items.map((item, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-fg-muted">
              <span className="mono text-fg-subtle">{item.quantity}&times;</span> {item.name}
            </span>
            <span className="mono text-fg-muted">
              {item.unitAmount} {bill.currency}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PlanOption({
  title,
  subtitle,
  badge,
  onClick,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card card-hover group flex w-full items-center justify-between gap-4 p-4 text-left"
    >
      <div>
        <p className="flex items-center gap-2 text-sm font-medium">
          {title}
          {badge ? <Chip tone="accent">{badge}</Chip> : null}
        </p>
        <p className="mt-1 text-xs text-fg-muted">{subtitle}</p>
      </div>
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-150 ease-out motion-safe:group-hover:translate-x-0.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** loanType numbering matches LoanType enum in ILoanManager.sol: INSTALLMENT=0, REVOLVING=1, TERM=2, OVERCOLLATERALIZED=3. */
function planToOriginateParams(plan: PlanKind, principal: bigint, collateral: bigint) {
  switch (plan) {
    case "INSTALLMENT_4":
      return { loanType: 0, installmentCount: 4, termDays: 60n };
    case "INSTALLMENT_6":
      return { loanType: 0, installmentCount: 6, termDays: 90n };
    case "TERM":
      return { loanType: 2, installmentCount: 0, termDays: 30n };
    case "OVERCOLLATERALIZED":
      return { loanType: 3, installmentCount: 0, termDays: 30n };
  }
}
