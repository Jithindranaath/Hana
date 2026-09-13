import bcrypt from "bcryptjs";
import { getDb } from "./db";
import { MerchantDoc } from "./models";

export async function authenticateMerchant(
  clientId: string | null,
  clientSecret: string | null
): Promise<MerchantDoc | null> {
  if (!clientId || !clientSecret) return null;
  const db = await getDb();
  const merchant = await db.collection<MerchantDoc>("merchants").findOne({ _id: clientId });
  if (!merchant) return null;
  const ok = await bcrypt.compare(clientSecret, merchant.clientSecretHash);
  return ok ? merchant : null;
}
