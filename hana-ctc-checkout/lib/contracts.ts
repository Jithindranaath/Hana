import { contracts as cc3Contracts } from "@hana/shared/src/generated/cc3";
import { contracts as sepoliaContracts } from "@hana/shared/src/generated/sepolia";

function require_<T>(value: T | undefined, name: string): T {
  if (!value) {
    throw new Error(`${name} missing from @hana/shared's generated address book — run "pnpm sync:abis"`);
  }
  return value;
}

// CC3 — the protocol chain everything except onboarding's Sepolia step runs on.
export const CreditRegistry = require_((cc3Contracts as any).CreditRegistry, "CreditRegistry");
export const LoanManager = require_((cc3Contracts as any).LoanManager, "LoanManager");
export const LendingPool = require_((cc3Contracts as any).LendingPool, "LendingPool");
export const IUSDC = require_((cc3Contracts as any).IUSDC, "IUSDC");
export const SettlementVault = require_((cc3Contracts as any).SettlementVault, "SettlementVault");

// Sepolia — only used by the "link your history" onboarding step (WORKFLOW.md 7.3).
export const HanaCreditAttestor = require_(
  (sepoliaContracts as any).HanaCreditAttestor,
  "HanaCreditAttestor"
);
