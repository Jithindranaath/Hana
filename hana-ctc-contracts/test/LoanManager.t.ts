import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployProtocol, importHistory, USDC, U18, daysAgo } from "./helpers";

const ReleaseType = { IMMEDIATE: 0, TIMELOCK: 1, CONDITIONAL: 2 };
const LoanType = { INSTALLMENT: 0, REVOLVING: 1, TERM: 2, OVERCOLLATERALIZED: 3 };

async function givenGoodCredit(ctx: Awaited<ReturnType<typeof deployProtocol>>, who: string, nonce = 1n) {
  await importHistory(ctx, who, {
    loansCompleted: 10,
    onTimePayments: 40,
    latePayments: 0,
    defaults: 0,
    cumulativeBorrowedWei: U18(150_000),
    firstActivityTimestamp: await daysAgo(500),
    snapshotNonce: nonce,
  });
}

describe("LoanManager — full lifecycle", () => {
  it("INSTALLMENT: BNPL bill is originated, paid off on time, merchant settles, LP earns yield", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { loanManager, iusdc, pool, vault, borrower, merchant } = ctx;
    await givenGoodCredit(ctx, borrower.address);

    const billHash = ethers.id("bill-1");
    const principal = USDC(1_000);
    await loanManager.connect(borrower).originate({
      loanType: LoanType.INSTALLMENT,
      principal,
      installmentCount: 4,
      termDays: 120,
      billHash,
      merchant: merchant.address,
      releaseType: ReleaseType.IMMEDIATE,
      releaseTime: 0,
      collateralAsset: ethers.ZeroAddress,
      collateralAmount: 0,
    });

    // funds landed in the vault, not the borrower
    expect(await iusdc.balanceOf(await vault.getAddress())).to.equal(principal);
    expect(await iusdc.balanceOf(borrower.address)).to.equal(0);

    // merchant claims immediately
    await vault.connect(merchant).claim(billHash);
    expect(await iusdc.balanceOf(merchant.address)).to.equal(principal);

    // borrower funds up and pays off all 4 installments, on time
    await iusdc.mint(borrower.address, USDC(2_000));
    await iusdc.connect(borrower).approve(await loanManager.getAddress(), ethers.MaxUint256);

    const loanId = 1;
    const sharePriceBefore = await pool.convertToAssets(USDC(1));
    for (let i = 0; i < 4; i++) {
      const due = await loanManager.nextInstallmentAmount(loanId);
      await loanManager.connect(borrower).makePayment(loanId, due);
    }

    const loan = await loanManager.getLoan(loanId);
    expect(loan.status).to.equal(1); // COMPLETED
    expect(loan.outstandingPrincipal).to.equal(0);

    const profile = await ctx.registry.getProfile(borrower.address);
    expect(profile.nativeLoansCompleted).to.equal(1n);
    expect(profile.nativeOnTimePayments).to.equal(4n);

    const sharePriceAfter = await pool.convertToAssets(USDC(1));
    expect(sharePriceAfter).to.be.gt(sharePriceBefore); // LPs earned yield
  });

  it("OVERCOLLATERALIZED: no credit score required; collateral released on completion", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { loanManager, iusdc } = ctx;
    const borrower = ctx.outsider; // deliberately a fresh, score-300 address

    const principal = USDC(1_000);
    const collateral = USDC(1_600); // 160% > 150% required
    await iusdc.mint(borrower.address, collateral + USDC(200)); // extra for interest
    await iusdc.connect(borrower).approve(await loanManager.getAddress(), ethers.MaxUint256);

    await loanManager.connect(borrower).originate({
      loanType: LoanType.OVERCOLLATERALIZED,
      principal,
      installmentCount: 0,
      termDays: 30,
      billHash: ethers.ZeroHash,
      merchant: ethers.ZeroAddress,
      releaseType: ReleaseType.IMMEDIATE,
      releaseTime: 0,
      collateralAsset: await iusdc.getAddress(),
      collateralAmount: collateral,
    });

    const loanId = 1;
    const [, interestOwed] = await loanManager.amountDue(loanId);
    await loanManager.connect(borrower).makePayment(loanId, principal + interestOwed + USDC(10)); // slight overpay, should refund

    const loan = await loanManager.getLoan(loanId);
    expect(loan.status).to.equal(1); // COMPLETED
    expect(loan.collateralAmount).to.equal(0); // released
  });

  it("TERM: bullet repayment of principal + accrued interest at maturity", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { loanManager, iusdc } = ctx;
    await givenGoodCredit(ctx, ctx.borrower.address);

    await loanManager.connect(ctx.borrower).originate({
      loanType: LoanType.TERM,
      principal: USDC(2_000),
      installmentCount: 0,
      termDays: 90,
      billHash: ethers.ZeroHash,
      merchant: ethers.ZeroAddress,
      releaseType: ReleaseType.IMMEDIATE,
      releaseTime: 0,
      collateralAsset: ethers.ZeroAddress,
      collateralAmount: 0,
    });

    await time.increase(89 * 86400);
    const loanId = 1;
    const [principal, interest] = await loanManager.amountDue(loanId);
    // Send a small buffer over the view-computed amount: interest keeps accruing between this read and
    // the payment tx being mined. Any excess is refunded (capped at outstandingInterest, then outstandingPrincipal).
    const buffer = USDC(1);
    await iusdc.mint(ctx.borrower.address, principal + interest + buffer);
    await iusdc.connect(ctx.borrower).approve(await loanManager.getAddress(), ethers.MaxUint256);
    await loanManager.connect(ctx.borrower).makePayment(loanId, principal + interest + buffer);

    expect((await loanManager.getLoan(loanId)).status).to.equal(1); // COMPLETED
  });

  it("REVOLVING: draw twice, partial repay, interest accrues on the outstanding balance", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { loanManager, iusdc } = ctx;
    await givenGoodCredit(ctx, ctx.borrower.address);

    await loanManager.connect(ctx.borrower).originate({
      loanType: LoanType.REVOLVING,
      principal: USDC(1_000),
      installmentCount: 0,
      termDays: 0,
      billHash: ethers.ZeroHash,
      merchant: ethers.ZeroAddress,
      releaseType: ReleaseType.IMMEDIATE,
      releaseTime: 0,
      collateralAsset: ethers.ZeroAddress,
      collateralAmount: 0,
    });
    const loanId = 1;
    await loanManager.connect(ctx.borrower).draw(loanId, USDC(500));

    await time.increase(30 * 86400);
    const [principal, interest] = await loanManager.amountDue(loanId);
    expect(principal).to.equal(USDC(1_500));
    expect(interest).to.be.gt(0);

    await iusdc.mint(ctx.borrower.address, USDC(1_000));
    await iusdc.connect(ctx.borrower).approve(await loanManager.getAddress(), ethers.MaxUint256);
    await loanManager.connect(ctx.borrower).makePayment(loanId, USDC(1_000));

    const loan = await loanManager.getLoan(loanId);
    expect(loan.outstandingPrincipal).to.be.lt(USDC(1_500));
    expect(loan.status).to.equal(0); // still ACTIVE
  });

  it("reverts origination when principal exceeds the available credit limit", async () => {
    const ctx = await loadFixture(deployProtocol);
    await expect(
      ctx.loanManager.connect(ctx.borrower).originate({
        loanType: LoanType.INSTALLMENT,
        principal: USDC(1_000),
        installmentCount: 4,
        termDays: 120,
        billHash: ethers.ZeroHash,
        merchant: ethers.ZeroAddress,
        releaseType: ReleaseType.IMMEDIATE,
        releaseTime: 0,
        collateralAsset: ethers.ZeroAddress,
        collateralAmount: 0,
      })
    ).to.be.revertedWith("lm: exceeds credit limit"); // fresh address, score 300, limit 0
  });

  it("liquidation: an overdue undercollateralized loan can be liquidated by anyone, penalizing the borrower and socializing the loss", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { loanManager, registry, pool } = ctx;
    await givenGoodCredit(ctx, ctx.borrower.address);

    await loanManager.connect(ctx.borrower).originate({
      loanType: LoanType.TERM,
      principal: USDC(1_000),
      installmentCount: 0,
      termDays: 30,
      billHash: ethers.ZeroHash,
      merchant: ethers.ZeroAddress,
      releaseType: ReleaseType.IMMEDIATE,
      releaseTime: 0,
      collateralAsset: ethers.ZeroAddress,
      collateralAmount: 0,
    });
    const loanId = 1;

    const gracePeriod = await loanManager.gracePeriod();
    const defaultWindow = await loanManager.defaultWindow();
    await time.increase(30 * 86400 + Number(gracePeriod) + Number(defaultWindow) + 1);

    const scoreBefore = (await registry.getProfile(ctx.borrower.address)).compositeScore;
    const borrowedBefore = await pool.totalBorrowed();

    await loanManager.connect(ctx.keeper).liquidate(loanId, 0);

    const scoreAfter = (await registry.getProfile(ctx.borrower.address)).compositeScore;
    const borrowedAfter = await pool.totalBorrowed();
    const loan = await loanManager.getLoan(loanId);

    expect(loan.status).to.equal(2); // DEFAULTED
    expect(scoreAfter).to.be.lt(scoreBefore);
    expect(borrowedAfter).to.be.lt(borrowedBefore); // bad debt written down, socialized to LPs
  });

  it("liquidation: an overcollateralized default repays the pool from collateral and pays the keeper", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { loanManager, iusdc, pool } = ctx;
    const borrower = ctx.outsider;

    const principal = USDC(1_000);
    const collateral = USDC(1_600);
    await iusdc.mint(borrower.address, collateral);
    await iusdc.connect(borrower).approve(await loanManager.getAddress(), ethers.MaxUint256);
    await loanManager.connect(borrower).originate({
      loanType: LoanType.OVERCOLLATERALIZED,
      principal,
      installmentCount: 0,
      termDays: 30,
      billHash: ethers.ZeroHash,
      merchant: ethers.ZeroAddress,
      releaseType: ReleaseType.IMMEDIATE,
      releaseTime: 0,
      collateralAsset: await iusdc.getAddress(),
      collateralAmount: collateral,
    });
    const loanId = 1;

    const gracePeriod = await loanManager.gracePeriod();
    const defaultWindow = await loanManager.defaultWindow();
    await time.increase(30 * 86400 + Number(gracePeriod) + Number(defaultWindow) + 1);

    const keeperBefore = await iusdc.balanceOf(ctx.keeper.address);
    const borrowedBefore = await pool.totalBorrowed();
    await loanManager.connect(ctx.keeper).liquidate(loanId, 0);
    const keeperAfter = await iusdc.balanceOf(ctx.keeper.address);
    const borrowedAfter = await pool.totalBorrowed();

    expect((await loanManager.getLoan(loanId)).status).to.equal(3); // LIQUIDATED
    expect(keeperAfter).to.be.gt(keeperBefore); // keeper incentive paid from collateral surplus
    expect(borrowedAfter).to.be.lte(borrowedBefore - principal + 1n); // pool made whole (collateral covered it)
  });

  it("liquidation: different-asset collateral is swapped via PenguinSwap, repays the pool, and pays the keeper", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { loanManager, iusdc, pool, deployer } = ctx;
    const borrower = ctx.outsider;

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const weth = await MockERC20.deploy("Mock WETH", "WETH", 18);
    const wethAddr = await weth.getAddress();
    const iusdcAddr = await iusdc.getAddress();

    const MockPenguinSwapRouter = await ethers.getContractFactory("MockPenguinSwapRouter");
    const router = await MockPenguinSwapRouter.deploy(deployer.address);
    const routerAddr = await router.getAddress();

    // 1 WETH -> 2,000 iUSDC.
    await router.setRate(wethAddr, iusdcAddr, ethers.parseUnits("2000", 6)); // 1 WETH (1e18) -> 2,000 iUSDC (2000e6)
    await iusdc.mint(deployer.address, USDC(1_000_000));
    await iusdc.approve(routerAddr, USDC(1_000_000));
    await router.fundReserve(iusdcAddr, USDC(1_000_000));

    await loanManager.setSwapRouter(routerAddr);

    const principal = USDC(1_000);
    const collateral = ethers.parseUnits("1", 18); // 1 WETH, worth 2,000 iUSDC at the mock rate
    await weth.mint(borrower.address, collateral);
    await weth.connect(borrower).approve(await loanManager.getAddress(), ethers.MaxUint256);
    await loanManager.connect(borrower).originate({
      loanType: LoanType.OVERCOLLATERALIZED,
      principal,
      installmentCount: 0,
      termDays: 30,
      billHash: ethers.ZeroHash,
      merchant: ethers.ZeroAddress,
      releaseType: ReleaseType.IMMEDIATE,
      releaseTime: 0,
      collateralAsset: wethAddr,
      collateralAmount: collateral,
    });
    const loanId = 1;

    const gracePeriod = await loanManager.gracePeriod();
    const defaultWindow = await loanManager.defaultWindow();
    await time.increase(30 * 86400 + Number(gracePeriod) + Number(defaultWindow) + 1);

    const keeperBefore = await iusdc.balanceOf(ctx.keeper.address);
    const borrowerBefore = await iusdc.balanceOf(borrower.address);
    const borrowedBefore = await pool.totalBorrowed();

    await expect(loanManager.connect(ctx.keeper).liquidate(loanId, 0))
      .to.emit(loanManager, "CollateralSwapped")
      .withArgs(loanId, wethAddr, collateral, USDC(2_000));

    const keeperAfter = await iusdc.balanceOf(ctx.keeper.address);
    const borrowerAfter = await iusdc.balanceOf(borrower.address);
    const borrowedAfter = await pool.totalBorrowed();

    expect((await loanManager.getLoan(loanId)).status).to.equal(3); // LIQUIDATED
    expect(await weth.balanceOf(await loanManager.getAddress())).to.equal(0n); // no collateral left dangling
    expect(borrowedAfter).to.equal(borrowedBefore - principal); // pool made whole from swap proceeds
    expect(keeperAfter - keeperBefore).to.equal(await loanManager.keeperIncentive());
    expect(borrowerAfter).to.be.gt(borrowerBefore); // surplus above debt + keeper fee returned to borrower
  });

  it("liquidation: reverts a different-asset collateral swap when minAmountOut isn't met", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { loanManager, iusdc, deployer } = ctx;
    const borrower = ctx.outsider;

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const weth = await MockERC20.deploy("Mock WETH", "WETH", 18);
    const wethAddr = await weth.getAddress();
    const iusdcAddr = await iusdc.getAddress();

    const MockPenguinSwapRouter = await ethers.getContractFactory("MockPenguinSwapRouter");
    const router = await MockPenguinSwapRouter.deploy(deployer.address);
    const routerAddr = await router.getAddress();

    await router.setRate(wethAddr, iusdcAddr, ethers.parseUnits("2000", 6)); // 1 WETH (1e18) -> 2,000 iUSDC (2000e6)
    await iusdc.mint(deployer.address, USDC(1_000_000));
    await iusdc.approve(routerAddr, USDC(1_000_000));
    await router.fundReserve(iusdcAddr, USDC(1_000_000));
    await loanManager.setSwapRouter(routerAddr);

    const principal = USDC(1_000);
    const collateral = ethers.parseUnits("1", 18);
    await weth.mint(borrower.address, collateral);
    await weth.connect(borrower).approve(await loanManager.getAddress(), ethers.MaxUint256);
    await loanManager.connect(borrower).originate({
      loanType: LoanType.OVERCOLLATERALIZED,
      principal,
      installmentCount: 0,
      termDays: 30,
      billHash: ethers.ZeroHash,
      merchant: ethers.ZeroAddress,
      releaseType: ReleaseType.IMMEDIATE,
      releaseTime: 0,
      collateralAsset: wethAddr,
      collateralAmount: collateral,
    });
    const loanId = 1;

    const gracePeriod = await loanManager.gracePeriod();
    const defaultWindow = await loanManager.defaultWindow();
    await time.increase(30 * 86400 + Number(gracePeriod) + Number(defaultWindow) + 1);

    // Demand far more than the mock rate will ever pay out.
    await expect(
      loanManager.connect(ctx.keeper).liquidate(loanId, USDC(1_000_000))
    ).to.be.revertedWith("router: insufficient output amount");
  });

  it("liquidation reverts a different-asset collateral liquidation when no swap router is wired", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { loanManager } = ctx;
    const borrower = ctx.outsider;

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const weth = await MockERC20.deploy("Mock WETH", "WETH", 18);
    const collateral = ethers.parseUnits("1", 18);
    await weth.mint(borrower.address, collateral);
    await weth.connect(borrower).approve(await loanManager.getAddress(), ethers.MaxUint256);
    await loanManager.connect(borrower).originate({
      loanType: LoanType.OVERCOLLATERALIZED,
      principal: USDC(1_000),
      installmentCount: 0,
      termDays: 30,
      billHash: ethers.ZeroHash,
      merchant: ethers.ZeroAddress,
      releaseType: ReleaseType.IMMEDIATE,
      releaseTime: 0,
      collateralAsset: await weth.getAddress(),
      collateralAmount: collateral,
    });
    const loanId = 1;

    const gracePeriod = await loanManager.gracePeriod();
    const defaultWindow = await loanManager.defaultWindow();
    await time.increase(30 * 86400 + Number(gracePeriod) + Number(defaultWindow) + 1);

    // deployProtocol never wires a swap router — matches the pre-PenguinSwap testnet default.
    await expect(loanManager.connect(ctx.keeper).liquidate(loanId, 0)).to.be.revertedWith(
      "lm: swap router not set"
    );
  });

  it("setMaxSlippageBps is owner-gated and capped at 20%", async () => {
    const { loanManager, borrower } = await loadFixture(deployProtocol);
    await expect(loanManager.connect(borrower).setMaxSlippageBps(100)).to.be.revertedWithCustomError(
      loanManager,
      "OwnableUnauthorizedAccount"
    );
    await expect(loanManager.setMaxSlippageBps(2_001)).to.be.revertedWith("lm: slippage bound too high");
    await loanManager.setMaxSlippageBps(1_000);
    expect(await loanManager.maxSlippageBps()).to.equal(1_000);
  });
});
