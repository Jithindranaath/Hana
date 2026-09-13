import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/** One-off: revoke a stale registry reporter grant. Usage: REVOKE_ADDRESS=0x... hardhat run scripts/revoke-reporter.ts --network cc3 */
async function main() {
  const addr = process.env.REVOKE_ADDRESS;
  if (!addr || !addr.startsWith("0x")) throw new Error("Set REVOKE_ADDRESS=0x... in the environment");

  const net = network.name;
  const rec = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${net}.json`), "utf8"));
  const registry = await ethers.getContractAt("CreditRegistry", rec.contracts.CreditRegistry.address);

  const before = await (registry as any).authorizedReporters(addr);
  console.log(`authorizedReporters(${addr}) = ${before}`);
  if (before) {
    await (await (registry as any).setReporter(addr, false)).wait();
    console.log(`  revoked. authorizedReporters(${addr}) = ${await (registry as any).authorizedReporters(addr)}`);
  } else {
    console.log("  already not authorized, nothing to do");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
