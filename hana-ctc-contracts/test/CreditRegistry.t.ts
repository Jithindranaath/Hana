import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployProtocol, importHistory, USDC, U18, daysAgo } from "./helpers";

describe("CreditRegistry", () => {
  it("bootstraps a fresh address at the score floor (300) with zero limit", async () => {
    const { registry, borrower, iusdc } = await loadFixture(deployProtocol);
    const profile = await registry.getProfile(borrower.address);
    expect(profile.compositeScore).to.equal(300);
    expect(await registry.getCreditLimit(borrower.address, await iusdc.getAddress())).to.equal(0);
  });

  it("rejects recordNativeActivity from anyone but the wired LoanManager", async () => {
    const { registry, outsider, borrower } = await loadFixture(deployProtocol);
    await expect(
      registry.connect(outsider).recordNativeActivity(0, borrower.address, USDC(100))
    ).to.be.revertedWith("registry: not loan manager");
  });

  it("rejects importAttestedHistory from anyone but the wired ImporterASC", async () => {
    const { registry, outsider, borrower } = await loadFixture(deployProtocol);
    await expect(
      registry.connect(outsider).importAttestedHistory(borrower.address, 1, {
        loansCompleted: 1,
        onTimePayments: 1,
        latePayments: 0,
        defaults: 0,
        cumulativeBorrowedWei: U18(1000),
        firstActivityTimestamp: 0,
        snapshotNonce: 1,
      })
    ).to.be.revertedWith("registry: not importer");
  });

  it("raises the score on on-time native payments and lowers it on a default", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { registry, loanManager, borrower } = ctx;

    // Give the borrower a foothold via import so LoanManager-driven native activity is observable
    // (the registry itself is exercised directly here via impersonation of the wired LoanManager).
    const lmSigner = await ethers.getImpersonatedSigner(await loanManager.getAddress());
    await ethers.provider.send("hardhat_setBalance", [
      await loanManager.getAddress(),
      "0x56BC75E2D63100000",
    ]);

    await registry.connect(lmSigner).recordNativeActivity(0, borrower.address, USDC(1000)); // ORIGINATED
    const afterOrigination = await registry.getProfile(borrower.address);

    for (let i = 0; i < 10; i++) {
      await registry.connect(lmSigner).recordNativeActivity(1, borrower.address, 0); // ON_TIME
    }
    const afterOnTime = await registry.getProfile(borrower.address);
    expect(afterOnTime.compositeScore).to.be.gt(afterOrigination.compositeScore);

    await registry.connect(lmSigner).recordNativeActivity(4, borrower.address, USDC(1000)); // DEFAULTED
    const afterDefault = await registry.getProfile(borrower.address);
    expect(afterDefault.compositeScore).to.be.lt(afterOnTime.compositeScore);
    expect(afterDefault.outstandingDebt).to.equal(0);
  });

  it("weighs imported history below equivalent native history", async () => {
    const ctxA = await loadFixture(deployProtocol);
    const ctxB = await loadFixture(deployProtocol);

    // A: import a strong history.
    await importHistory(ctxA, ctxA.borrower.address, {
      loansCompleted: 10,
      onTimePayments: 40,
      latePayments: 0,
      defaults: 0,
      cumulativeBorrowedWei: U18(50_000),
      firstActivityTimestamp: await daysAgo(400),
      snapshotNonce: 1n,
    });
    const scoreImported = (await ctxA.registry.getProfile(ctxA.borrower.address)).compositeScore;

    // B: identical activity, but recorded natively (via the wired LoanManager).
    const lmSigner = await ethers.getImpersonatedSigner(await ctxB.loanManager.getAddress());
    await ethers.provider.send("hardhat_setBalance", [
      await ctxB.loanManager.getAddress(),
      "0x56BC75E2D63100000",
    ]);
    await ctxB.registry.connect(lmSigner).recordNativeActivity(0, ctxB.borrower.address, USDC(50_000));
    for (let i = 0; i < 40; i++) {
      await ctxB.registry.connect(lmSigner).recordNativeActivity(1, ctxB.borrower.address, 0);
    }
    await time.increase(400 * 86400);
    await ctxB.registry.connect(lmSigner).recordNativeActivity(1, ctxB.borrower.address, 0); // nudge a recompute after warping
    const scoreNative = (await ctxB.registry.getProfile(ctxB.borrower.address)).compositeScore;

    expect(scoreImported).to.be.lt(scoreNative);
  });

  it("credit limit is monotonic in score and floors to zero at/below the floor score", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { registry, iusdc } = ctx;
    const asset = await iusdc.getAddress();

    await importHistory(ctx, ctx.borrower.address, {
      loansCompleted: 1,
      onTimePayments: 2,
      latePayments: 0,
      defaults: 0,
      cumulativeBorrowedWei: U18(2_000),
      firstActivityTimestamp: await daysAgo(30),
      snapshotNonce: 1n,
    });
    const limitLow = await registry.getCreditLimit(ctx.borrower.address, asset);

    await importHistory(
      ctx,
      ctx.borrower.address,
      {
        loansCompleted: 20,
        onTimePayments: 60,
        latePayments: 0,
        defaults: 0,
        cumulativeBorrowedWei: U18(300_000),
        firstActivityTimestamp: await daysAgo(700),
        snapshotNonce: 2n,
      },
      { blockHeight: 1001n, transactionIndex: 1n }
    );
    const limitHigh = await registry.getCreditLimit(ctx.borrower.address, asset);

    expect(limitHigh).to.be.gt(limitLow);
    expect(await registry.getCreditLimit(ctx.merchant.address, asset)).to.equal(0); // untouched address, score 300 == floor
  });

  it("getAvailableCredit subtracts outstanding debt from the gross limit", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { registry, iusdc, borrower } = ctx;
    const asset = await iusdc.getAddress();

    await importHistory(ctx, borrower.address, {
      loansCompleted: 10,
      onTimePayments: 40,
      latePayments: 0,
      defaults: 0,
      cumulativeBorrowedWei: U18(100_000),
      firstActivityTimestamp: await daysAgo(400),
      snapshotNonce: 1n,
    });
    const gross = await registry.getCreditLimit(borrower.address, asset);

    const lmSigner = await ethers.getImpersonatedSigner(await ctx.loanManager.getAddress());
    await ethers.provider.send("hardhat_setBalance", [
      await ctx.loanManager.getAddress(),
      "0x56BC75E2D63100000",
    ]);
    await registry.connect(lmSigner).recordNativeActivity(0, borrower.address, USDC(500)); // ORIGINATED

    const available = await registry.getAvailableCredit(borrower.address, asset);
    expect(available).to.equal(gross - USDC(500));
  });
});
