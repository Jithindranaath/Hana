import { Prose } from "@/components/Prose";

export default function AttestcoinPage() {
  return (
    <Prose>
      <h1>The Attestcoin write-up</h1>
      <p>
        Attestcoin lets a Creditcoin contract verify that a specific transaction happened on
        another chain — synchronously, in the same call, with no oracle operator, no bridge
        contract, and no multisig committee. Hana uses it for exactly one thing: proving a
        wallet&apos;s lending history from Ethereum Sepolia.
      </p>
      <p>
        Everything below was confirmed against the real, live precompile during this project&apos;s
        Phase 1 spike — not assumed from documentation. The original interface guess (a struct
        return carrying decoded receipt status and logs) was <strong>wrong on every field</strong>{" "}
        until it was actually run against the network.
      </p>

      <h2>The precompile only proves inclusion</h2>
      <p>
        The Native Query Verifier precompile lives at{" "}
        <code>0x0000000000000000000000000000000000000FD2</code>. Its real interface:
      </p>
      <pre>
        <code>{`interface INativeQueryVerifier {
    struct MerkleProofEntry { bytes32 hash; bool isLeft; }
    struct MerkleProof { bytes32 root; MerkleProofEntry[] siblings; }
    struct ContinuityProof { bytes32 lowerEndpointDigest; bytes32[] roots; }

    function verifyAndEmit(
        uint64 chainKey, uint64 height, bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof, ContinuityProof calldata continuityProof
    ) external returns (bool);

    function calculateTxIndex(MerkleProof calldata merkleProof) external view returns (uint64);
}`}</code>
      </pre>
      <p>
        Note what it does <em>not</em> return: no receipt status, no decoded logs — just a{" "}
        <code>bool</code>. Merkle inclusion and the continuity-of-headers proof are checked; the
        content of the proved transaction is the caller&apos;s job to decode, using{" "}
        <code>@gluwa/asc-contracts</code>&apos;s <code>EvmV1Decoder</code> library against the raw{" "}
        <code>encodedTransaction</code> bytes.
      </p>
      <p>
        A second, separate precompile at <code>0x0FD3</code> answers{" "}
        <code>getSupportedChains()</code> — confirmed live to return{" "}
        <code>chainKey 1 → chainId 11155111 (&quot;Sepolia ethereum&quot;)</code>, which is how
        Sepolia&apos;s chain key was locked in rather than assumed.
      </p>

      <h2>Proof generation</h2>
      <p>
        Off-chain, <code>@gluwa/usc-sdk</code>&apos;s <code>proofProvider.service.ProofBuilder</code>{" "}
        does the work: <code>waitUntilHeightAttested</code> blocks until the prover has attested
        and cached the source block, then <code>getProof(txHash)</code> returns the Merkle +
        continuity proof and the raw transaction bytes. Measured live, three times, independently,
        eight days apart: <strong>~9 minutes</strong> from a Sepolia transaction to an available
        proof — this number drives the worker&apos;s polling and the checkout onboarding
        UI&apos;s copy.
      </p>

      <h3>Re-checked against Creditcoin&apos;s USC v2 claim</h3>
      <p>
        Creditcoin&apos;s own USC v2 announcement states verification dropped from 6–20 minutes to
        under 15 seconds. If that held on CC3 Testnet, the async worker in this build would be
        unnecessary — a single synchronous call could import credit history live, on screen, while
        a judge watches. So rather than assume it, we re-measured directly against this exact
        deployment, with the full pipeline freshly instrumented (timestamps at snapshot emission,
        attestation confirmation, proof retrieval, and submission —{" "}
        <code>hana-ctc-worker/src/metrics.ts</code>):
      </p>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Method</th>
            <th>End-to-end</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>2026-09-05</td>
            <td><code>hello-bridge</code> tutorial (burn → mint)</td>
            <td>497s</td>
          </tr>
          <tr>
            <td>2026-09-05</td>
            <td>
              <code>Ping.sol</code> / <code>PingImporter.sol</code> (structurally identical to{" "}
              <code>CreditImporterASC</code>)
            </td>
            <td>532s</td>
          </tr>
          <tr>
            <td>2026-09-13</td>
            <td>
              The real, live <code>HanaCreditAttestor</code> →{" "}
              <code>CreditImporterASC</code> pipeline, instrumented end to end
            </td>
            <td>
              558.7s (attestation wait 546.4s, proof fetch 1.1s, submission 11.2s)
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Three real measurements, eight days apart, on the same live testnet infrastructure, cluster
        tightly around <strong>~9 minutes</strong> — attestation wait alone accounts for essentially
        all of it; proof fetch and submission are both single-digit seconds. USC v2&apos;s
        sub-15-second latency does not hold on CC3 Testnet as of this writing. We stopped at one
        fresh measurement rather than the ten a full distribution would call for: three consistent
        data points already rule out the &lt;30s threshold that would have justified a synchronous
        rewrite by two orders of magnitude, and each additional real run costs another ~9 minutes of
        wall-clock waiting for a conclusion that isn&apos;t in doubt. <strong>Decision: the async
        worker stays exactly as built.</strong> The checkout&apos;s &quot;Link your Ethereum
        history&quot; onboarding screen keeps its ~9-10 minute framing rather than a spinner.
      </p>

      <h2>The four checks</h2>
      <p>
        <code>CreditImporterASC.importFromQuery</code> runs four checks, in this exact order, each
        with a committed negative test in{" "}
        <code>hana-ctc-contracts/test/CreditImporterASC.t.ts</code>:
      </p>
      <ol>
        <li>
          <strong>Replay.</strong> The proof&apos;s position (<code>chainKey</code>,{" "}
          <code>blockHeight</code>, and a transaction index derived from{" "}
          <code>calculateTxIndex</code>) is hashed into a replay key and consumed{" "}
          <em>before</em> the mutating verify call. Test:{" "}
          <em>&quot;check 1 — rejects a replayed proof&quot;</em>.
        </li>
        <li>
          <strong>Receipt status.</strong> The precompile proves inclusion, not success —{" "}
          <code>EvmV1Decoder.decodeReceiptFields</code> is checked for{" "}
          <code>receiptStatus == 1</code>. Test:{" "}
          <em>&quot;check 2 — rejects a proof whose source transaction reverted&quot;</em>.
        </li>
        <li>
          <strong>Emitter.</strong> The decoded <code>CreditSnapshot</code> log&apos;s emitting
          address must match the registered attestor for that chain key — otherwise a lookalike
          contract could forge history. Test:{" "}
          <em>&quot;check 3 — rejects a snapshot log from an unregistered emitter&quot;</em>.
        </li>
        <li>
          <strong>Nonce.</strong> The snapshot&apos;s <code>snapshotNonce</code> must exceed the
          last imported nonce for that subject — no replaying an older, more favorable snapshot.
          Test: <em>&quot;check 4 — rejects a stale nonce&quot;</em>.
        </li>
      </ol>
      <p>
        Two more tests round out the suite: a positive control (a valid snapshot actually updates{" "}
        <code>CreditRegistry</code>) and a rejection of an unknown <code>chainKey</code> with no
        registered attestor. All in{" "}
        <code>hana-ctc-contracts/contracts/CreditImporterASC.sol</code>.
      </p>

      <h2>Why this shape, not the obvious one</h2>
      <p>
        <code>CreditImporterASC</code> deliberately does <em>not</em> inherit{" "}
        <code>@gluwa/asc-contracts</code>&apos;s <code>ASCBase</code> convenience base contract,
        even though it implements the same pattern. <code>ASCBase</code> hardcodes the precompile
        address as an immutable set in its constructor, which makes it harder to swap in a mock at
        an ordinary address for unit testing (it would need an EVM cheatcode to install a mock at
        the precompile&apos;s fixed address instead). Keeping <code>attestcoin</code> as a
        constructor-injected dependency kept the existing test harness working while staying
        byte-for-byte compatible with the real interface — confirmed by actually deploying against
        the live precompile, not just by type-checking against it.
      </p>
    </Prose>
  );
}
