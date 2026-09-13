import Link from "next/link";
import { Prose } from "@/components/Prose";

export default function OverviewPage() {
  return (
    <Prose>
      <h1>Hana Network</h1>
      <p className="lead">
        Hana is a cross-chain credit primitive for Creditcoin. <code>CreditRegistry</code> imports
        a wallet&apos;s lending history from other chains — verified synchronously by the{" "}
        <strong>Attestcoin Protocol</strong>, no oracle, no bridge, no permission — and exposes a
        single call, <code>getCreditLimit(address, asset)</code>, that any Creditcoin contract can
        read to underwrite that wallet. The registry is the product; everything else in this repo
        is a reference application proving it works.
      </p>

      <h2>Two reference applications, one registry</h2>
      <p>
        Two completely different credit products draw on the exact same imported score, through
        the exact same interface, with zero coupling between them:
      </p>
      <ul>
        <li>
          <strong>BNPL checkout</strong> (reference app #1) — a shopper imports their Ethereum
          history, then buys from a demo storefront on installment, term, revolving, or
          overcollateralized terms.
        </li>
        <li>
          <strong>SpaceCreditLine</strong> (reference app #2) — a DePIN node operator draws a
          credit line in $SPACE against the same score, auto-stakes it, and repays from staking
          yield instead of outside capital. This is the <em>SpaceRouter Credit Line</em> from
          Creditcoin&apos;s own published roadmap, not a product Hana invented — the registry is
          the missing underwriting layer it needs, built and deployed ahead of the product itself.
        </li>
      </ul>
      <p>
        Neither reference app touches the other&apos;s internals. Both are just
        registry-authorized reporters (<code>CreditRegistry.authorizedReporters</code>) calling{" "}
        <code>getCreditLimit</code> and <code>recordNativeActivity</code> — the same two-function
        surface a third, fourth, or fifth Creditcoin contract would use. See{" "}
        <Link href="/integrate">Build on Hana</Link> for that interface.
      </p>

      <h2>Credit on Creditcoin</h2>
      <p>
        Hana isn&apos;t the first credit system on Creditcoin. <strong>Credal</strong>,
        Gluwa&apos;s on-chain credit API, has recorded over $100M in loans and served 5M+ users
        since 2017 — first proven at scale through Aella in Nigeria. That&apos;s nine years of
        evidence that on-chain credit works, not a hackathon claim.
      </p>
      <p>
        Credal is institutional and permissioned — an API integrators apply for, not a contract an
        arbitrary dApp can query. The roadmap item that would make it composable with other
        contracts, &quot;Loan Flow on Creditcoin EVM,&quot; hasn&apos;t shipped. Hana doesn&apos;t
        integrate with Credal, isn&apos;t partnered with Gluwa, and claims no endorsement —{" "}
        <code>CreditRegistry</code> is a separate, permissionless, EVM-native primitive: any
        contract can call <code>getCreditLimit</code> today, no application, no approval.
        Institutional rails and permissionless rails, same chain, same thesis, proving it from
        opposite ends.
      </p>

      <h2>Where to go from here</h2>
      <ul>
        <li>
          <Link href="/integrate">Build on Hana</Link> — the <code>ICreditRegistry</code>{" "}
          interface, a copy-pasteable integration snippet, and the deployed address to point it
          at.
        </li>
        <li>
          <Link href="/architecture">Architecture</Link> — how the pieces fit together, including
          both reference apps reading the one registry, and the cross-chain import flow end to
          end.
        </li>
        <li>
          <Link href="/attestcoin">Attestcoin write-up</Link> — proof generation, the
          <code> 0x0FD2</code> precompile, the four security checks that gate every import (each
          linked to its committed negative test), and the real measured latency behind the
          onboarding UX.
        </li>
        <li>
          <Link href="/addresses">Deployed addresses</Link> — every contract on both chains,
          verified, pulled live from the same address book the code itself uses.
        </li>
      </ul>

      <h2>Status</h2>
      <p>
        Every phase of the build — contracts, the cross-chain worker, the merchant API and
        portal, the checkout hub (including the SPACE credit line), the demo store, the lender
        interface — is deployed and has been verified against the real Sepolia + CC3 testnets, not
        a local chain, not a mock. See this repository&apos;s root <code>README.md</code> for the
        full status table and the specific transactions behind each claim.
      </p>

      <h2>Hackathon</h2>
      <p>Built for BUIDL CTC 2026 Fall (DoraHacks) — Track: DeFi.</p>
    </Prose>
  );
}
