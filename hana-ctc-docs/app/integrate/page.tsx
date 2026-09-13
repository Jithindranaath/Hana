import Link from "next/link";
import { Prose } from "@/components/Prose";

export default function IntegratePage() {
  return (
    <Prose>
      <h1>Integrate</h1>
      <p>
        <code>CreditRegistry</code> is a public primitive. Any Creditcoin contract can read a
        wallet&apos;s credit limit — no partnership, no permission, no oracle subscription.
      </p>

      <h2>The one-liner</h2>
      <pre>
        <code>{`interface ICreditRegistry {
    function getCreditLimit(address user, address asset) external view returns (uint256);
}

// in your contract:
uint256 limit = ICreditRegistry(CREDIT_REGISTRY_ADDRESS).getCreditLimit(borrower, IUSDC_ADDRESS);
// limit is denominated in the asset's own units (iUSDC: 6 decimals) and already accounts for
// the borrower's outstanding debt — it's what's actually available to lend against right now.`}</code>
      </pre>
      <p>
        See <Link href="/addresses">Addresses</Link> for the current <code>CreditRegistry</code>{" "}
        address on CC3.
      </p>

      <h2>The full interface</h2>
      <pre>
        <code>{`interface ICreditRegistry {
    struct CreditProfile {
        uint16 compositeScore;   // 300..850
        uint16 repaymentScore;   // 0..1000
        uint16 volumeScore;      // 0..1000
        uint16 tenureScore;      // 0..1000
        uint64 nativeLoansCompleted;
        uint64 nativeOnTimePayments;
        uint64 nativeLatePayments;
        uint64 nativeDefaults;
        uint128 nativeCumulativeBorrowed;
        uint64 importedLoansCompleted;
        uint64 importedOnTimePayments;
        uint64 importedLatePayments;
        uint64 importedDefaults;
        uint128 importedCumulativeBorrowed;
        uint64 firstActivityTimestamp;
        uint64 importedFirstActivityTimestamp;
        uint64 lastImportNonce;
        uint64 lastUpdated;
        uint256 outstandingDebt;
        bool hasImportedHistory;
        bool bootstrapped;
    }

    function getProfile(address user) external view returns (CreditProfile memory);
    function getCreditLimit(address user, address asset) external view returns (uint256);
    function getAvailableCredit(address user, address asset) external view returns (uint256);
    function importNonceOf(uint64 chainKey, address subject) external view returns (uint64);
}`}</code>
      </pre>
      <p>
        The full ABI (auto-generated, always current) is at{" "}
        <code>packages/shared/src/generated/cc3.ts</code> in the repository —{" "}
        <code>contracts.CreditRegistry.abi</code>.
      </p>

      <h2>What you're trusting</h2>
      <p>
        Nothing beyond the Creditcoin state itself. <code>getCreditLimit</code> is a plain{" "}
        <code>view</code> call against on-chain state that was written by exactly two callers:{" "}
        <code>LoanManager</code> (native activity) and <code>CreditImporterASC</code> (verified
        cross-chain imports, gated by the four checks in the{" "}
        <Link href="/attestcoin">Attestcoin write-up</Link>). There is no oracle feed to trust and
        no off-chain committee that could censor or forge an update.
      </p>

      <h2>What you're not getting</h2>
      <p>
        <code>getCreditLimit</code> already subtracts the user&apos;s outstanding debt and applies
        the protocol&apos;s own exposure cap — it is not a raw score. If you need the underlying
        sub-scores or import status for your own risk logic, read{" "}
        <code>getProfile(user)</code> instead.
      </p>
    </Prose>
  );
}
