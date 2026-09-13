import { NextRequest, NextResponse } from "next/server";
import { PRODUCTS } from "@/lib/products";

/**
 * Server-side only: this store's own Merchant API credentials never reach the browser. Takes the
 * client's cart (product IDs + quantities), recomputes the total server-side from the product
 * catalog (never trust a client-supplied price), and creates the bill.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "cart is empty" }, { status: 400 });
  }

  const items = body.lines
    .map((line: { productId: string; quantity: number }) => {
      const product = PRODUCTS.find((p) => p.id === line.productId);
      if (!product || !line.quantity || line.quantity <= 0) return null;
      return { name: product.name, quantity: line.quantity, unitAmount: product.price.toFixed(2) };
    })
    .filter(Boolean) as { name: string; quantity: number; unitAmount: string }[];

  if (items.length === 0) {
    return NextResponse.json({ error: "no valid items in cart" }, { status: 400 });
  }

  const amount = items.reduce((sum, i) => sum + Number(i.unitAmount) * i.quantity, 0);

  const merchantApiUrl = process.env.MERCHANT_API_URL ?? "http://localhost:3002";
  const clientId = process.env.MERCHANT_CLIENT_ID;
  const clientSecret = process.env.MERCHANT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "store is not configured with a merchant account (MERCHANT_CLIENT_ID/SECRET)" },
      { status: 500 }
    );
  }

  const res = await fetch(`${merchantApiUrl}/api/bills/create`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
    },
    body: JSON.stringify({
      amount: amount.toFixed(2),
      reference: `store-order-${Date.now()}`,
      items,
      releaseType: "IMMEDIATE",
    }),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
