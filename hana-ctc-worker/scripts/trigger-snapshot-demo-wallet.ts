import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { contracts as sepoliaContracts } from "@hana/shared/src/generated/sepolia";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

/**
 * Pre-warms a demo wallet's cross-chain import for a recording session: fires a real
 * `snapshot()` on the "excellent" or "thin" seeded demo wallet (hana-ctc-attestor/.demo-wallets.json)
 * against the live HanaCreditAttestor, so a worker watching it can complete the ~9-minute
 * attestation wait *before* recording starts rather than during it.
 *
 * Usage: WHICH=excellent tsx scripts/trigger-snapshot-demo-wallet.ts   (or WHICH=thin)
 */
async function main() {
  const which = process.env.WHICH === "thin" ? "thin" : "excellent";
  const walletsPath = path.resolve(__dirname, "..", "..", "hana-ctc-attestor", ".demo-wallets.json");
  const wallets = JSON.parse(fs.readFileSync(walletsPath, "utf8"));
  const pk = wallets[which]?.privateKey;
  if (!pk) throw new Error(`No "${which}" entry in ${walletsPath}`);

  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);
  const meta = (sepoliaContracts as any).HanaCreditAttestor;
  const attestor = new ethers.Contract(meta.address, meta.abi, wallet);

  console.log(`Pre-warming "${which}" wallet (${wallet.address}): calling snapshot() on ${meta.address}...`);
  const tx = await attestor.snapshot();
  console.log(`  tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  const block = await provider.getBlock(receipt!.blockNumber);
  console.log(
    `  mined in block ${receipt!.blockNumber} at ${new Date(block!.timestamp * 1000).toISOString()}`
  );
  console.log(
    `\nA worker watching this address will pick this up and complete the import in ~9 minutes.\n` +
      `Leave the worker running (pnpm worker:dev / pnpm start) and check ` +
      `http://localhost:8787/status/${wallet.address} — once it shows "CONFIRMED", this wallet's ` +
      `score is live on the current CreditRegistry and ready to record against.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
