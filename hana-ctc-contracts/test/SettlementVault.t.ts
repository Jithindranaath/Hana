import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployProtocol, USDC } from "./helpers";

const ReleaseType = { IMMEDIATE: 0, TIMELOCK: 1, CONDITIONAL: 2 };

describe("SettlementVault", () => {
  it("TIMELOCK: not claimable before releaseTime, claimable after", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { vault, iusdc, loanManager, merchant } = ctx;
    const lm = await ethers.getImpersonatedSigner(await loanManager.getAddress());
    await ethers.provider.send("hardhat_setBalance", [await loanManager.getAddress(), "0x56BC75E2D63100000"]);

    const billHash = ethers.id("timelock-bill");
    await iusdc.mint(await vault.getAddress(), USDC(100));
    const releaseTime = BigInt(await time.latest()) + 1000n;
    await vault.connect(lm).registerSettlement(billHash, merchant.address, USDC(100), ReleaseType.TIMELOCK, releaseTime);

    expect(await vault.claimable(billHash)).to.equal(false);
    await expect(vault.claim(billHash)).to.be.revertedWith("vault: not claimable");

    await time.increaseTo(releaseTime + 1n);
    expect(await vault.claimable(billHash)).to.equal(true);
    await vault.claim(billHash);
    expect(await iusdc.balanceOf(merchant.address)).to.equal(USDC(100));
  });

  it("CONDITIONAL: unlocks only after markConditionMet", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { vault, iusdc, loanManager, merchant } = ctx;
    const lm = await ethers.getImpersonatedSigner(await loanManager.getAddress());
    await ethers.provider.send("hardhat_setBalance", [await loanManager.getAddress(), "0x56BC75E2D63100000"]);

    const billHash = ethers.id("conditional-bill");
    await iusdc.mint(await vault.getAddress(), USDC(50));
    await vault.connect(lm).registerSettlement(billHash, merchant.address, USDC(50), ReleaseType.CONDITIONAL, 0);

    expect(await vault.claimable(billHash)).to.equal(false);
    await vault.connect(lm).markConditionMet(billHash);
    expect(await vault.claimable(billHash)).to.equal(true);
    await vault.claim(billHash);
    expect(await iusdc.balanceOf(merchant.address)).to.equal(USDC(50));
  });

  it("refund returns funds and blocks a later claim; double-claim reverts", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { vault, iusdc, loanManager, merchant, deployer } = ctx;
    const lm = await ethers.getImpersonatedSigner(await loanManager.getAddress());
    await ethers.provider.send("hardhat_setBalance", [await loanManager.getAddress(), "0x56BC75E2D63100000"]);

    const billHash = ethers.id("refund-bill");
    await iusdc.mint(await vault.getAddress(), USDC(75));
    await vault.connect(lm).registerSettlement(billHash, merchant.address, USDC(75), ReleaseType.IMMEDIATE, 0);

    await vault.connect(lm).refund(billHash, deployer.address);
    expect(await iusdc.balanceOf(deployer.address)).to.equal(USDC(75));
    await expect(vault.claim(billHash)).to.be.revertedWith("vault: not claimable");

    // double-claim on an already-claimed (via refund) bill
    await expect(vault.connect(lm).refund(billHash, deployer.address)).to.be.revertedWith("vault: cannot refund");
  });

  it("rejects a second registerSettlement for the same billHash", async () => {
    const ctx = await loadFixture(deployProtocol);
    const { vault, loanManager, merchant } = ctx;
    const lm = await ethers.getImpersonatedSigner(await loanManager.getAddress());
    await ethers.provider.send("hardhat_setBalance", [await loanManager.getAddress(), "0x56BC75E2D63100000"]);

    const billHash = ethers.id("dup-bill");
    await vault.connect(lm).registerSettlement(billHash, merchant.address, USDC(10), ReleaseType.IMMEDIATE, 0);
    await expect(
      vault.connect(lm).registerSettlement(billHash, merchant.address, USDC(10), ReleaseType.IMMEDIATE, 0)
    ).to.be.revertedWith("vault: bill exists");
  });
});
