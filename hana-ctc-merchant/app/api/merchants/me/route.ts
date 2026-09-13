import { NextRequest, NextResponse } from "next/server";
import { authenticateMerchant } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const merchant = await authenticateMerchant(
    req.headers.get("x-client-id"),
    req.headers.get("x-client-secret")
  );
  if (!merchant) {
    return NextResponse.json({ error: "invalid client credentials" }, { status: 401 });
  }
  return NextResponse.json({
    clientId: merchant._id,
    name: merchant.name,
    payoutAddress: merchant.payoutAddress,
    createdAt: merchant.createdAt,
  });
}
