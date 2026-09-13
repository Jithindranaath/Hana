export interface ContractEntry {
  address: string;
  abi: readonly unknown[];
}

export type ContractName =
  | "IUSDC"
  | "CreditRegistry"
  | "LendingPool"
  | "SettlementVault"
  | "LoanManager"
  | "CreditImporterASC"
  | "HanaCreditAttestor";

export interface AddressBook {
  chainId: number;
  contracts: Partial<Record<ContractName, ContractEntry>>;
}

export enum LoanType {
  INSTALLMENT = 0,
  REVOLVING = 1,
  TERM = 2,
  OVERCOLLATERALIZED = 3,
}

export enum LoanStatus {
  ACTIVE = 0,
  COMPLETED = 1,
  DEFAULTED = 2,
  LIQUIDATED = 3,
}

export enum ReleaseType {
  IMMEDIATE = 0,
  TIMELOCK = 1,
  CONDITIONAL = 2,
}

export interface CreditProfile {
  compositeScore: number;
  repaymentScore: number;
  volumeScore: number;
  tenureScore: number;
  hasImportedHistory: boolean;
  outstandingDebt: bigint;
}

/** Shape returned by the worker's `GET /status/:address` (see hana-ctc-worker). */
export interface ImportStatus {
  state: "SEEN" | "ATTEST_WAIT" | "PROOF_FETCH" | "SUBMIT" | "CONFIRMED" | "FAILED";
  subject: string;
  chainKey: number;
  snapshotNonce?: number;
  blockHeight?: number;
  txHash?: string;
  /** When this import job was first seen — lets a client compute elapsed time even after a page
   *  refresh, since the pending-onboarding UI must survive one (WORKFLOW.md 7.3 gotcha: the
   *  worker's status endpoint is the source of truth, not React state). */
  createdAt: string;
  updatedAt: string;
  error?: string;
}
