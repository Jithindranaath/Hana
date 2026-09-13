import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys reference app #2 — MockSPACE, MockSpaceStaking, SpaceCreditLine — and wires them to the
 * already-deployed CreditRegistry. Run after scripts/deploy.ts. Idempotent, same pattern as
 * scripts/deploy.ts and scripts/deploy-importer.ts.
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

  const registryAddr = rec.contracts["CreditRegistry"]?.address;
  if (!registryAddr) throw new Error("CreditRegistry not found in deployments — run scripts/deploy.ts first");
  const registry = await ethers.getContractAt("CreditRegistry", registryAddr);

  const space = await deployIfNeeded(rec, net, "MockSPACE", "MockSPACE", [deployer.address]);
  const spaceAddr = await space.getAddress();

  const staking = await deployIfNeeded(rec, net, "MockSpaceStaking", "MockSpaceStaking", [
    spaceAddr,
    deployer.address,
  ]);
  const stakingAddr = await staking.getAddress();

  const creditLine = await deployIfNeeded(rec, net, "SpaceCreditLine", "SpaceCreditLine", [
    registryAddr,
    spaceAddr,
    stakingAddr,
    deployer.address,
  ]);
  const creditLineAddr = await creditLine.getAddress();

  console.log("Wiring...");
  if ((await (staking as any).operator()) !== creditLineAddr) {
    await (await (staking as any).setOperator(creditLineAddr)).wait();
    console.log("  staking.setOperator(creditLine)");
  }
  if (!(await (registry as any).authorizedReporters(creditLineAddr))) {
    await (await (registry as any).setReporter(creditLineAddr, true)).wait();
    console.log("  registry.setReporter(creditLine, true)");
  }

  // SPACE is 18dp; the registry's default exposure cap is sized for 6dp iUSDC, so SPACE needs its
  // own asset config or every limit for it would clamp to a near-zero raw-unit amount.
  const spaceMaxLimit = ethers.parseUnits("5000", 18);
  const spaceExposureCap = ethers.parseUnits("10000", 18);
  const cfg = await (registry as any).assetConfigs(spaceAddr);
  if (!cfg.enabled) {
    await (await (registry as any).setAssetConfig(spaceAddr, true, spaceMaxLimit, spaceExposureCap)).wait();
    console.log("  registry.setAssetConfig(SPACE, enabled=true, maxLimit=5000, exposureCap=10000)");
  }

  // Seed: the credit line's own reserve (what it stakes on a draw) and the staking yield reserve —
  // same pattern as scripts/deploy.ts seeding LendingPool with iUSDC.
  const lineReserveTarget = ethers.parseUnits("200000", 18);
  const yieldReserveTarget = ethers.parseUnits("50000", 18);

  const lineBalance: bigint = await (space as any).balanceOf(creditLineAddr);
  if (lineBalance === 0n) {
    console.log(`Seeding SpaceCreditLine with ${ethers.formatUnits(lineReserveTarget, 18)} SPACE...`);
    await (await (space as any).mint(creditLineAddr, lineReserveTarget)).wait();
  }

  const yieldReserve: bigint = await (staking as any).yieldReserve();
  if (yieldReserve === 0n) {
    console.log(`Seeding MockSpaceStaking's yield reserve with ${ethers.formatUnits(yieldReserveTarget, 18)} SPACE...`);
    await (await (space as any).mint(deployer.address, yieldReserveTarget)).wait();
    await (await (space as any).approve(stakingAddr, yieldReserveTarget)).wait();
    await (await (staking as any).fundReserve(yieldReserveTarget)).wait();
  }

  console.log("\nDone. Addresses:");
  for (const name of ["MockSPACE", "MockSpaceStaking", "SpaceCreditLine"]) {
    console.log(`  ${name.padEnd(18)} ${rec.contracts[name].address}`);
  }
  console.log(`\nWritten to deployments/${net}.json — run "pnpm export:abis" to publish to @hana/shared.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
