import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/** Verifies every recorded contract for the current network on its block explorer. */
async function main() {
  const net = network.name;
  const recPath = path.join(__dirname, "..", "deployments", `${net}.json`);
  const rec = JSON.parse(fs.readFileSync(recPath, "utf8"));

  for (const [name, info] of Object.entries<any>(rec.contracts)) {
    console.log(`Verifying ${name} at ${info.address}...`);
    try {
      await run("verify:verify", {
        address: info.address,
        constructorArguments: info.args ?? [],
      });
    } catch (err: any) {
      if (String(err.message || err).includes("Already Verified")) {
        console.log(`  already verified`);
      } else {
        console.error(`  FAILED: ${err.message || err}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
