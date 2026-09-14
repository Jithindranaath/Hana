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
import { Card, Chip, ErrorState, Stat } from "@/components/ui";

export default function CreditLinePage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <Chip tone="accent" dot className="mb-5">
          Reference application #2
        </Chip>
        <h1 className="text-2xl font-semibold tracking-tight2">SPACE credit line</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-fg-muted">
          A DePIN node-operator credit line, drawn against the same score that powers Hana BNPL —
          and serviced by staking yield instead of your own capital.
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

  const busyLabel = (k: typeof busy, idle: string, active: string) => (busy === k ? active : idle);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Chip tone="accent" dot className="mb-3">
            Reference application #2
          </Chip>
          <h1 className="text-xl font-semibold tracking-tight2">SPACE credit line</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-muted">
            Same registry, same score, an entirely different credit product from BNPL. This is the
            SpaceRouter Credit Line from Creditcoin&apos;s published roadmap — credit for DePIN node
            operators, serviced from staking yield rather than outside capital.
          </p>
        </div>
      </div>

      <Card accent className="motion-safe:animate-fade-rise p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs text-fg-muted">SPACE credit limit</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="mono text-3xl font-semibold tracking-tight2 gradient-text">
                {fmt(limit.data)}
              </span>
              <span className="text-xs text-fg-subtle">SPACE</span>
            </p>
          </div>
          <p className="max-w-xs text-xs text-fg-subtle">
            Sourced from{" "}
            <Link href="/" className="text-fg-muted underline underline-offset-2 hover:text-fg">
              your Hana credit score
            </Link>{" "}
            — the very same number that sizes your iUSDC BNPL limit. One registry, two products.
          </p>
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-medium">Your position</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card><Stat label="Principal outstanding" value={fmt(principal)} unit="SPACE" size="sm" /></Card>
          <Card><Stat label="Interest owed" value={fmt(interestOwed)} unit="SPACE" size="sm" /></Card>
          <Card><Stat label="Staked on your behalf" value={fmt(stakedPrincipal)} unit="SPACE" size="sm" sub="You never custody the principal" /></Card>
          <Card>
            <Stat label="Accrued yield, unclaimed" value={fmt(pendingYield)} unit="SPACE" size="sm" tone={pendingYield > 0n ? "pos" : undefined} />
          </Card>
          <Card>
            <Stat
              label="Yield applied to debt, lifetime"
              value={history === null ? <span className="skeleton inline-block h-5 w-20 align-middle" /> : fmt(totalYieldAppliedToDebt)}
              unit="SPACE"
              size="sm"
              tone="pos"
            />
          </Card>
          <Card>
            <p className="text-xs text-fg-muted">Projected payoff</p>
            <p className="mt-1.5 text-sm leading-relaxed text-fg">
              {!hasDebt
                ? "No outstanding debt."
                : payoffBlocks !== null
                  ? <><span className="mono font-semibold">~{payoffBlocks.toLocaleString()}</span> blocks at the current rate</>
                  : "Yield won’t outpace interest at this rate — draw less, or wait for a rate change."}
            </p>
          </Card>
        </div>
      </div>

      {error ? <ErrorState title="Transaction didn’t go through" detail={error} /> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">Draw</h3>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">
              Drawn SPACE is auto-staked on your behalf in the same transaction.
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="draw-amount" className="block text-xs text-fg-muted">
              Amount
            </label>
            <div className="relative">
              <input
                id="draw-amount"
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
                SPACE
              </span>
            </div>
          </div>
          <button onClick={openLine} disabled={!amount || busy !== null} aria-busy={busy === "open"} className="btn btn-primary w-full">
            {busyLabel("open", "Draw and stake", "Drawing…")}
          </button>
        </Card>

        <Card className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">Claim &amp; repay</h3>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">
              Applies claimed yield to interest first, then principal. Anything left over once the
              debt is clear pays straight to you.
            </p>
          </div>
          <button
            onClick={repayFromYield}
            disabled={!open || pendingYield === 0n || busy !== null}
            aria-busy={busy === "repay"}
            className="btn btn-primary w-full"
          >
            {busyLabel("repay", "Claim yield and repay", "Claiming…")}
          </button>
          {canClose ? (
            <button onClick={closeLine} disabled={busy !== null} aria-busy={busy === "close"} className="btn btn-secondary w-full">
              {busyLabel("close", "Close line and unstake", "Closing…")}
            </button>
          ) : null}
        </Card>

        <Card className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">Testnet faucet</h3>
            <p className="mt-1 text-xs text-fg-muted">
              Wallet balance{" "}
              <span className="mono text-fg">{fmt(spaceBalance.data)}</span> SPACE
            </p>
          </div>
          <button onClick={faucet} disabled={busy !== null} aria-busy={busy === "faucet"} className="btn btn-secondary w-full">
            {busyLabel("faucet", "Get testnet SPACE", "Requesting…")}
          </button>
        </Card>
      </div>
    </div>
  );
}

/** Every SPACE figure in this view shares a decimal precision — ragged column widths
 *  (4,114.2857 next to 194.4) read as unconsidered. Sub-unit dust keeps more digits so a
 *  small accrual is still visible rather than rounding to 0.00. */
function fmt(value: unknown): string {
  if (value === undefined || value === null) return "—";
  const n = Number(formatUnits(value as bigint, 18));
  const digits = n > 0 && n < 1 ? 4 : 2;
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
