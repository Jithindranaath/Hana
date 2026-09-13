import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployProtocol, USDC } from "./helpers";

describe("LendingPool", () => {
  it("mints shares 1:1 against the underlying on an empty pool", async () => {
    const { pool, iusdc, deployer } = await loadFixture(deployProtocol);
    // fixture already seeds 100_000 iUSDC from `lp`; use a *fresh* pool to check the 1:1 empty-pool case.
    const LendingPool = await ethers.getContractFactory("LendingPool");
    const fresh = await LendingPool.deploy(await iusdc.getAddress(), deployer.address, deployer.address);
    await iusdc.mint(deployer.address, USDC(1_000));
    await iusdc.approve(await fresh.getAddress(), USDC(1_000));
    await fresh.deposit(USDC(1_000), deployer.address);
    expect(await fresh.balanceOf(deployer.address)).to.equal(USDC(1_000));
  });

  it("rate rises with utilization and kinks at 80%", async () => {
    const { pool, loanManager } = await loadFixture(deployProtocol);
    const lmSigner = await ethers.getImpersonatedSigner(await loanManager.getAddress());
    await ethers.provider.send("hardhat_setBalance", [await loanManager.getAddress(), "0x56BC75E2D63100000"]);

    const rate0 = await pool.currentBorrowRateBps();
    await pool.connect(lmSigner).borrow(await loanManager.getAddress(), USDC(50_000)); // 50% util
    const rate50 = await pool.currentBorrowRateBps();
    await pool.connect(lmSigner).borrow(await loanManager.getAddress(), USDC(30_000)); // 80% util (kink)
    const rate80 = await pool.currentBorrowRateBps();
    await pool.connect(lmSigner).borrow(await loanManager.getAddress(), USDC(10_000)); // 90% util
    const rate90 = await pool.currentBorrowRateBps();

    expect(rate50).to.be.gt(rate0);
    expect(rate80).to.be.gt(rate50);
    const slopeBelowKink = rate80 - rate50; // over 30pp
    const slopeAboveKink = rate90 - rate80; // over 10pp
    // steep slope2 (6000bps/10000) vs gentle slope1 (800bps/10000): per-point, above-kink should be much steeper.
    expect(Number(slopeAboveKink) / 10).to.be.gt(Number(slopeBelowKink) / 30);
  });

  it("repaying interest raises the pool's asset-per-share (LP yield)", async () => {
    const { pool, iusdc, loanManager, lp } = await loadFixture(deployProtocol);
    const lmSigner = await ethers.getImpersonatedSigner(await loanManager.getAddress());
    await ethers.provider.send("hardhat_setBalance", [await loanManager.getAddress(), "0x56BC75E2D63100000"]);

    const before = await pool.convertToAssets(USDC(1));
    await pool.connect(lmSigner).borrow(await loanManager.getAddress(), USDC(10_000));
    await iusdc.mint(await loanManager.getAddress(), USDC(500)); // fabricate interest for the LM signer to pay
    await iusdc.connect(lmSigner).approve(await pool.getAddress(), ethers.MaxUint256);
    await pool.connect(lmSigner).repay(USDC(10_000), USDC(500));
    const after = await pool.convertToAssets(USDC(1));

    expect(after).to.be.gt(before);
  });

  it("blocks withdrawal beyond idle liquidity", async () => {
    const { pool, loanManager, lp } = await loadFixture(deployProtocol);
    const lmSigner = await ethers.getImpersonatedSigner(await loanManager.getAddress());
    await ethers.provider.send("hardhat_setBalance", [await loanManager.getAddress(), "0x56BC75E2D63100000"]);
    await pool.connect(lmSigner).borrow(await loanManager.getAddress(), USDC(99_000)); // leaves 1_000 idle

    expect(await pool.maxWithdraw(lp.address)).to.equal(USDC(1_000));
    await expect(pool.connect(lp).withdraw(USDC(2_000), lp.address, lp.address)).to.be.reverted;
  });

  it("routes the reserve cut of interest to the treasury", async () => {
    const { pool, iusdc, loanManager, treasury } = await loadFixture(deployProtocol);
    const lmSigner = await ethers.getImpersonatedSigner(await loanManager.getAddress());
    await ethers.provider.send("hardhat_setBalance", [await loanManager.getAddress(), "0x56BC75E2D63100000"]);
    await pool.connect(lmSigner).borrow(await loanManager.getAddress(), USDC(10_000));
    await iusdc.mint(await loanManager.getAddress(), USDC(1_000));
    await iusdc.connect(lmSigner).approve(await pool.getAddress(), ethers.MaxUint256);

    const before = await iusdc.balanceOf(treasury.address);
    await pool.connect(lmSigner).repay(USDC(10_000), USDC(1_000));
    const after = await iusdc.balanceOf(treasury.address);

    expect(after - before).to.equal(USDC(100)); // 10% reserveFactorBps of 1_000 interest
  });
});
