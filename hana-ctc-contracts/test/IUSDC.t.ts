import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployProtocol, USDC } from "./helpers";

describe("iUSDC", () => {
  it("has 6 decimals", async () => {
    const { iusdc } = await loadFixture(deployProtocol);
    expect(await iusdc.decimals()).to.equal(6);
  });

  it("faucet mints the fixed amount and enforces a cooldown", async () => {
    const { iusdc, borrower } = await loadFixture(deployProtocol);
    await iusdc.connect(borrower).faucet();
    expect(await iusdc.balanceOf(borrower.address)).to.equal(USDC(10_000));

    await expect(iusdc.connect(borrower).faucet()).to.be.revertedWith("faucet: cooldown");

    await time.increase(24 * 3600 + 1);
    await iusdc.connect(borrower).faucet();
    expect(await iusdc.balanceOf(borrower.address)).to.equal(USDC(20_000));
  });

  it("owner-only mint is gated", async () => {
    const { iusdc, borrower, deployer } = await loadFixture(deployProtocol);
    await expect(iusdc.connect(borrower).mint(borrower.address, USDC(1))).to.be.revertedWithCustomError(
      iusdc,
      "OwnableUnauthorizedAccount"
    );
    await iusdc.connect(deployer).mint(borrower.address, USDC(1));
    expect(await iusdc.balanceOf(borrower.address)).to.equal(USDC(1));
  });
});
