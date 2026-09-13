import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployProtocol } from "./helpers";

describe("Governance", () => {
  it("CreditRegistry: weights must sum to 10000; importWeight must stay below native (10000)", async () => {
    const { registry } = await loadFixture(deployProtocol);
    await expect(registry.setWeights(5000, 2500, 3000)).to.be.revertedWith("weights: must sum to 10000");
    await registry.setWeights(4000, 3000, 3000);
    expect((await registry.weights())[0]).to.equal(4000);

    await expect(registry.setImportWeightBps(10_000)).to.be.revertedWith("importWeight: must be < 10000");
    await registry.setImportWeightBps(7000);
    expect(await registry.importWeightBps()).to.equal(7000);
  });

  it("CreditRegistry: limit curve floor must stay in [300, 850)", async () => {
    const { registry } = await loadFixture(deployProtocol);
    await expect(registry.setLimitCurve(200, 1000)).to.be.revertedWith("limitCurve: bad floor");
    await expect(registry.setLimitCurve(850, 1000)).to.be.revertedWith("limitCurve: bad floor");
    await registry.setLimitCurve(600, 2000);
    expect((await registry.limitCurve())[0]).to.equal(600);
  });

  it("LendingPool: reserve factor and kink are bounded", async () => {
    const { pool } = await loadFixture(deployProtocol);
    await expect(pool.setReserveFactorBps(6000)).to.be.revertedWith("pool: reserve too high");
    await expect(pool.setRateParams(200, 800, 6000, 0)).to.be.revertedWith("pool: bad kink");
    await pool.setRateParams(300, 900, 7000, 8500);
    expect((await pool.rateParams())[3]).to.equal(8500);
  });

  it("LoanManager: servicing params are bounded", async () => {
    const { loanManager } = await loadFixture(deployProtocol);
    await expect(loanManager.setServicingParams(3 * 86400, 14 * 86400, 3000, 5_000_000, 15_000, 30 * 86400)).to.be
      .revertedWith("lm: late fee too high");
    await expect(loanManager.setServicingParams(3 * 86400, 14 * 86400, 500, 5_000_000, 9_000, 30 * 86400)).to.be
      .revertedWith("lm: collateral < 100%");
    await loanManager.setServicingParams(2 * 86400, 10 * 86400, 400, 5_000_000, 12_000, 20 * 86400);
    expect(await loanManager.lateFeeBps()).to.equal(400);
  });

  it("only-owner setters are gated on every contract", async () => {
    const { registry, pool, vault, loanManager, importer, borrower } = await loadFixture(deployProtocol);
    await expect(registry.connect(borrower).setImportWeightBps(1)).to.be.revertedWithCustomError(
      registry,
      "OwnableUnauthorizedAccount"
    );
    await expect(pool.connect(borrower).setTreasury(borrower.address)).to.be.revertedWithCustomError(
      pool,
      "OwnableUnauthorizedAccount"
    );
    await expect(vault.connect(borrower).setLoanManager(borrower.address)).to.be.revertedWithCustomError(
      vault,
      "OwnableUnauthorizedAccount"
    );
    await expect(loanManager.connect(borrower).setServicingParams(1, 1, 1, 1, 10_000, 1)).to.be.revertedWithCustomError(
      loanManager,
      "OwnableUnauthorizedAccount"
    );
    await expect(importer.connect(borrower).setAttestor(1, borrower.address)).to.be.revertedWithCustomError(
      importer,
      "OwnableUnauthorizedAccount"
    );
  });
});
