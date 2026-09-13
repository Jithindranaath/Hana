import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { authenticateMerchant } from "@/lib/auth";
import { BillDoc } from "@/lib/models";

/** List the authenticated merchant's own bills, newest first — powers the portal's bill list. */
export async function GET(req: NextRequest) {
  const merchant = await authenticateMerchant(
    req.headers.get("x-client-id"),
    req.headers.get("x-client-secret")
  );
  if (!merchant) {
    return NextResponse.json({ error: "invalid client credentials" }, { status: 401 });
  }

  const db = await getDb();
  const bills = await db
    .collection<BillDoc>("bills")
    .find({ clientId: merchant._id })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  return NextResponse.json(
    bills.map((b) => ({
      billHash: b._id,
      amount: b.amount,
      currency: b.currency,
      reference: b.reference,
      items: b.items,
      releaseType: b.releaseType,
      status: b.status,
      checkoutUrl: b.checkoutUrl,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }))
  );
}
