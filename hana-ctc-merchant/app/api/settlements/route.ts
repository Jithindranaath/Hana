import { NextRequest, NextResponse } from "next/server";
import { authenticateMerchant } from "@/lib/auth";
import { getSettlementsForMerchant } from "@/lib/chain";

/** The authenticated merchant's on-chain settlement history, read live from SettlementVault. */
export async function GET(req: NextRequest) {
  const merchant = await authenticateMerchant(
    req.headers.get("x-client-id"),
    req.headers.get("x-client-secret")
  );
  if (!merchant) {
    return NextResponse.json({ error: "invalid client credentials" }, { status: 401 });
  }

  const settlements = await getSettlementsForMerchant(merchant.payoutAddress);
  return NextResponse.json(settlements);
}
