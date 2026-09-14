import * as fs from "fs";
import * as path from "path";
import { createPublicClient, createWalletClient, http, formatEther, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { cc3 } from "../lib/chains";

/**
 * Tops up the demo wallets with CC3 CTC for gas.
 *
 * `pnpm attestor:seed:sepolia` funds them on *Sepolia* (so they can send `snapshot()`), but the
 * autopilot also sends real CC3 transactions — originate, repay, draw a credit line — and a freshly
 * generated wallet has no CTC. Run this once after regenerating `.demo-wallets.json`.
 *
 *   pnpm --filter @hana/checkout demo:fund
 */
const TOPUP = parseEther(process.env.TOPUP_CTC ?? "50");

/**
 * The root .env declares every key but leaves the secrets blank — each package's own .env holds
 * the real value. Merge them, letting a package-level value win over an empty root placeholder.
 */
function loadEnv(): Record<string, string> {
  const root = path.resolve(__dirname, "..", "..");
  const files = [".env", "hana-ctc-worker/.env", "hana-ctc-attestor/.env"];
  const merged: Record<string, string> = {};
  for (const rel of files) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (!line.includes("=") || line.trim().startsWith("#")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim();
      if (value) merged[key] = value;
    }
  }
  return merged;
}

async function main() {
  const env = loadEnv();
  let pk = env.WORKER_SUBMITTER_PRIVATE_KEY || env.SEPOLIA_DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("No funder key in .env (WORKER_SUBMITTER_PRIVATE_KEY or SEPOLIA_DEPLOYER_PRIVATE_KEY)");
  if (!pk.startsWith("0x")) pk = `0x${pk}`;

  const funder = privateKeyToAccount(pk as `0x${string}`);
  const pub = createPublicClient({ chain: cc3, transport: http() });
  const wallet = createWalletClient({ account: funder, chain: cc3, transport: http() });

  const walletsPath = path.resolve(__dirname, "..", "..", "hana-ctc-attestor", ".demo-wallets.json");
  const wallets = JSON.parse(fs.readFileSync(walletsPath, "utf8"));

  console.log(`Funder ${funder.address}: ${formatEther(await pub.getBalance({ address: funder.address }))} CTC`);

  for (const label of ["excellent", "thin"] as const) {
    const address = wallets[label]?.address as `0x${string}` | undefined;
    if (!address) continue;
    const balance = await pub.getBalance({ address });
    if (balance >= TOPUP) {
      console.log(`  ${label} ${address} already has ${formatEther(balance)} CTC — skipping`);
      continue;
    }
    const hash = await wallet.sendTransaction({ to: address, value: TOPUP - balance });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`  ${label} ${address} -> ${formatEther(TOPUP)} CTC  (${hash})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
