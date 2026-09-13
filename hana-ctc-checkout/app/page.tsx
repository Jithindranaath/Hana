"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { useAccount, useChainId, useReadContract, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SUPPORTED_CHAIN_ID } from "@/lib/wagmi";
import { CreditRegistry, IUSDC } from "@/lib/contracts";

export default function HomePage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="text-center py-20 space-y-6">
        <h1 className="text-3xl font-semibold">Prove your credit. Borrow against it.</h1>
        <p className="text-slate-400 max-w-md mx-auto">
          Hana reads your lending history from Ethereum and unlocks a credit limit on Creditcoin
          — no oracle, no bridge, no permission.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (chainId !== SUPPORTED_CHAIN_ID) {
    return (
      <div className="text-center py-20 space-y-4">
        <h1 className="text-xl font-semibold">Wrong network</h1>
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

  return <CreditProfile address={address!} />;
}

function CreditProfile({ address }: { address: `0x${string}` }) {
  const profile = useReadContract({
    address: CreditRegistry.address,
    abi: CreditRegistry.abi,
    functionName: "getProfile",
    args: [address],
  });
  const available = useReadContract({
    address: CreditRegistry.address,
    abi: CreditRegistry.abi,
    functionName: "getAvailableCredit",
    args: [address, IUSDC.address],
  });

  if (profile.isLoading || available.isLoading) {
    return <p className="text-slate-400">Loading your credit profile from CC3...</p>;
  }
  if (profile.error) {
    return <p className="text-red-400">Failed to load profile: {profile.error.message}</p>;
  }

  const p = profile.data as any;
  const composite = Number(p.compositeScore);
  const pct = Math.max(0, Math.min(100, ((composite - 300) / (850 - 300)) * 100));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-slate-400 text-sm">Your Hana credit score</p>
        <div className="mt-3 h-4 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>300</span>
          <span>850</span>
        </div>
        <p className="text-4xl font-semibold mt-3">{composite}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <SubScore label="Repayment" value={Number(p.repaymentScore)} />
        <SubScore label="Volume" value={Number(p.volumeScore)} />
        <SubScore label="Tenure" value={Number(p.tenureScore)} />
      </div>

      {p.hasImportedHistory ? (
        <span className="inline-block rounded-full bg-emerald-950 text-emerald-400 text-xs px-3 py-1 border border-emerald-800">
          Ethereum history linked
        </span>
      ) : (
        <span className="inline-block rounded-full bg-slate-900 text-slate-400 text-xs px-3 py-1 border border-slate-700">
          No imported history yet
        </span>
      )}

      <div className="rounded-lg border border-slate-800 p-5">
        <p className="text-slate-400 text-sm">Available credit (iUSDC)</p>
        <p className="text-2xl font-semibold mt-1">{formatUnits(available.data as bigint, 6)}</p>
      </div>

      {!p.hasImportedHistory && (
        <Link
          href="/link-history"
          className="inline-block rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
        >
          Link your Ethereum history to raise your score
        </Link>
      )}
    </div>
  );
}

function SubScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 p-4 text-center">
      <p className="text-slate-400 text-xs">{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
      <p className="text-slate-600 text-[10px]">/ 1000</p>
    </div>
  );
}
