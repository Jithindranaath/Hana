import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys the core protocol (iUSDC, CreditRegistry, LendingPool, SettlementVault, LoanManager),
 * wires them together, and seeds the pool. Idempotent: re-running reuses whatever is already
 * recorded in deployments/<network>.json instead of redeploying.
 *
 * The importer (`CreditImporterASC`) is deployed separately by scripts/deploy-importer.ts once the
 * Sepolia `HanaCreditAttestor` address and the confirmed Attestcoin precompile address are known
 * (see WORKFLOW.md Phase 1 and Phase 4).
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

async function deployIfNeeded(rec: DeploymentRecord, name: string, factoryName: string, args: any[]) {
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
  save(rec.network, rec);
  console.log(`+ ${name} deployed at ${address}`);
  return contract;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = network.name;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`Deploying to ${net} (chainId ${chainId}) as ${deployer.address}`);

  const rec = load(net);
  rec.chainId = chainId;

  const treasury = process.env.TREASURY_ADDRESS || deployer.address;

  const iusdc = await deployIfNeeded(rec, "IUSDC", "IUSDC", [deployer.address]);
  const registry = await deployIfNeeded(rec, "CreditRegistry", "CreditRegistry", [deployer.address]);
  const pool = await deployIfNeeded(rec, "LendingPool", "LendingPool", [
    await iusdc.getAddress(),
    deployer.address,
    treasury,
  ]);
  const vault = await deployIfNeeded(rec, "SettlementVault", "SettlementVault", [
    await iusdc.getAddress(),
    deployer.address,
  ]);
  const loanManager = await deployIfNeeded(rec, "LoanManager", "LoanManager", [
    await registry.getAddress(),
    await pool.getAddress(),
    await vault.getAddress(),
    await iusdc.getAddress(),
    deployer.address,
  ]);

  console.log("Wiring...");
  const lmAddr = await loanManager.getAddress();
  const poolAddr = await pool.getAddress();

  if ((await (registry as any).loanManager()) !== lmAddr) {
    const currentImporter = await (registry as any).importerASC();
    await (await (registry as any).setWiring(lmAddr, currentImporter, poolAddr)).wait();
    console.log("  registry.setWiring(loanManager, importerASC[unchanged], pool)");
  }
  if (!(await (registry as any).authorizedReporters(lmAddr))) {
    await (await (registry as any).setReporter(lmAddr, true)).wait();
    console.log("  registry.setReporter(loanManager, true)");
  }
  const iusdcAddr = await iusdc.getAddress();
  if ((await (registry as any).accountingAsset()) !== iusdcAddr) {
    await (await (registry as any).setAccountingAsset(iusdcAddr)).wait();
    console.log("  registry.setAccountingAsset(iUSDC) — iUSDC volume feeds the score's volume dimension");
  }
  if ((await (pool as any).loanManager()) !== lmAddr) {
    await (await (pool as any).setLoanManager(lmAddr)).wait();
    console.log("  pool.setLoanManager(loanManager)");
  }
  if ((await (vault as any).loanManager()) !== lmAddr) {
    await (await (vault as any).setLoanManager(lmAddr)).wait();
    console.log("  vault.setLoanManager(loanManager)");
  }

  // Seed the pool so the first real LP isn't exposed to empty-vault share-price manipulation.
  const seedAmount = ethers.parseUnits("50000", 6);
  const currentPoolBalance: bigint = await (iusdc as any).balanceOf(poolAddr);
  if (currentPoolBalance === 0n) {
    console.log("Seeding pool with 50,000 iUSDC from the deployer...");
    await (await (iusdc as any).mint(deployer.address, seedAmount)).wait();
    await (await (iusdc as any).approve(poolAddr, seedAmount)).wait();
    await (await (pool as any).deposit(seedAmount, deployer.address)).wait();
  }

  console.log("\nDone. Addresses:");
  for (const [name, info] of Object.entries(rec.contracts)) {
    console.log(`  ${name.padEnd(18)} ${info.address}`);
  }
  console.log(`\nWritten to deployments/${net}.json — run "pnpm export:abis" to publish to @hana/shared.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
