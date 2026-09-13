import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { deploySpaceCreditLine, importHistory, U18, daysAgo } from "./helpers";

describe("SpaceCreditLine", () => {
  it("opens a line up to the exact credit limit; reverts above it", async () => {
    const ctx = await loadFixture(deploySpaceCreditLine);
    const { registry, creditLine, space, borrower } = ctx;

    await importHistory(ctx, borrower.address, {
      loansCompleted: 10,
      onTimePayments: 40,
      latePayments: 0,
      defaults: 0,
      cumulativeBorrowedWei: U18(100_000),
      firstActivityTimestamp: await daysAgo(400),
      snapshotNonce: 1n,
    });

    const limit = await registry.getCreditLimit(borrower.address, await space.getAddress());
    expect(limit).to.be.gt(0n);

    await expect(creditLine.connect(borrower).openLine(limit)).to.not.be.reverted;
    const pos = await creditLine.getPosition(borrower.address);
    expect(pos.principal).to.equal(limit);
    expect(pos.stakedPrincipal).to.equal(limit); // auto-staked, not custodied by the operator
    expect(await space.balanceOf(borrower.address)).to.equal(0n);
  });

  it("reverts opening a line above the credit limit (fresh address, score 300, limit 0)", async () => {
    const ctx = await loadFixture(deploySpaceCreditLine);
    const { creditLine, borrower } = ctx;
    await expect(creditLine.connect(borrower).openLine(U18(1))).to.be.revertedWith(
      "line: exceeds credit limit"
    );
  });

  it("reverts a second draw that would push outstanding debt over the limit", async () => {
    const ctx = await loadFixture(deploySpaceCreditLine);
    const { registry, creditLine, space, borrower } = ctx;
    await importHistory(ctx, borrower.address, {
      loansCompleted: 10,
      onTimePayments: 40,
      latePayments: 0,
      defaults: 0,
      cumulativeBorrowedWei: U18(100_000),
      firstActivityTimestamp: await daysAgo(400),
      snapshotNonce: 1n,
    });
    const limit = await registry.getCreditLimit(borrower.address, await space.getAddress());

    await creditLine.connect(borrower).openLine(limit);
    // Drawing this much more must exceed the limit even though origination activity itself can
    // nudge the volume sub-score (and so the limit) up slightly.
    await expect(creditLine.connect(borrower).openLine(U18(1_000_000))).to.be.revertedWith(
      "line: exceeds credit limit"
    );
  });

  it("services debt from staking yield: interest first, then principal", async () => {
    const ctx = await loadFixture(deploySpaceCreditLine);
    const { creditLine, borrower } = ctx;
    await importHistory(ctx, borrower.address, {
      loansCompleted: 10,
      onTimePayments: 40,
      latePayments: 0,
      defaults: 0,
      cumulativeBorrowedWei: U18(100_000),
      firstActivityTimestamp: await daysAgo(400),
      snapshotNonce: 1n,
    });

    await creditLine.connect(borrower).openLine(U18(100));
    const before = await creditLine.getPosition(borrower.address);

    await mine(200); // let staking yield (5 bps/block) outrun the line's interest (1 bps/block)
    await creditLine.connect(borrower).repayFromYield();

    const after = await creditLine.getPosition(borrower.address);
    expect(after.principal).to.be.lt(before.principal);
  });

  it("full repayment marks the line's debt clear and records a completed loan on the registry", async () => {
    const ctx = await loadFixture(deploySpaceCreditLine);
    const { registry, creditLine, staking, borrower, space } = ctx;
    await importHistory(ctx, borrower.address, {
      loansCompleted: 10,
      onTimePayments: 40,
      latePayments: 0,
      defaults: 0,
      cumulativeBorrowedWei: U18(100_000),
      firstActivityTimestamp: await daysAgo(400),
      snapshotNonce: 1n,
    });

    await creditLine.connect(borrower).openLine(U18(10));
    const completedBefore = (await registry.getProfile(borrower.address)).nativeLoansCompleted;

    await mine(5_000); // yield (5 bps/block) comfortably clears both interest (1 bps/block) and principal
    await expect(creditLine.connect(borrower).repayFromYield())
      .to.emit(registry, "NativeActivity")
      .withArgs(borrower.address, 3 /* LOAN_COMPLETED */, await space.getAddress(), 0);

    const pos = await creditLine.getPosition(borrower.address);
    expect(pos.principal).to.equal(0n);
    expect(pos.interestOwed).to.equal(0n);

    const completedAfter = (await registry.getProfile(borrower.address)).nativeLoansCompleted;
    expect(completedAfter).to.equal(completedBefore + 1n);

    // Debt is clear, but the stake itself is still parked in MockSpaceStaking until closeLine.
    expect(await staking.principalOf(borrower.address)).to.equal(U18(10));

    // closeLine unstakes the remainder and hands it back, along with any residual yield.
    await creditLine.connect(borrower).closeLine();
    expect(await staking.principalOf(borrower.address)).to.equal(0n);
    expect((await creditLine.lines(borrower.address)).open).to.equal(false);
  });

  it("closeLine reverts while debt is still outstanding", async () => {
    const ctx = await loadFixture(deploySpaceCreditLine);
    const { creditLine, borrower } = ctx;
    await importHistory(ctx, borrower.address, {
      loansCompleted: 10,
      onTimePayments: 40,
      latePayments: 0,
      defaults: 0,
      cumulativeBorrowedWei: U18(100_000),
      firstActivityTimestamp: await daysAgo(400),
      snapshotNonce: 1n,
    });
    await creditLine.connect(borrower).openLine(U18(10));
    await expect(creditLine.connect(borrower).closeLine()).to.be.revertedWith("line: outstanding debt");
  });

  it("cannot report activity if the registry revokes its reporter authorization", async () => {
    const ctx = await loadFixture(deploySpaceCreditLine);
    const { registry, creditLine, borrower } = ctx;
    await importHistory(ctx, borrower.address, {
      loansCompleted: 10,
      onTimePayments: 40,
      latePayments: 0,
      defaults: 0,
      cumulativeBorrowedWei: U18(100_000),
      firstActivityTimestamp: await daysAgo(400),
      snapshotNonce: 1n,
    });

    await registry.setReporter(await creditLine.getAddress(), false);
    await expect(creditLine.connect(borrower).openLine(U18(1))).to.be.revertedWith(
      "registry: not authorized reporter"
    );
  });

  it("drawing a large SPACE credit line leaves the same wallet's iUSDC BNPL credit completely untouched (regression)", async () => {
    // The two reference apps are supposed to share a score with zero coupling beyond that. Before
    // CreditRegistry.assetDebt was partitioned per-asset, opening a SPACE line (18-dp amounts)
    // silently zeroed out the same wallet's iUSDC (6-dp) available credit — the 18-dp raw number
    // dwarfed the 6-dp limit in the single shared `outstandingDebt` field. This proves it end to
    // end through the real contracts, not just at the registry level.
    const ctx = await loadFixture(deploySpaceCreditLine);
    const { registry, creditLine, space, iusdc, loanManager, borrower } = ctx;
    const iusdcAddr = await iusdc.getAddress();

    await importHistory(ctx, borrower.address, {
      loansCompleted: 10,
      onTimePayments: 40,
      latePayments: 0,
      defaults: 0,
      cumulativeBorrowedWei: U18(100_000),
      firstActivityTimestamp: await daysAgo(400),
      snapshotNonce: 1n,
    });

    const iusdcAvailableBefore = await registry.getAvailableCredit(borrower.address, iusdcAddr);
    expect(iusdcAvailableBefore).to.be.gt(0n);

    const spaceLimit = await registry.getCreditLimit(borrower.address, await space.getAddress());
    await creditLine.connect(borrower).openLine(spaceLimit); // draw the full SPACE line

    const iusdcAvailableAfter = await registry.getAvailableCredit(borrower.address, iusdcAddr);
    expect(iusdcAvailableAfter).to.equal(iusdcAvailableBefore);

    // And a real BNPL loan still originates for the full pre-SpaceCreditLine amount.
    await expect(
      loanManager.connect(borrower).originate({
        loanType: 0, // INSTALLMENT
        principal: iusdcAvailableBefore,
        installmentCount: 4,
        termDays: 60,
        billHash: ethers.ZeroHash,
        merchant: ethers.ZeroAddress,
        releaseType: 0,
        releaseTime: 0,
        collateralAsset: ethers.ZeroAddress,
        collateralAmount: 0,
      })
    ).to.not.be.reverted;
  });
});
