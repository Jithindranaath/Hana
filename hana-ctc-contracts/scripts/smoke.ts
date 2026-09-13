import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * WORKFLOW 3.7 acceptance check: faucet -> deposit -> originate a small overcollateralized loan -> repay,
 * run against a live network using the addresses in deployments/<network>.json.
 */
async function main() {
  const net = network.name;
  const recPath = path.join(__dirname, "..", "deployments", `${net}.json`);
  if (!fs.existsSync(recPath)) throw new Error(`No deployments/${net}.json`);
  const rec = JSON.parse(fs.readFileSync(recPath, "utf8"));

  const [signer] = await ethers.getSigners();
  const iusdc = await ethers.getContractAt("IUSDC", rec.contracts.IUSDC.address);
  const loanManager = await ethers.getContractAt("LoanManager", rec.contracts.LoanManager.address);

  console.log(`Smoke test on ${net} as ${signer.address}`);

  console.log("1. faucet()...");
  await (await (iusdc as any).faucet()).wait();
  const bal = await (iusdc as any).balanceOf(signer.address);
  console.log(`   balance = ${ethers.formatUnits(bal, 6)} iUSDC`);

  const principal = ethers.parseUnits("100", 6);
  const collateral = ethers.parseUnits("160", 6);
  console.log("2. approve + originate OVERCOLLATERALIZED loan...");
  await (await (iusdc as any).approve(rec.contracts.LoanManager.address, ethers.MaxUint256)).wait();
  const tx = await (loanManager as any).originate({
    loanType: 3, // OVERCOLLATERALIZED
    principal,
    installmentCount: 0,
    termDays: 7,
    billHash: ethers.ZeroHash,
    merchant: ethers.ZeroAddress,
    releaseType: 0,
    releaseTime: 0,
    collateralAsset: rec.contracts.IUSDC.address,
    collateralAmount: collateral,
  });
  await tx.wait();
  console.log(`   originated, tx ${tx.hash}`);

  const loanId = await (loanManager as any).nextLoanId();
  const thisLoanId = loanId - 1n;
  const [p, i] = await (loanManager as any).amountDue(thisLoanId);
  console.log(`3. repay ${ethers.formatUnits(p + i, 6)} iUSDC...`);
  await (await (loanManager as any).makePayment(thisLoanId, p + i + ethers.parseUnits("1", 6))).wait();

  const loan = await (loanManager as any).getLoan(thisLoanId);
  console.log(`   loan status = ${loan.status} (1 = COMPLETED)`);
  console.log(loan.status === 1n ? "SMOKE TEST PASSED" : "SMOKE TEST FAILED");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
