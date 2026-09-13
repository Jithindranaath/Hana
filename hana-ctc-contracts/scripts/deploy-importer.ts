import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys CreditImporterASC and wires it to the already-deployed CreditRegistry.
 * Requires ATTESTCOIN_PRECOMPILE (confirmed in WORKFLOW Phase 0.3) and, to fully activate imports,
 * HANA_CREDIT_ATTESTOR_ADDRESS + SOURCE_CHAIN_KEY (from the attestor deployment, WORKFLOW Phase 2.2).
 * Run after scripts/deploy.ts.
 */

const deploymentsDir = path.join(__dirname, "..", "deployments");
const file = (net: string) => path.join(deploymentsDir, `${net}.json`);

function load(net: string) {
  const p = file(net);
  if (!fs.existsSync(p)) throw new Error(`No deployments/${net}.json — run scripts/deploy.ts first`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function save(net: string, rec: any) {
  fs.writeFileSync(file(net), JSON.stringify(rec, null, 2) + "\n");
}

async function main() {
  const net = network.name;
  const rec = load(net);
  const [deployer] = await ethers.getSigners();

  const precompile =
    process.env.ATTESTCOIN_PRECOMPILE || "0x0000000000000000000000000000000000000FD2";
  const registryAddr = rec.contracts["CreditRegistry"]?.address;
  if (!registryAddr) throw new Error("CreditRegistry not found in deployments — run scripts/deploy.ts first");

  let importerAddr: string = rec.contracts["CreditImporterASC"]?.address;
  if (!importerAddr) {
    const Factory = await ethers.getContractFactory("CreditImporterASC");
    const importer = await Factory.deploy(precompile, registryAddr, deployer.address);
    const receipt = await importer.deploymentTransaction()?.wait();
    importerAddr = await importer.getAddress();
    rec.contracts["CreditImporterASC"] = {
      address: importerAddr,
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber,
      args: [precompile, registryAddr, deployer.address],
    };
    save(net, rec);
    console.log(`+ CreditImporterASC deployed at ${importerAddr} (precompile ${precompile})`);
  } else {
    console.log(`= CreditImporterASC already deployed at ${importerAddr}`);
  }

  const registry = await ethers.getContractAt("CreditRegistry", registryAddr);
  const currentLM = await (registry as any).loanManager();
  const currentPool = await (registry as any).lendingPool();
  if ((await (registry as any).importerASC()) !== importerAddr) {
    await (await (registry as any).setWiring(currentLM, importerAddr, currentPool)).wait();
    console.log("  registry.setWiring(loanManager[unchanged], importerASC, pool[unchanged])");
  }

  const attestorAddr = process.env.HANA_CREDIT_ATTESTOR_ADDRESS;
  const sourceChainKey = process.env.SOURCE_CHAIN_KEY;
  if (attestorAddr && sourceChainKey) {
    const importer = await ethers.getContractAt("CreditImporterASC", importerAddr);
    const key = BigInt(sourceChainKey);
    if ((await (importer as any).attestorOf(key)) !== attestorAddr) {
      await (await (importer as any).setAttestor(key, attestorAddr)).wait();
      console.log(`  importer.setAttestor(chainKey=${key}, ${attestorAddr})`);
    }
  } else {
    console.log(
      "  ⚠ HANA_CREDIT_ATTESTOR_ADDRESS / SOURCE_CHAIN_KEY not set — importer has no registered attestor yet."
    );
  }

  console.log(`\nDone. importer.setAttestor and registry wiring recorded in deployments/${net}.json.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
