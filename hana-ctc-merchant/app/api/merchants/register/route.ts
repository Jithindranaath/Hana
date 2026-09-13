import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { MerchantDoc } from "@/lib/models";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim() || typeof body.payoutAddress !== "string") {
    return NextResponse.json({ error: "name and payoutAddress are required" }, { status: 400 });
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(body.payoutAddress)) {
    return NextResponse.json({ error: "payoutAddress must be a 0x-prefixed 20-byte address" }, { status: 400 });
  }

  const clientId = `mch_${nanoid(16)}`;
  const clientSecret = nanoid(32);
  const clientSecretHash = await bcrypt.hash(clientSecret, 10);

  const doc: MerchantDoc = {
    _id: clientId,
    name: body.name.trim(),
    clientSecretHash,
    payoutAddress: body.payoutAddress,
    billCounter: 0,
    createdAt: new Date().toISOString(),
  };

  const db = await getDb();
  await db.collection<MerchantDoc>("merchants").insertOne(doc);

  // clientSecret is shown exactly once — only its hash is ever persisted.
  return NextResponse.json({
    clientId,
    clientSecret,
    name: doc.name,
    payoutAddress: doc.payoutAddress,
  });
}
