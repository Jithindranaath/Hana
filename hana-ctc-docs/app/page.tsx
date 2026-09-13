import Link from "next/link";
import { Prose } from "@/components/Prose";

export default function OverviewPage() {
  return (
    <Prose>
      <h1>Hana Network</h1>
      <p className="lead">
        A cross-chain credit layer on Creditcoin. A wallet proves its lending/repayment history
        from Ethereum via the <strong>Attestcoin Protocol</strong> — verified synchronously by a
        precompile, no oracle, no bridge, no permission — and borrows against that imported credit
        on Creditcoin CC3 Testnet.
      </p>

      <p>
        <code>CreditRegistry</code> is a public primitive: any Creditcoin contract can call{" "}
        <code>getCreditLimit(address, asset)</code> and underwrite against an attested,
        multi-chain credit profile. See <Link href="/integrate">Integrate</Link> for the one-line
        version.
      </p>

      <h2>Where to go from here</h2>
      <ul>
        <li>
          <Link href="/architecture">Architecture</Link> — how the pieces fit together, the
          cross-chain import flow end to end.
        </li>
        <li>
          <Link href="/attestcoin">Attestcoin write-up</Link> — proof generation, the
          <code> 0x0FD2</code> precompile, and the four security checks that gate every import
          (each linked to its committed negative test).
        </li>
        <li>
          <Link href="/addresses">Deployed addresses</Link> — every contract on both chains,
          verified, pulled live from the same address book the code itself uses.
        </li>
        <li>
          <Link href="/integrate">Integrate</Link> — read a wallet's credit limit from your own
          contract in one call.
        </li>
      </ul>

      <h2>Status</h2>
      <p>
        Every phase of the build (contracts, the cross-chain worker, the merchant API and portal,
        the checkout hub, the demo store, the lender interface) is deployed and has been verified
        against the real Sepolia + CC3 testnets — not a local chain, not a mock. See this
        repository's root <code>README.md</code> for the full status table and the specific
        transactions behind each claim.
      </p>

      <h2>Hackathon</h2>
      <p>Built for BUIDL CTC 2026 Fall (DoraHacks) — Track: DeFi.</p>
    </Prose>
  );
}
