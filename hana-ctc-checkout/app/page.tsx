"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { useAccount, useChainId, useReadContract, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SUPPORTED_CHAIN_ID } from "@/lib/wagmi";
import { CreditRegistry, IUSDC, MockSPACE } from "@/lib/contracts";
import { Card, Chip, CardSkeleton, ErrorState, AddressChip } from "@/components/ui";
import { ScoreGauge, SubScoreBar } from "@/components/ScoreGauge";

const EXPLORER = "https://creditcoin-testnet.blockscout.com";

export default function HomePage() {
  const { address, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  if (isConnecting) return <ConnectingState />;
  if (!isConnected) return <Hero />;
  if (chainId !== SUPPORTED_CHAIN_ID) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card accent className="space-y-4 text-center">
          <Chip tone="warn" dot>
            Wrong network
          </Chip>
          <h1 className="text-xl font-semibold tracking-tight2">Switch to Creditcoin</h1>
          <p className="text-sm text-fg-muted">
            Hana&apos;s contracts live on CC3 Testnet. Your wallet is pointed somewhere else.
          </p>
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
  return <CreditProfile address={address!} />;
}

/* ------------------------------------------------------------------ states */

function ConnectingState() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <Chip tone="accent" dot pulse>
        Connecting
      </Chip>
      <p className="mt-4 text-sm text-fg-muted">Confirm the connection in your wallet.</p>
    </div>
  );
}

function Hero() {
  return (
    <div className="py-14 md:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <Chip tone="accent" dot className="mb-6">
          Verified by proof, not by an oracle
        </Chip>

        <h1 className="text-4xl font-semibold leading-[1.08] tracking-display md:text-5xl">
          Your credit history{" "}
          <span className="gradient-text">follows you</span> across chains.
        </h1>

        <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-fg-muted">
          Hana reads your lending record from Ethereum, proves it on Creditcoin with a Merkle
          inclusion proof, and turns it into a credit limit any contract on this chain can
          underwrite against.
        </p>

        <div className="mt-8 flex justify-center">
          <ConnectButton />
        </div>
      </div>

      <div className="mx-auto mt-14 grid max-w-3xl gap-3 sm:grid-cols-3">
        {[
          { k: "No oracle", v: "A precompile verifies the proof on-chain — nobody attests on your behalf." },
          { k: "No bridge", v: "Nothing custodial moves. Only a claim about your past behaviour." },
          { k: "No permission", v: "getCreditLimit() is a public view call. Any dApp can read it." },
        ].map((f, i) => (
          <Card
            key={f.k}
            hover
            className="motion-safe:animate-fade-rise"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <p className="text-sm font-medium text-fg">{f.k}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{f.v}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ profile */

function CreditProfile({ address }: { address: `0x${string}` }) {
  const profile = useReadContract({
    address: CreditRegistry.address,
    abi: CreditRegistry.abi,
    functionName: "getProfile",
    args: [address],
  });
  const availableUsdc = useReadContract({
    address: CreditRegistry.address,
    abi: CreditRegistry.abi,
    functionName: "getAvailableCredit",
    args: [address, IUSDC.address],
  });
  const availableSpace = useReadContract({
    address: CreditRegistry.address,
    abi: CreditRegistry.abi,
    functionName: "getAvailableCredit",
    args: [address, MockSPACE.address],
  });

  if (profile.isLoading) {
    return (
      <div className="space-y-6">
        <CardSkeleton rows={4} />
        <div className="grid gap-4 sm:grid-cols-2">
          <CardSkeleton rows={1} />
          <CardSkeleton rows={1} />
        </div>
      </div>
    );
  }

  if (profile.error) {
    return (
      <ErrorState
        title="Couldn't read your credit profile"
        detail={profile.error.message}
        onRetry={() => profile.refetch()}
      />
    );
  }

  const p = profile.data as any;
  const composite = Number(p.compositeScore);
  const imported = Boolean(p.hasImportedHistory);

  const usdc = availableUsdc.data as bigint | undefined;
  const space = availableSpace.data as bigint | undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight2">Credit profile</h1>
          <div className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
            <span>Wallet</span>
            <AddressChip address={address} href={`${EXPLORER}/address/${address}`} />
          </div>
        </div>
        {imported ? (
          <Chip tone="pos" dot>
            Ethereum history linked
          </Chip>
        ) : (
          <Chip tone="neutral" dot>
            No imported history
          </Chip>
        )}
      </div>

      <Card accent className="motion-safe:animate-fade-rise p-6 md:p-8">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <ScoreGauge score={composite} imported={imported} />
          <div className="space-y-5">
            <p className="text-xs text-fg-muted">
              Three dimensions, each scored independently and weighted into the composite.
              Imported history always counts for less than activity native to this chain.
            </p>
            <SubScoreBar label="Repayment" value={Number(p.repaymentScore)} />
            <SubScoreBar label="Volume" value={Number(p.volumeScore)} />
            <SubScoreBar label="Tenure" value={Number(p.tenureScore)} />
          </div>
        </div>
      </Card>

      {/* The pivot's whole thesis in one row: one score, two unrelated credit products. */}
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">Credit unlocked by this score</h2>
          <span className="text-xs text-fg-subtle">Two products, one registry</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <AssetCard
            title="Retail BNPL"
            asset="iUSDC"
            value={usdc}
            decimals={6}
            loading={availableUsdc.isLoading}
            href="/dashboard"
            cta="View loans"
          />
          <AssetCard
            title="DePIN credit line"
            asset="SPACE"
            value={space}
            decimals={18}
            loading={availableSpace.isLoading}
            href="/credit-line"
            cta="Open a line"
          />
        </div>
      </div>

      {!imported && (
        <Card accent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">You&apos;re starting at the floor</p>
            <p className="mt-1 text-xs text-fg-muted">
              Import a repayment record from Ethereum to raise this score and unlock credit.
            </p>
          </div>
          <Link href="/link-history" className="btn btn-primary">
            Link Ethereum history
          </Link>
        </Card>
      )}
    </div>
  );
}

function AssetCard({
  title,
  asset,
  value,
  decimals,
  loading,
  href,
  cta,
}: {
  title: string;
  asset: string;
  value: bigint | undefined;
  decimals: number;
  loading: boolean;
  href: string;
  cta: string;
}) {
  const amount =
    value === undefined
      ? "—"
      : Number(formatUnits(value, decimals)).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        });
  return (
    <Card hover className="flex flex-col justify-between gap-4">
      <div>
        <p className="text-xs text-fg-muted">{title}</p>
        {loading ? (
          <div className="mt-2 h-8 w-32 skeleton" />
        ) : (
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="mono text-2xl font-semibold tracking-tight2">{amount}</span>
            <span className="text-xs text-fg-subtle">{asset}</span>
          </p>
        )}
        <p className="mt-1 text-xs text-fg-subtle">Available to draw now</p>
      </div>
      <Link href={href} className="btn btn-secondary self-start">
        {cta}
      </Link>
    </Card>
  );
}
