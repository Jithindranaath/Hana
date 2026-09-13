import { Prose } from "@/components/Prose";
import { FlowDiagram } from "@/components/FlowDiagram";

export default function ArchitecturePage() {
  return (
    <Prose>
      <h1>Architecture</h1>
      <p>
        Two chains, one credit primitive. A wallet's lending history lives on Ethereum Sepolia; the
        credit it unlocks lives on Creditcoin CC3. Nothing in between is a bridge, an oracle
        committee, or a trusted relayer — the only thing carrying data across chains is a
        cryptographic proof, verified synchronously by a precompile.
      </p>

      <FlowDiagram />

      <h2>The cross-chain import, step by step</h2>
      <ol>
        <li>
          A wallet calls <code>HanaCreditAttestor.snapshot()</code> on Sepolia. This emits one
          aggregated <code>CreditSnapshot</code> event — not one event per historical transaction
          (the prover's batch proofs cap at 10 tx / 1000 blocks, so a full history is summarized,
          not replayed).
        </li>
        <li>
          The <strong>worker</strong> (<code>@hana/worker</code>) picks up the event, waits for
          the source block to be attested (measured live at <strong>~9 minutes</strong>), fetches
          the Merkle inclusion + continuity proof from the prover, and submits it to{" "}
          <code>CreditImporterASC</code> on CC3.
        </li>
        <li>
          <code>CreditImporterASC</code> verifies the proof against the real precompile at{" "}
          <code>0x0FD2</code>, decodes the proved transaction's receipt and logs itself (the
          precompile only proves inclusion — see <a href="/attestcoin">Attestcoin</a>), runs four
          checks, and writes the imported profile into <code>CreditRegistry</code>.
        </li>
        <li>
          <code>CreditRegistry</code> recomputes the wallet's composite score (imported history is
          always weighted below native activity) and its available credit limit —{" "}
          <code>getCreditLimit(address, asset)</code>, callable by any Creditcoin contract.
        </li>
        <li>
          <code>LoanManager</code> originates a loan against that limit (or against posted
          collateral, with no score check, via the <code>OVERCOLLATERALIZED</code> path), pulling
          liquidity from <code>LendingPool</code> and disbursing to <code>SettlementVault</code>{" "}
          for merchant purchases.
        </li>
      </ol>

      <h2>Cross-cutting design rules</h2>
      <ul>
        <li>
          <strong>Exactly two write paths into <code>CreditRegistry</code></strong>:{" "}
          <code>recordNativeActivity</code> (only <code>LoanManager</code>) and{" "}
          <code>importAttestedHistory</code> (only <code>CreditImporterASC</code>). The
          liquidity-provision score bonus is pull-based — it reads{" "}
          <code>lendingPool.maxWithdraw(user)</code> at score-recompute time — specifically so it
          isn&apos;t a third writer.
        </li>
        <li>
          <strong>Imported history is always weighted below native</strong> (
          <code>importWeightBps</code>, default 60%), enforced in the score model itself.
        </li>
        <li>
          <strong>Checkout never blocks on a live proof.</strong> It reads already-imported state;
          all attestation latency lives in the onboarding flow, and the worker&apos;s status
          endpoint — not client-side React state — is the source of truth for that flow (it
          survives a page refresh).
        </li>
        <li>
          <strong>Money is on-chain; metadata is in MongoDB</strong>, joined by <code>billHash</code>.
          The Merchant API and the Checkout Hub are separate services on purpose: a merchant&apos;s
          API credentials never reach the browser-facing checkout.
        </li>
      </ul>

      <p>
        Package-by-package detail (env vars, exact commands, the non-obvious bugs found while
        building each one) lives in each package&apos;s own <code>README.md</code> in the
        repository.
      </p>
    </Prose>
  );
}
