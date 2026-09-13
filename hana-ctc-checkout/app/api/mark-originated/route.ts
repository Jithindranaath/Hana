import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy to the Merchant API's `POST /api/bills/:billHash/status`. That endpoint is
 * gated by `MERCHANT_INTERNAL_TOKEN` — a server-to-server secret the browser must never hold
 * (unlike a merchant's own client secret, nothing in the checkout UI is scoped to one merchant).
 * This route holds the token server-side and the client calls this same-origin route instead.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.billHash !== "string") {
    return NextResponse.json({ error: "billHash is required" }, { status: 400 });
  }

  const merchantApiUrl = process.env.NEXT_PUBLIC_MERCHANT_API_URL ?? "http://localhost:3002";
  const token = process.env.MERCHANT_INTERNAL_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "MERCHANT_INTERNAL_TOKEN not configured" }, { status: 500 });
  }

  const res = await fetch(`${merchantApiUrl}/api/bills/${body.billHash}/status`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": token },
    body: JSON.stringify({ status: "originated" }),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
