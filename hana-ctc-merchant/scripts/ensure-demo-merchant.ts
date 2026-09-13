import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import bcrypt from "bcryptjs";
import { MongoClient } from "mongodb";
import { MerchantDoc } from "../lib/models";

dotenv.config(); // this package's own .env (merchant dev server also loads this via Next)
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env"), override: false }); // root fallback

/**
 * Recording-session pre-flight: makes sure a merchant matching the demo store's ALREADY-configured
 * `MERCHANT_CLIENT_ID`/`MERCHANT_CLIENT_SECRET` (hana-ctc-store/.env) actually exists in whatever
 * MongoDB `MONGODB_URI` currently points at. Neither app's env needs to change and neither needs
 * restarting — this just makes the pre-existing credentials real again, which matters because
 * `pnpm db:memory` hands out a fresh random port (and an empty database) every time it's started.
 *
 * Run this once per fresh `pnpm db:memory` instance, before recording, after `pnpm merchant:dev`
 * is up and pointed at that instance's URI.
 */
async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set — point hana-ctc-merchant/.env at a running mongod first");

  const storeEnvPath = path.resolve(__dirname, "..", "..", "hana-ctc-store", ".env");
  const storeEnv = dotenv.parse(fs.readFileSync(storeEnvPath, "utf8"));
  const clientId = storeEnv.MERCHANT_CLIENT_ID;
  const clientSecret = storeEnv.MERCHANT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(`MERCHANT_CLIENT_ID/SECRET missing from ${storeEnvPath}`);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const merchants = db.collection<MerchantDoc>("merchants");

  const existing = await merchants.findOne({ _id: clientId });
  if (existing) {
    console.log(`Merchant ${clientId} ("${existing.name}") already exists in ${uri} — nothing to do.`);
    await client.close();
    return;
  }

  const payoutAddress =
    process.env.CC3_DEPLOYER_ADDRESS || "0xccEF39b7e2081b9c814DBbf0e51D450DdaBB64a2"; // project deployer, always valid

  const clientSecretHash = await bcrypt.hash(clientSecret, 10);
  const doc: MerchantDoc = {
    _id: clientId,
    name: "Hana Demo Store",
    clientSecretHash,
    payoutAddress,
    billCounter: 0,
    createdAt: new Date().toISOString(),
  };
  await merchants.insertOne(doc);
  console.log(`Provisioned merchant ${clientId} ("${doc.name}") in ${uri}.`);
  console.log("hana-ctc-store's existing MERCHANT_CLIENT_ID/SECRET will now authenticate against it.");
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
