import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Zero-setup local MongoDB for dev — no Docker, no external account. Mirrors
 * `hana-ctc-contracts`'s `pnpm node` (a separate long-running local-infra process): start this in
 * its own terminal, copy the printed URI into `.env` as `MONGODB_URI`, then `pnpm dev`.
 *
 * Data is in-memory only — fine for a hackathon demo, not for anything you need to keep. Point
 * `MONGODB_URI` at a real MongoDB (Atlas, self-hosted, etc.) for anything that must persist.
 */
async function main() {
  const mongod = await MongoMemoryServer.create({ instance: { dbName: "hana_ctc" } });
  const uri = mongod.getUri();

  console.log("\nIn-memory MongoDB is running.");
  console.log(`MONGODB_URI=${uri}`);
  console.log("\nCopy that into hana-ctc-merchant/.env, then run \"pnpm dev\" in another terminal.");
  console.log("Leave this process running — Ctrl+C stops it (and discards all data).\n");

  const shutdown = async () => {
    await mongod.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
