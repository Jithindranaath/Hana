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

  if (bill === undefined) return <p className="text-slate-400 text-center py-20">Loading bill...</p>;
  if (bill === null) return <p className="text-red-400 text-center py-20">Bill not found.</p>;

  if (!isConnected) {
    return (
      <div className="text-center py-16 space-y-6">
        <BillSummary bill={bill} />
        <ConnectButton />
      </div>
    );
  }

  if (chainId !== SUPPORTED_CHAIN_ID) {
    return (
      <div className="text-center py-16 space-y-4">
        <BillSummary bill={bill} />
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

  if (bill.status !== "created") {
    return (
      <div className="text-center py-16 space-y-4">
        <BillSummary bill={bill} />
        <p className="text-amber-400">This bill has already been {bill.status}.</p>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="text-center py-16 space-y-6">
        <h1 className="text-2xl font-semibold text-emerald-400">Payment plan started!</h1>
        <p className="text-slate-400">{bill.merchant.name} will receive your payment as scheduled.</p>
        {loanTxHash && <p className="text-xs text-slate-500 font-mono break-all">{loanTxHash}</p>}
        {merchantSyncFailed && (
          <p className="text-amber-400 text-sm max-w-md mx-auto">
            Your loan is confirmed on-chain, but we couldn&apos;t reach the merchant to update the
            bill status just now. It may take a moment to show as paid on their end.
          </p>
        )}
        <Link href="/dashboard" className="inline-block rounded bg-indigo-600 px-6 py-3 font-medium hover:bg-indigo-500">
          View in dashboard
        </Link>
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
      <div className="text-center py-16 space-y-4">
        <div className="mx-auto h-8 w-8 rounded-full border-2 border-slate-700 border-t-indigo-400 animate-spin" />
        <p className="text-slate-300">
          {step === "approving" ? "Approving iUSDC..." : "Originating your loan..."}
        </p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-red-400 max-w-md mx-auto">{error}</p>
        <button
          onClick={() => setStep("select")}
          className="rounded border border-slate-700 px-4 py-2 text-sm hover:border-slate-500"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <BillSummary bill={bill} />

      {available.isLoading ? (
        <p className="text-slate-400 text-center">Checking your available credit...</p>
      ) : hasEnoughCredit ? (
        <div className="space-y-3">
          <p className="text-slate-400 text-sm">Choose a plan</p>
          <PlanOption
            title="Pay in 4 installments"
            subtitle="Bi-weekly, over 60 days"
            onClick={() => originate("INSTALLMENT_4")}
          />
          <PlanOption
            title="Pay in 6 installments"
            subtitle="Bi-weekly, over 90 days"
            onClick={() => originate("INSTALLMENT_6")}
          />
          <PlanOption title="Pay in full in 30 days" subtitle="Single payment at maturity" onClick={() => originate("TERM")} />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-amber-400 text-sm">
            Your available credit ({formatUnits((available.data as bigint) ?? 0n, 6)} iUSDC) isn't enough for
            this purchase yet.{" "}
            <Link href="/link-history" className="underline">
              Link your Ethereum history
            </Link>{" "}
            to raise your limit, or pay with collateral instead:
          </p>
          <PlanOption
            title="Pay with collateral"
            subtitle={`No credit check — requires ${formatUnits(requiredCollateral, 6)} iUSDC collateral`}
            onClick={() => originate("OVERCOLLATERALIZED")}
          />
        </div>
      )}
    </div>
  );
}

function BillSummary({ bill }: { bill: Bill }) {
  return (
    <div className="rounded-lg border border-slate-800 p-5 space-y-2">
      <p className="text-slate-400 text-sm">{bill.merchant.name}</p>
      <p className="text-3xl font-semibold">
        {bill.amount} {bill.currency}
      </p>
      <ul className="text-sm text-slate-400">
        {bill.items.map((item, i) => (
          <li key={i}>
            {item.quantity}x {item.name} — {item.unitAmount} {bill.currency}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlanOption({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-slate-800 p-4 hover:border-indigo-600 transition-colors"
    >
      <p className="font-medium">{title}</p>
      <p className="text-slate-500 text-xs mt-1">{subtitle}</p>
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
