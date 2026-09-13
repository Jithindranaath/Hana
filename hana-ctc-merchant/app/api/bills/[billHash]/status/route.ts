import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { BillDoc, BillStatus } from "@/lib/models";

const ALLOWED: BillStatus[] = ["originated", "settled"];

/**
 * Internal — called by the Checkout Hub (after a successful `originate`) or an on-chain indexer
 * (after a `SettlementVault.Claimed` event), not by the merchant themselves. Auth is a shared
 * internal token, not a merchant's own client secret — the checkout app never has that.
 */
export async function POST(req: NextRequest, { params }: { params: { billHash: string } }) {
  const token = req.headers.get("x-internal-token");
  if (!token || token !== process.env.MERCHANT_INTERNAL_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !ALLOWED.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of ${ALLOWED.join(", ")}` }, { status: 400 });
  }

  const db = await getDb();
  const bills = db.collection<BillDoc>("bills");
  const bill = await bills.findOne({ _id: params.billHash });
  if (!bill) {
    return NextResponse.json({ error: "bill not found" }, { status: 404 });
  }

  await bills.updateOne(
    { _id: params.billHash },
    { $set: { status: body.status as BillStatus, updatedAt: new Date().toISOString() } }
  );
  return NextResponse.json({ billHash: params.billHash, status: body.status });
}
