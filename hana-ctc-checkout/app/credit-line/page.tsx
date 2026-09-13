"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SUPPORTED_CHAIN_ID, wagmiConfig } from "@/lib/wagmi";
import { CreditRegistry, MockSPACE, MockSpaceStaking, SpaceCreditLine } from "@/lib/contracts";
import { formatTxError } from "@/lib/errors";
import { getYieldRepaidHistory, YieldRepaidEvent } from "@/lib/creditLineHistory";

export default function CreditLinePage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="text-center py-16 space-y-6">
        <h1 className="text-2xl font-semibold">SPACE credit line</h1>
        <p className="text-slate-400 max-w-md mx-auto">
          Reference app #2: a DePIN node-operator credit line, drawn against the same score that
          powers Hana BNPL. Connect your wallet to open one.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
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

  return <CreditLine address={address!} />;
}

function CreditLine({ address }: { address: `0x${string}` }) {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"open" | "repay" | "close" | "faucet" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<YieldRepaidEvent[] | null>(null);

  useEffect(() => {
    if (!publicClient) return;
    getYieldRepaidHistory(publicClient, address).then(setHistory).catch(() => setHistory([]));
  }, [publicClient, address]);

  const totalYieldAppliedToDebt = (history ?? []).reduce(
    (sum, h) => sum + h.appliedToInterest + h.appliedToPrincipal,
    0n
  );

  const limit = useReadContract({
    address: CreditRegistry.address,
    abi: CreditRegistry.abi,
    functionName: "getCreditLimit",
    args: [address, MockSPACE.address],
  });
  const spaceBalance = useReadContract({
    address: MockSPACE.address,
    abi: MockSPACE.abi,
    functionName: "balanceOf",
    args: [address],
  });
  const position = useReadContract({
    address: SpaceCreditLine.address,
    abi: SpaceCreditLine.abi,
    functionName: "getPosition",
    args: [address],
  });
  const yieldBpsPerBlock = useReadContract({
    address: MockSpaceStaking.address,
    abi: MockSpaceStaking.abi,
    functionName: "yieldBpsPerBlock",
  });
  const interestBpsPerBlock = useReadContract({
    address: SpaceCreditLine.address,
    abi: SpaceCreditLine.abi,
    functionName: "interestBpsPerBlock",
  });

  function refetchAll() {
    limit.refetch();
    spaceBalance.refetch();
    position.refetch();
    if (publicClient) getYieldRepaidHistory(publicClient, address).then(setHistory).catch(() => {});
  }

  async function openLine() {
    if (!amount) return;
    setError(null);
    setBusy("open");
    try {
      const units = parseUnits(amount, 18);
      const hash = await writeContractAsync({
        address: SpaceCreditLine.address,
        abi: SpaceCreditLine.abi,
        functionName: "openLine",
        args: [units],
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

  async function repayFromYield() {
    setError(null);
    setBusy("repay");
    try {
      const hash = await writeContractAsync({
        address: SpaceCreditLine.address,
        abi: SpaceCreditLine.abi,
        functionName: "repayFromYield",
        args: [],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      refetchAll();
    } catch (err: any) {
      setError(formatTxError(err));
    } finally {
      setBusy(null);
    }
  }

  async function closeLine() {
    setError(null);
    setBusy("close");
    try {
      const hash = await writeContractAsync({
        address: SpaceCreditLine.address,
        abi: SpaceCreditLine.abi,
        functionName: "closeLine",
        args: [],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      refetchAll();
    } catch (err: any) {
      setError(formatTxError(err));
    } finally {
      setBusy(null);
    }
  }

  async function faucet() {
    setError(null);
    setBusy("faucet");
    try {
      const hash = await writeContractAsync({
        address: MockSPACE.address,
        abi: MockSPACE.abi,
        functionName: "faucet",
        args: [],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      spaceBalance.refetch();
    } catch (err: any) {
      setError(formatTxError(err));
    } finally {
      setBusy(null);
    }
  }

  const pos = position.data as [bigint, bigint, bigint, bigint, boolean] | undefined;
  const [principal, interestOwed, stakedPrincipal, pendingYield, open] = pos ?? [0n, 0n, 0n, 0n, false];
  const totalDebt = principal + interestOwed;
  const hasDebt = totalDebt > 0n;
  const canClose = open && !hasDebt;

  // Rough, current-rate projection: net SPACE/block the position generates toward its own debt.
  // Ignores that the interest burden itself shrinks as principal is repaid, so this over-estimates
  // time-to-payoff rather than under-estimating it.
  let payoffBlocks: number | null = null;
  if (hasDebt && yieldBpsPerBlock.data !== undefined && interestBpsPerBlock.data !== undefined) {
    const yieldRate = yieldBpsPerBlock.data as bigint;
    const interestRate = interestBpsPerBlock.data as bigint;
    const netPerBlock = (stakedPrincipal * yieldRate - principal * interestRate) / 10_000n;
    if (netPerBlock > 0n) {
      payoffBlocks = Number(totalDebt / netPerBlock) + 1;
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">SPACE credit line</h1>
        <p className="text-slate-400 text-sm mt-1">
          Reference app #2. Same registry, same score, a completely different credit product from
          BNPL: this is the SpaceRouter Credit Line from Creditcoin&apos;s published roadmap — a
          credit line for DePIN node operators, serviced from staking yield instead of outside
          capital.
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 p-5 space-y-2">
        <p className="text-slate-400 text-sm">
          SPACE credit limit —{" "}
          <Link href="/" className="text-indigo-400 hover:text-indigo-300">
            sourced from your Hana credit score
          </Link>
          , the same score that sizes your BNPL limit
        </p>
        <p className="text-2xl font-semibold">{fmt(limit.data)} SPACE</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Stat label="Principal outstanding" value={fmt(principal)} suffix="SPACE" />
        <Stat label="Interest owed" value={fmt(interestOwed)} suffix="SPACE" />
        <Stat label="Staked (auto)" value={fmt(stakedPrincipal)} suffix="SPACE" />
        <Stat label="Accrued yield, unclaimed" value={fmt(pendingYield)} suffix="SPACE" />
        <Stat
          label="Yield applied to debt, lifetime"
          value={history === null ? "..." : fmt(totalYieldAppliedToDebt)}
          suffix="SPACE"
        />
      </div>

      <div className="rounded-lg border border-slate-800 p-4">
        <p className="text-slate-400 text-xs">Projected payoff</p>
        <p className="text-sm mt-1">
          {!hasDebt
            ? "No outstanding debt."
            : payoffBlocks !== null
              ? `~${payoffBlocks.toLocaleString()} blocks at the current yield rate`
              : "Yield at the current rate won't outpace interest — draw less, or wait for a rate change."}
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 p-5 space-y-3 max-w-sm">
        <p className="text-slate-400 text-sm">Open / draw more</p>
        <p className="text-slate-600 text-xs">
          Drawn SPACE is auto-staked into MockSpaceStaking on your behalf — you never custody the
          principal.
        </p>
        <input
          type="number"
          placeholder="Amount (SPACE)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
        />
        <button
          onClick={openLine}
          disabled={!amount || busy !== null}
          className="w-full rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy === "open" ? "Opening..." : "Open / draw"}
        </button>
      </div>

      <div className="rounded-lg border border-slate-800 p-5 space-y-3 max-w-sm">
        <p className="text-slate-400 text-sm">Claim &amp; repay</p>
        <p className="text-slate-600 text-xs">
          Claims accrued staking yield and applies it to your debt — interest first, then
          principal. Any yield left over once your debt is clear pays straight to you.
        </p>
        <button
          onClick={repayFromYield}
          disabled={!open || pendingYield === 0n || busy !== null}
          className="w-full rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy === "repay" ? "Claiming..." : "Claim yield & repay"}
        </button>
        {canClose && (
          <button
            onClick={closeLine}
            disabled={busy !== null}
            className="w-full rounded border border-slate-700 px-4 py-2 text-sm font-medium hover:border-slate-500 disabled:opacity-50"
          >
            {busy === "close" ? "Closing..." : "Close line — unstake everything"}
          </button>
        )}
      </div>

      <div className="rounded-lg border border-slate-800 p-5 space-y-3 max-w-sm">
        <p className="text-slate-400 text-sm">Testnet SPACE faucet</p>
        <p className="text-slate-600 text-xs">Wallet balance: {fmt(spaceBalance.data)} SPACE</p>
        <button
          onClick={faucet}
          disabled={busy !== null}
          className="w-full rounded border border-slate-700 px-4 py-2 text-sm font-medium hover:border-slate-500 disabled:opacity-50"
        >
          {busy === "faucet" ? "Requesting..." : "Get testnet SPACE"}
        </button>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}

function fmt(value: unknown): string {
  if (value === undefined || value === null) return "-";
  return Number(formatUnits(value as bigint, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 });
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
