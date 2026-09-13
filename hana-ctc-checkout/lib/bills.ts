export interface BillItem {
  name: string;
  quantity: number;
  unitAmount: string;
}

export interface Bill {
  billHash: string;
  amount: string;
  currency: string;
  reference: string;
  items: BillItem[];
  releaseType: "IMMEDIATE" | "TIMELOCK" | "CONDITIONAL";
  status: "created" | "originated" | "settled";
  checkoutUrl: string;
  merchant: { name: string; payoutAddress: string };
}

const MERCHANT_API_URL = process.env.NEXT_PUBLIC_MERCHANT_API_URL ?? "http://localhost:3002";

export async function fetchBill(billHash: string): Promise<Bill | null> {
  const res = await fetch(`${MERCHANT_API_URL}/api/bills/${billHash}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Notifies the merchant the on-chain loan already succeeded. Returns whether it worked instead of
 * throwing — by the time this is called, real funds have already moved on-chain (the source of
 * truth), so a failure here must never make the checkout flow look like the purchase failed. The
 * caller surfaces a distinct, non-blocking warning when this comes back false.
 */
export async function markBillOriginated(billHash: string): Promise<boolean> {
  try {
    const res = await fetch("/api/mark-originated", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ billHash }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
