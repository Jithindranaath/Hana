import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Live smoke test for reference app #2, run against deployments/<network>.json.
 * Bootstraps the deployer's own registry profile above the floor score by temporarily granting the
 * deployer itself reporter status (revoked again at the end) — avoids waiting out a real ~9-minute
 * Sepolia->CC3 cross-chain import just to get a nonzero credit limit to smoke-test against.
 */
async function main() {
  const net = network.name;
  const recPath = path.join(__dirname, "..", "deployments", `${net}.json`);
  if (!fs.existsSync(recPath)) throw new Error(`No deployments/${net}.json`);
  const rec = JSON.parse(fs.readFileSync(recPath, "utf8"));

  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt("CreditRegistry", rec.contracts.CreditRegistry.address);
  const space = await ethers.getContractAt("MockSPACE", rec.contracts.MockSPACE.address);
  const staking = await ethers.getContractAt("MockSpaceStaking", rec.contracts.MockSpaceStaking.address);
  const creditLine = await ethers.getContractAt("SpaceCreditLine", rec.contracts.SpaceCreditLine.address);

  console.log(`SpaceCreditLine smoke test on ${net} as ${signer.address}`);

  console.log("0. faucet() on MockSPACE (proves the faucet works; unrelated to the draw itself)...");
  await (await (space as any).faucet()).wait();

  console.log("1. temporarily authorizing self as a registry reporter to bootstrap a score...");
  await (await (registry as any).setReporter(signer.address, true)).wait();
  const bootstrapAmount = ethers.parseUnits("2000000", 6); // pushes volumeSubscore to its max tier
  await (await (registry as any).recordNativeActivity(0 /* LOAN_ORIGINATED */, signer.address, bootstrapAmount)).wait();
  await (await (registry as any).recordNativeActivity(1 /* PAYMENT_ON_TIME */, signer.address, 0)).wait();
  await (await (registry as any).recordNativeActivity(5 /* DEBT_REPAID */, signer.address, bootstrapAmount)).wait(); // zero the synthetic debt back out

  const spaceAddr = await space.getAddress();
  const limit = await (registry as any).getCreditLimit(signer.address, spaceAddr);
  console.log(`   composite score now ${(await (registry as any).getProfile(signer.address)).compositeScore}, SPACE credit limit = ${ethers.formatUnits(limit, 18)}`);
  if (limit === 0n) throw new Error("bootstrap didn't produce a usable limit");

  const drawAmount = ethers.parseUnits("10", 18);
  console.log(`2. openLine(${ethers.formatUnits(drawAmount, 18)} SPACE)...`);
  const openTx = await (creditLine as any).openLine(drawAmount);
  await openTx.wait();
  console.log(`   opened, tx ${openTx.hash}`);

  const before = await (creditLine as any).getPosition(signer.address);
  console.log(`   principal=${ethers.formatUnits(before.principal, 18)} staked=${ethers.formatUnits(before.stakedPrincipal, 18)}`);

  console.log("3. waiting for staking yield to accrue on live CC3 blocks (up to 120s)...");
  let pending = 0n;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    pending = await (staking as any).pendingYield(signer.address);
    if (pending > 0n) break;
    await new Promise((r) => setTimeout(r, 5_000));
  }
  console.log(`   pendingYield = ${ethers.formatUnits(pending, 18)} SPACE`);
  if (pending === 0n) throw new Error("no yield accrued within the wait window — CC3 block time slower than expected");

  console.log("4. repayFromYield()...");
  const repayTx = await (creditLine as any).repayFromYield();
  await repayTx.wait();
  console.log(`   repaid, tx ${repayTx.hash}`);

  const after = await (creditLine as any).getPosition(signer.address);
  console.log(`   principal after = ${ethers.formatUnits(after.principal, 18)} (was ${ethers.formatUnits(before.principal, 18)})`);

  console.log("5. revoking the temporary self-reporter grant...");
  await (await (registry as any).setReporter(signer.address, false)).wait();

  const ok = after.principal < before.principal;
  console.log(ok ? "SMOKE TEST PASSED" : "SMOKE TEST FAILED");
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
