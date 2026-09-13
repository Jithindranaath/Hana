import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys HanaCreditAttestor. Idempotent: re-running reuses whatever is already recorded in
 * deployments/<network>.json instead of redeploying.
 */

interface DeploymentRecord {
  network: string;
  chainId: number;
  contracts: Record<string, { address: string; txHash?: string; blockNumber?: number; args?: any[] }>;
}

const deploymentsDir = path.join(__dirname, "..", "deployments");
const file = (net: string) => path.join(deploymentsDir, `${net}.json`);

function load(net: string): DeploymentRecord {
  const p = file(net);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  return { network: net, chainId: 0, contracts: {} };
}

function save(net: string, rec: DeploymentRecord) {
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(file(net), JSON.stringify(rec, null, 2) + "\n");
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = network.name;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`Deploying to ${net} (chainId ${chainId}) as ${deployer.address}`);

  const rec = load(net);
  rec.chainId = chainId;

  const existing = rec.contracts["HanaCreditAttestor"];
  if (existing?.address) {
    console.log(`= HanaCreditAttestor already deployed at ${existing.address}, skipping`);
  } else {
    const args = [deployer.address];
    const Factory = await ethers.getContractFactory("HanaCreditAttestor");
    const contract = await Factory.deploy(...args);
    const receipt = await contract.deploymentTransaction()?.wait();
    const address = await contract.getAddress();
    rec.contracts["HanaCreditAttestor"] = {
      address,
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber,
      args,
    };
    save(rec.network, rec);
    console.log(`+ HanaCreditAttestor deployed at ${address}`);
  }

  console.log(`\nWritten to deployments/${net}.json.`);
  console.log(`Next: "pnpm verify:sepolia" (if on Sepolia), then "pnpm export:abis".`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
