import Link from "next/link";
import { contracts as cc3Contracts } from "@hana/shared/src/generated/cc3";
import { Prose } from "@/components/Prose";

export default function IntegratePage() {
  const registryAddress = (cc3Contracts as any).CreditRegistry?.address as string | undefined;

  return (
    <Prose>
      <h1>Build on Hana</h1>
      <p>
        <code>CreditRegistry</code> is a public primitive. Any Creditcoin contract can read a
        wallet&apos;s credit limit — no partnership, no permission, no oracle subscription. Two
        reference applications (a BNPL checkout and a DePIN node-operator credit line) already
        read it through exactly this interface; a third contract is the same three lines of code.
      </p>

      {registryAddress && (
        <p>
          <strong>CreditRegistry on CC3 Testnet:</strong>{" "}
          <a
            href={`https://creditcoin-testnet.blockscout.com/address/${registryAddress}#code`}
            target="_blank"
            rel="noreferrer"
          >
            <code>{registryAddress}</code>
          </a>
        </p>
      )}

      <h2>The one-liner</h2>
      <pre>
        <code>{`interface ICreditRegistry {
    function getCreditLimit(address user, address asset) external view returns (uint256);
    function getAvailableCredit(address user, address asset) external view returns (uint256);
}

// in your contract:
uint256 limit = ICreditRegistry(CREDIT_REGISTRY_ADDRESS).getCreditLimit(borrower, IUSDC_ADDRESS);
// limit is denominated in the asset's own units (iUSDC: 6 decimals) — the borrower's GROSS
// score-derived limit, not netted against anything they already owe.

uint256 available = ICreditRegistry(CREDIT_REGISTRY_ADDRESS).getAvailableCredit(borrower, IUSDC_ADDRESS);
// available = limit minus outstanding debt IN THAT SAME ASSET — this is what's actually safe to
// lend against right now. Debt is tracked per-asset, so activity in a different asset (another
// consumer application entirely) never affects this number.`}</code>
      </pre>
      <p>
        See <Link href="/addresses">Addresses</Link> for every deployed contract on both chains,
        including the two reference applications above.
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
        bool hasImportedHistory;
        bool bootstrapped;
    }

    // Outstanding debt lives outside the struct, keyed per-asset — assetDebt(user, asset) — so two
    // consumer applications using different assets (e.g. iUSDC and SPACE) never share exposure.
    function assetDebt(address user, address asset) external view returns (uint256);

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
        <code>view</code> call against on-chain state written by two kinds of caller:{" "}
        <code>CreditImporterASC</code> (verified cross-chain imports, gated by the four checks in
        the <Link href="/attestcoin">Attestcoin write-up</Link>) and an owner-managed allowlist of{" "}
        <code>authorizedReporters</code> — currently <code>LoanManager</code> and{" "}
        <code>SpaceCreditLine</code>, with room for more. Any number of consumer applications can
        report native activity through that same allowlist without touching each other&apos;s
        code; there is no oracle feed to trust and no off-chain committee that could censor or
        forge an update.
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
