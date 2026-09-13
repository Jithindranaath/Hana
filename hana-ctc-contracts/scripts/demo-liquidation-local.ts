import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * Screen-recordable PenguinSwap liquidation demo. Deploys the full protocol fresh to whatever
 * network it's pointed at (intended for `--network localhost` against a persistent `pnpm node`,
 * so the transactions are real and inspectable, just not on the public CC3 testnet — a genuinely
 * fresh liquidation there can't be ready sooner than ~24h out, see hana-ctc-pivot.md §5).
 *
 * Run: pnpm node                                          (separate terminal, leave running)
 *      pnpm demo:liquidation:local                          (this script)
 */

function log(step: string, msg = "") {
  console.log(`\n${step}${msg ? "  " + msg : ""}`);
}

async function main() {
  const [deployer, treasury, borrower, keeper, lp] = await ethers.getSigners();

  log("=== Hana Liquidation Demo (PenguinSwap) ===");
  log("0. Deploying the full protocol fresh...");

  const IUSDC = await ethers.getContractFactory("IUSDC");
  const iusdc = await IUSDC.deploy(deployer.address);

  const CreditRegistry = await ethers.getContractFactory("CreditRegistry");
  const registry = await CreditRegistry.deploy(deployer.address);

  const LendingPool = await ethers.getContractFactory("LendingPool");
  const pool = await LendingPool.deploy(await iusdc.getAddress(), deployer.address, treasury.address);

  const SettlementVault = await ethers.getContractFactory("SettlementVault");
  const vault = await SettlementVault.deploy(await iusdc.getAddress(), deployer.address);

  const LoanManager = await ethers.getContractFactory("LoanManager");
  const loanManager = await LoanManager.deploy(
    await registry.getAddress(),
    await pool.getAddress(),
    await vault.getAddress(),
    await iusdc.getAddress(),
    deployer.address
  );

  await registry.setWiring(await loanManager.getAddress(), ethers.ZeroAddress, await pool.getAddress());
  await registry.setReporter(await loanManager.getAddress(), true);
  await registry.setAccountingAsset(await iusdc.getAddress());
  await pool.setLoanManager(await loanManager.getAddress());
  await vault.setLoanManager(await loanManager.getAddress());

  console.log(`   IUSDC            ${await iusdc.getAddress()}`);
  console.log(`   CreditRegistry   ${await registry.getAddress()}`);
  console.log(`   LendingPool      ${await pool.getAddress()}`);
  console.log(`   SettlementVault  ${await vault.getAddress()}`);
  console.log(`   LoanManager      ${await loanManager.getAddress()}`);

  log("1. Seeding the pool with LP liquidity...");
  await iusdc.mint(lp.address, ethers.parseUnits("100000", 6));
  await iusdc.connect(lp).approve(await pool.getAddress(), ethers.MaxUint256);
  await pool.connect(lp).deposit(ethers.parseUnits("100000", 6), lp.address);
  console.log(`   LP deposited 100,000 iUSDC`);

  log("2. Deploying PenguinSwap (mock) + demo collateral (WETH)...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const weth = await MockERC20.deploy("Demo WETH", "WETH", 18);

  const MockPenguinSwapRouter = await ethers.getContractFactory("MockPenguinSwapRouter");
  const router = await MockPenguinSwapRouter.deploy(deployer.address);

  console.log(`   MockWETH               ${await weth.getAddress()}`);
  console.log(`   MockPenguinSwapRouter  ${await router.getAddress()}`);

  log("3. Wiring the swap: 1 WETH = 2,000 iUSDC, reserve funded, router set on LoanManager...");
  const rate = ethers.parseUnits("2000", 6); // amountOut = amountIn(1e18) * rate / 1e18 -> 2000e6
  await router.setRate(await weth.getAddress(), await iusdc.getAddress(), rate);
  await iusdc.mint(deployer.address, ethers.parseUnits("1000000", 6));
  await iusdc.approve(await router.getAddress(), ethers.parseUnits("1000000", 6));
  await router.fundReserve(await iusdc.getAddress(), ethers.parseUnits("1000000", 6));
  await loanManager.setSwapRouter(await router.getAddress());
  console.log(`   router.fundReserve: 1,000,000 iUSDC`);
  console.log(`   loanManager.setSwapRouter(${await router.getAddress()})`);

  log("4. Borrower originates an OVERCOLLATERALIZED loan against 1 WETH (worth 2,000 iUSDC)...");
  const principal = ethers.parseUnits("1000", 6);
  const collateral = ethers.parseUnits("1", 18);
  await weth.mint(borrower.address, collateral);
  await weth.connect(borrower).approve(await loanManager.getAddress(), ethers.MaxUint256);
  const originateTx = await loanManager.connect(borrower).originate({
    loanType: 3, // OVERCOLLATERALIZED
    principal,
    installmentCount: 0,
    termDays: 1,
    billHash: ethers.ZeroHash,
    merchant: ethers.ZeroAddress,
    releaseType: 0,
    releaseTime: 0,
    collateralAsset: await weth.getAddress(),
    collateralAmount: collateral,
  });
  await originateTx.wait();
  const loanId = 1;
  console.log(`   originated loan #${loanId}, tx ${originateTx.hash}`);
  console.log(`   principal=1,000 iUSDC collateral=1 WETH borrower=${borrower.address}`);

  log("5. Fast-forwarding past maturity + grace period + default window...");
  const gracePeriod = await loanManager.gracePeriod();
  const defaultWindow = await loanManager.defaultWindow();
  const totalWaitDays = 1 + Number(gracePeriod) / 86400 + Number(defaultWindow) / 86400;
  console.log(`   grace=${gracePeriod}s default=${defaultWindow}s -> jumping ~${totalWaitDays.toFixed(1)} days`);
  await time.increase(1 * 86400 + Number(gracePeriod) + Number(defaultWindow) + 1);

  log("6. Keeper liquidates the defaulted loan...");
  const poolBorrowedBefore = await pool.totalBorrowed();
  const keeperBalBefore = await iusdc.balanceOf(keeper.address);
  const borrowerBalBefore = await iusdc.balanceOf(borrower.address);

  const liquidateTx = await loanManager.connect(keeper).liquidate(loanId, 0);
  const receipt = await liquidateTx.wait();
  console.log(`   liquidate() tx ${liquidateTx.hash}`);

  const swapEvent = receipt!.logs
    .map((l) => {
      try {
        return loanManager.interface.parseLog(l as any);
      } catch {
        return null;
      }
    })
    .find((e) => e?.name === "CollateralSwapped");
  if (swapEvent) {
    console.log(
      `   CollateralSwapped: ${ethers.formatUnits(swapEvent.args.amountIn, 18)} WETH -> ` +
        `${ethers.formatUnits(swapEvent.args.amountOut, 6)} iUSDC`
    );
  }

  const loan = await loanManager.getLoan(loanId);
  const poolBorrowedAfter = await pool.totalBorrowed();
  const keeperBalAfter = await iusdc.balanceOf(keeper.address);
  const borrowerBalAfter = await iusdc.balanceOf(borrower.address);
  const wethLeftInLoanManager = await weth.balanceOf(await loanManager.getAddress());

  log("7. Result:");
  console.log(`   loan status: ${loan.status === 3n ? "LIQUIDATED" : loan.status} (3 = LIQUIDATED)`);
  console.log(`   pool.totalBorrowed: ${ethers.formatUnits(poolBorrowedBefore, 6)} -> ${ethers.formatUnits(poolBorrowedAfter, 6)} iUSDC (pool made whole from the swap)`);
  console.log(`   keeper incentive paid: ${ethers.formatUnits(keeperBalAfter - keeperBalBefore, 6)} iUSDC`);
  console.log(`   borrower surplus refunded: ${ethers.formatUnits(borrowerBalAfter - borrowerBalBefore, 6)} iUSDC`);
  console.log(`   WETH left dangling in LoanManager: ${ethers.formatUnits(wethLeftInLoanManager, 18)} (should be 0 - fully swapped)`);

  log("=== Demo complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
