import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

async function deployAttestor() {
  const [deployer, subject, other] = await ethers.getSigners();
  const Attestor = await ethers.getContractFactory("HanaCreditAttestor");
  const attestor = await Attestor.deploy(deployer.address);
  return { deployer, subject, other, attestor };
}

describe("HanaCreditAttestor", () => {
  it("snapshot() on a never-seeded address emits a zeroed CreditSnapshot with nonce 1", async () => {
    const { attestor, subject } = await loadFixture(deployAttestor);
    await expect(attestor.connect(subject).snapshot())
      .to.emit(attestor, "CreditSnapshot")
      .withArgs(subject.address, 0n, 0n, 0n, 0n, 0n, 0n, 1n);
  });

  it("snapshotNonce strictly increments across repeated snapshots", async () => {
    const { attestor, subject } = await loadFixture(deployAttestor);
    await attestor.connect(subject).snapshot();
    await attestor.connect(subject).snapshot();
    await expect(attestor.connect(subject).snapshot())
      .to.emit(attestor, "CreditSnapshot")
      .withArgs(subject.address, 0n, 0n, 0n, 0n, 0n, 0n, 3n);

    const ledger = await attestor.getLedger(subject.address);
    expect(ledger.snapshotNonce).to.equal(3n);
  });

  it("emitted event fields equal the ledger after seeding", async () => {
    const { attestor, deployer, subject } = await loadFixture(deployAttestor);
    const firstActivity = 1_700_000_000n;
    const cumulativeBorrowedWei = ethers.parseUnits("20000", 18);

    await attestor
      .connect(deployer)
      .seedHistory(subject.address, 5, 12, 1, 0, cumulativeBorrowedWei, firstActivity);

    const ledger = await attestor.getLedger(subject.address);
    expect(ledger.loansCompleted).to.equal(5n);
    expect(ledger.onTimePayments).to.equal(12n);
    expect(ledger.latePayments).to.equal(1n);
    expect(ledger.defaults).to.equal(0n);
    expect(ledger.cumulativeBorrowedWei).to.equal(cumulativeBorrowedWei);
    expect(ledger.firstActivityTimestamp).to.equal(firstActivity);
    expect(ledger.snapshotNonce).to.equal(0n); // seeding never advances the nonce

    await expect(attestor.connect(subject).snapshot())
      .to.emit(attestor, "CreditSnapshot")
      .withArgs(subject.address, 5n, 12n, 1n, 0n, cumulativeBorrowedWei, firstActivity, 1n);
  });

  it("seeding again overwrites history but leaves snapshotNonce untouched", async () => {
    const { attestor, deployer, subject } = await loadFixture(deployAttestor);
    await attestor.connect(deployer).seedHistory(subject.address, 5, 12, 1, 0, 1000, 100);
    await attestor.connect(subject).snapshot(); // nonce -> 1
    await attestor.connect(deployer).seedHistory(subject.address, 9, 20, 2, 1, 2000, 200);

    const ledger = await attestor.getLedger(subject.address);
    expect(ledger.loansCompleted).to.equal(9n);
    expect(ledger.snapshotNonce).to.equal(1n);
  });

  it("seedHistory is owner-gated", async () => {
    const { attestor, other, subject } = await loadFixture(deployAttestor);
    await expect(
      attestor.connect(other).seedHistory(subject.address, 1, 1, 0, 0, 0, 0)
    ).to.be.revertedWithCustomError(attestor, "OwnableUnauthorizedAccount");
  });

  it("rejects seeding the zero address", async () => {
    const { attestor, deployer } = await loadFixture(deployAttestor);
    await expect(
      attestor.connect(deployer).seedHistory(ethers.ZeroAddress, 1, 1, 0, 0, 0, 0)
    ).to.be.revertedWith("attestor: subject=0");
  });

  it("each subject's ledger and nonce are independent", async () => {
    const { attestor, subject, other } = await loadFixture(deployAttestor);
    await attestor.connect(subject).snapshot();
    await attestor.connect(subject).snapshot();
    await attestor.connect(other).snapshot();

    expect((await attestor.getLedger(subject.address)).snapshotNonce).to.equal(2n);
    expect((await attestor.getLedger(other.address)).snapshotNonce).to.equal(1n);
  });
});
