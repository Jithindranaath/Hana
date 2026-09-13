import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { BillDoc } from "@/lib/models";

// Public read, fetched cross-origin directly from the browser (the Checkout Hub runs on a
// different port/origin) — needs CORS, unlike every other route here which is either
// same-merchant-origin (the portal) or server-to-server (checkout's API routes, worker).
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Public read — the Checkout Hub fetches a bill by hash with no auth (WORKFLOW.md 6.1). */
export async function GET(_req: NextRequest, { params }: { params: { billHash: string } }) {
  const db = await getDb();
  const bill = await db.collection<BillDoc>("bills").findOne({ _id: params.billHash });
  if (!bill) {
    return NextResponse.json({ error: "bill not found" }, { status: 404, headers: CORS_HEADERS });
  }
  return NextResponse.json(
    {
      billHash: bill._id,
      amount: bill.amount,
      currency: bill.currency,
      reference: bill.reference,
      items: bill.items,
      releaseType: bill.releaseType,
      status: bill.status,
      checkoutUrl: bill.checkoutUrl,
      merchant: { name: bill.merchantName, payoutAddress: bill.payoutAddress },
    },
    { headers: CORS_HEADERS }
  );
}
