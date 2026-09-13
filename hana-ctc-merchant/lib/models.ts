export interface MerchantDoc {
  _id: string; // clientId
  name: string;
  clientSecretHash: string;
  payoutAddress: string;
  billCounter: number;
  createdAt: string;
}

export type ReleaseType = "IMMEDIATE" | "TIMELOCK" | "CONDITIONAL";
export type BillStatus = "created" | "originated" | "settled";

export interface BillItem {
  name: string;
  quantity: number;
  unitAmount: string;
}

export interface BillDoc {
  _id: string; // billHash (0x-prefixed hex) — money lives on-chain, this is metadata only
  clientId: string;
  merchantName: string;
  payoutAddress: string;
  amount: string; // decimal string, iUSDC units (6dp)
  currency: "iUSDC";
  reference: string;
  items: BillItem[];
  releaseType: ReleaseType;
  status: BillStatus;
  checkoutUrl: string;
  createdAt: string;
  updatedAt: string;
}
