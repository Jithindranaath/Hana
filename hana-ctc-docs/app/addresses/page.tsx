import { contracts as cc3Contracts, chainId as cc3ChainId } from "@hana/shared/src/generated/cc3";
import { contracts as sepoliaContracts, chainId as sepoliaChainId } from "@hana/shared/src/generated/sepolia";
import { Prose } from "@/components/Prose";

const CC3_EXPLORER = "https://creditcoin-testnet.blockscout.com";
const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

function AddressTable({ contracts, explorerBase }: { contracts: Record<string, { address: string }>; explorerBase: string }) {
  const entries = Object.entries(contracts);
  if (entries.length === 0) {
    return <p className="text-slate-500">No deployments recorded for this network yet.</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>Contract</th>
          <th>Address</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([name, entry]) => (
          <tr key={name}>
            <td>
              <code>{name}</code>
            </td>
            <td>
              <a href={`${explorerBase}/address/${entry.address}#code`} target="_blank" rel="noreferrer">
                <code>{entry.address}</code>
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AddressesPage() {
  return (
    <Prose>
      <h1>Deployed addresses</h1>
      <p>
        Pulled directly from <code>packages/shared/src/generated/</code> — the same address book
        every package in this repo imports from (WORKFLOW rule #1: nothing hand-copies an
        address). If this page and a package&apos;s runtime behavior ever disagree, this page is
        wrong, not the other way around — regenerate it with <code>pnpm sync:abis</code>.
      </p>

      <h2>Creditcoin CC3 Testnet (chainId {cc3ChainId})</h2>
      <AddressTable contracts={cc3Contracts as any} explorerBase={CC3_EXPLORER} />

      <h2>Ethereum Sepolia (chainId {sepoliaChainId}) — credit-import source chain</h2>
      <AddressTable contracts={sepoliaContracts as any} explorerBase={SEPOLIA_EXPLORER} />

      <p>All contracts above are verified — source published, not just deployed bytecode.</p>
    </Prose>
  );
}
