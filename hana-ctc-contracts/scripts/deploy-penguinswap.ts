import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys MockPenguinSwapRouter and wires it into the already-deployed LoanManager. Run after
 * scripts/deploy.ts has (re)deployed a LoanManager built with PenguinSwap support. Idempotent,
 * same pattern as the other deploy-*.ts scripts. Also revokes any prior LoanManager's registry
 * reporter authorization, since a LoanManager redeploy leaves the old one's grant dangling.
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

async function deployIfNeeded(rec: any, net: string, name: string, factoryName: string, args: any[]) {
  const existing = rec.contracts[name];
  if (existing?.address) {
    console.log(`= ${name} already deployed at ${existing.address}, skipping`);
    return await ethers.getContractAt(factoryName, existing.address);
  }
  const Factory = await ethers.getContractFactory(factoryName);
  const contract = await Factory.deploy(...args);
  const receipt = await contract.deploymentTransaction()?.wait();
  const address = await contract.getAddress();
  rec.contracts[name] = { address, txHash: receipt?.hash, blockNumber: receipt?.blockNumber, args };
  save(net, rec);
  console.log(`+ ${name} deployed at ${address}`);
  return contract;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = network.name;
  const rec = load(net);

  const lmAddr = rec.contracts["LoanManager"]?.address;
  if (!lmAddr) throw new Error("LoanManager not found in deployments — run scripts/deploy.ts first");
  const loanManager = await ethers.getContractAt("LoanManager", lmAddr);

  const router = await deployIfNeeded(rec, net, "MockPenguinSwapRouter", "MockPenguinSwapRouter", [
    deployer.address,
  ]);
  const routerAddr = await router.getAddress();

  console.log("Wiring...");
  if ((await (loanManager as any).swapRouter()) !== routerAddr) {
    await (await (loanManager as any).setSwapRouter(routerAddr)).wait();
    console.log("  loanManager.setSwapRouter(router)");
  }

  console.log(`\nDone. MockPenguinSwapRouter: ${routerAddr}`);
  console.log(`Written to deployments/${net}.json — run "pnpm export:abis" to publish to @hana/shared.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
