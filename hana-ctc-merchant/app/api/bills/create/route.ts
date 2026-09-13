import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "ethers";
import { getDb } from "@/lib/db";
import { authenticateMerchant } from "@/lib/auth";
import { computeBillHash } from "@/lib/billHash";
import { BillDoc, MerchantDoc, ReleaseType } from "@/lib/models";

const RELEASE_TYPES: ReleaseType[] = ["IMMEDIATE", "TIMELOCK", "CONDITIONAL"];

export async function POST(req: NextRequest) {
  const merchant = await authenticateMerchant(
    req.headers.get("x-client-id"),
    req.headers.get("x-client-secret")
  );
  if (!merchant) {
    return NextResponse.json({ error: "invalid client credentials" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const amountOk = body && (typeof body.amount === "number" || typeof body.amount === "string") && Number(body.amount) > 0;
  if (!body || !amountOk || typeof body.reference !== "string" || !Array.isArray(body.items)) {
    return NextResponse.json(
      { error: "amount (>0), reference, and items[] are required" },
      { status: 400 }
    );
  }

  const releaseType: ReleaseType = RELEASE_TYPES.includes(body.releaseType) ? body.releaseType : "IMMEDIATE";

  let amountUnits: bigint;
  try {
    amountUnits = parseUnits(String(body.amount), 6); // iUSDC, 6dp
  } catch {
    return NextResponse.json({ error: "amount is not a valid decimal number" }, { status: 400 });
  }

  const db = await getDb();
  const merchantsCol = db.collection<MerchantDoc>("merchants");
  const updated = await merchantsCol.findOneAndUpdate(
    { _id: merchant._id },
    { $inc: { billCounter: 1 } },
    { returnDocument: "after" }
  );
  const nonce = updated?.billCounter ?? merchant.billCounter + 1;

  const billHash = computeBillHash(merchant._id, body.reference, amountUnits, nonce);
  const checkoutBaseUrl = process.env.CHECKOUT_BASE_URL ?? "http://localhost:3001";
  const now = new Date().toISOString();

  const bill: BillDoc = {
    _id: billHash,
    clientId: merchant._id,
    merchantName: merchant.name,
    payoutAddress: merchant.payoutAddress,
    amount: String(body.amount),
    currency: "iUSDC",
    reference: body.reference,
    items: body.items,
    releaseType,
    status: "created",
    checkoutUrl: `${checkoutBaseUrl}/pay/${billHash}`,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection<BillDoc>("bills").insertOne(bill);

  return NextResponse.json({
    billHash,
    checkoutUrl: bill.checkoutUrl,
    amount: bill.amount,
    merchant: { name: merchant.name, payoutAddress: merchant.payoutAddress },
  });
}
