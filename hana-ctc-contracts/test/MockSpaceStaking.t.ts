import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { U18 } from "./helpers";

async function deployStaking() {
  const [deployer, alice, operator, outsider] = await ethers.getSigners();

  const MockSPACE = await ethers.getContractFactory("MockSPACE");
  const space = await MockSPACE.deploy(deployer.address);

  const MockSpaceStaking = await ethers.getContractFactory("MockSpaceStaking");
  const staking = await MockSpaceStaking.deploy(await space.getAddress(), deployer.address);

  await space.mint(alice.address, U18(10_000));
  await space.connect(alice).approve(await staking.getAddress(), ethers.MaxUint256);

  await space.mint(operator.address, U18(10_000));
  await space.connect(operator).approve(await staking.getAddress(), ethers.MaxUint256);
  await staking.setOperator(operator.address);

  await space.mint(deployer.address, U18(10_000));
  await space.approve(await staking.getAddress(), ethers.MaxUint256);
  await staking.fundReserve(U18(10_000));

  return { deployer, alice, operator, outsider, space, staking };
}

describe("MockSpaceStaking", () => {
  it("accrues yield linearly per block on the staked principal", async () => {
    const { alice, staking } = await loadFixture(deployStaking);

    await (await staking.connect(alice).deposit(U18(1_000))).wait();
    const startBlock = await ethers.provider.getBlockNumber();
    await mine(20);
    const endBlock = await ethers.provider.getBlockNumber();

    const rate = await staking.yieldBpsPerBlock();
    const expected = (U18(1_000) * rate * BigInt(endBlock - startBlock)) / 10_000n;
    expect(await staking.pendingYield(alice.address)).to.equal(expected);
  });

  it("claim pays accrued yield out of the reserve and resets pending yield to ~0", async () => {
    const { alice, space, staking } = await loadFixture(deployStaking);

    await staking.connect(alice).deposit(U18(1_000));
    await mine(10);

    const before = await space.balanceOf(alice.address);
    const reserveBefore = await staking.yieldReserve();
    await staking.connect(alice).claim();
    const after = await space.balanceOf(alice.address);
    const reserveAfter = await staking.yieldReserve();

    expect(after).to.be.gt(before);
    expect(reserveBefore - reserveAfter).to.equal(after - before);
    // Claiming again immediately (same block) should pay out ~0 — nothing new accrued yet.
    expect(await staking.pendingYield(alice.address)).to.equal(0n);
  });

  it("withdraw returns staked principal to the caller and reduces principalOf", async () => {
    const { alice, space, staking } = await loadFixture(deployStaking);

    await staking.connect(alice).deposit(U18(1_000));
    const before = await space.balanceOf(alice.address);
    await staking.connect(alice).withdraw(U18(400));

    expect(await staking.principalOf(alice.address)).to.equal(U18(600));
    expect((await space.balanceOf(alice.address)) - before).to.equal(U18(400));
  });

  it("rejects self-service withdraw beyond staked principal", async () => {
    const { alice, staking } = await loadFixture(deployStaking);
    await staking.connect(alice).deposit(U18(100));
    await expect(staking.connect(alice).withdraw(U18(101))).to.be.revertedWith("staking: amount > principal");
  });

  it("only the authorized operator may call the *For functions, and funds settle to the operator", async () => {
    const { alice, operator, outsider, space, staking } = await loadFixture(deployStaking);

    await expect(staking.connect(outsider).depositFor(alice.address, U18(100))).to.be.revertedWith(
      "staking: not operator"
    );

    await staking.connect(operator).depositFor(alice.address, U18(1_000));
    expect(await staking.principalOf(alice.address)).to.equal(U18(1_000));

    await mine(10);

    const operatorBalBefore = await space.balanceOf(operator.address);
    const aliceBalBefore = await space.balanceOf(alice.address);
    await staking.connect(operator).claimFor(alice.address);
    await staking.connect(operator).withdrawFor(alice.address, U18(1_000));

    expect(await space.balanceOf(alice.address)).to.equal(aliceBalBefore); // untouched
    expect(await space.balanceOf(operator.address)).to.be.gt(operatorBalBefore); // yield + principal landed here
    expect(await staking.principalOf(alice.address)).to.equal(0n);
  });

  it("caps a claim at the available reserve and leaves the remainder claimable once refunded", async () => {
    const { deployer, alice, space, staking } = await loadFixture(deployStaking);

    // Drain the reserve down to a token amount so accrued yield outstrips it.
    const currentReserve = await staking.yieldReserve();
    // sweep it out via a throwaway depositor: simplest is to redeploy with a tiny fund instead.
    const MockSpaceStaking = await ethers.getContractFactory("MockSpaceStaking");
    const tightStaking = await MockSpaceStaking.deploy(await space.getAddress(), deployer.address);
    await space.mint(deployer.address, U18(10_001)); // the fixture's deployer balance is already spent
    await space.approve(await tightStaking.getAddress(), U18(1));
    await tightStaking.fundReserve(U18(1)); // tiny reserve
    void currentReserve;

    await space.connect(alice).approve(await tightStaking.getAddress(), ethers.MaxUint256);
    await tightStaking.connect(alice).deposit(U18(10_000));
    await mine(50); // plenty of accrued yield, far more than the 1-SPACE reserve

    const before = await space.balanceOf(alice.address);
    await tightStaking.connect(alice).claim();
    const after = await space.balanceOf(alice.address);

    expect(after - before).to.equal(U18(1)); // capped at the reserve
    expect(await tightStaking.yieldReserve()).to.equal(0n);
    expect(await tightStaking.pendingYield(alice.address)).to.be.gt(0n); // remainder still owed

    // Top up the reserve; the remainder becomes claimable.
    await space.approve(await tightStaking.getAddress(), U18(10_000));
    await tightStaking.fundReserve(U18(10_000));
    const remainderBefore = await tightStaking.pendingYield(alice.address);
    await tightStaking.connect(alice).claim();
    expect((await space.balanceOf(alice.address)) - after).to.be.gte(remainderBefore);
  });
});
