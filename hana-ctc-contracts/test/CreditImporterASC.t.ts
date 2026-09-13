import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployProtocol, buildSnapshotTx, SOURCE_CHAIN_KEY, U18, daysAgo } from "./helpers";

const baseFields = async () => ({
  loansCompleted: 5n,
  onTimePayments: 12n,
  latePayments: 1n,
  defaults: 0n,
  cumulativeBorrowedWei: U18(20_000),
  firstActivityTimestamp: await daysAgo(200),
  snapshotNonce: 1n,
});

describe("CreditImporterASC — the four security checks", () => {
  it("imports a valid, verified snapshot and updates the registry (positive control)", async () => {
    const ctx = await loadFixture(deployProtocol);
    const fields = await baseFields();
    const { encodedTransaction } = buildSnapshotTx(ctx.attestorAddr, ctx.borrower.address, fields);
    await ctx.attestcoin.setTxIndex(7n);

    await expect(
      ctx.importer.importFromQuery(SOURCE_CHAIN_KEY, 1234, encodedTransaction, ethers.ZeroHash, [], ethers.ZeroHash, [])
    )
      .to.emit(ctx.importer, "HistoryImported")
      .withArgs(ctx.borrower.address, SOURCE_CHAIN_KEY, fields.snapshotNonce, 1234);

    const profile = await ctx.registry.getProfile(ctx.borrower.address);
    expect(profile.hasImportedHistory).to.equal(true);
    expect(profile.importedOnTimePayments).to.equal(fields.onTimePayments);
    expect(await ctx.registry.importNonceOf(SOURCE_CHAIN_KEY, ctx.borrower.address)).to.equal(1n);
  });

  it("check 1 — rejects a replayed proof (same chainKey, blockHeight, transactionIndex twice)", async () => {
    const ctx = await loadFixture(deployProtocol);
    const fields = await baseFields();
    const { encodedTransaction } = buildSnapshotTx(ctx.attestorAddr, ctx.borrower.address, fields);
    await ctx.attestcoin.setTxIndex(3n);
    await ctx.importer.importFromQuery(SOURCE_CHAIN_KEY, 999, encodedTransaction, ethers.ZeroHash, [], ethers.ZeroHash, []);

    // Same (chainKey, blockHeight, txIndex) again — even with a fresh nonce, replay is checked first.
    const fields2 = { ...fields, snapshotNonce: 2n };
    const { encodedTransaction: encodedTransaction2 } = buildSnapshotTx(ctx.attestorAddr, ctx.borrower.address, fields2);
    await expect(
      ctx.importer.importFromQuery(SOURCE_CHAIN_KEY, 999, encodedTransaction2, ethers.ZeroHash, [], ethers.ZeroHash, [])
    ).to.be.revertedWith("asc: replay");
  });

  it("check 2 — rejects a proof whose source transaction reverted (receiptStatus != 1)", async () => {
    const ctx = await loadFixture(deployProtocol);
    const fields = await baseFields();
    const { encodedTransaction } = buildSnapshotTx(ctx.attestorAddr, ctx.borrower.address, fields, {
      receiptStatus: 0,
    });
    await ctx.attestcoin.setTxIndex(4n);
    await expect(
      ctx.importer.importFromQuery(SOURCE_CHAIN_KEY, 1000, encodedTransaction, ethers.ZeroHash, [], ethers.ZeroHash, [])
    ).to.be.revertedWith("asc: reverted source tx");
  });

  it("check 3 — rejects a snapshot log from an unregistered emitter (lookalike contract)", async () => {
    const ctx = await loadFixture(deployProtocol);
    const fields = await baseFields();
    const { encodedTransaction } = buildSnapshotTx(
      ctx.outsider.address /* NOT the registered attestor */,
      ctx.borrower.address,
      fields
    );
    await ctx.attestcoin.setTxIndex(5n);
    await expect(
      ctx.importer.importFromQuery(SOURCE_CHAIN_KEY, 1001, encodedTransaction, ethers.ZeroHash, [], ethers.ZeroHash, [])
    ).to.be.revertedWith("asc: bad emitter");
  });

  it("check 4 — rejects a stale nonce (replay of an older, more favorable snapshot)", async () => {
    const ctx = await loadFixture(deployProtocol);
    const good = await baseFields();
    const strong = { ...good, onTimePayments: 999n, snapshotNonce: 5n };
    const { encodedTransaction: strongTx } = buildSnapshotTx(ctx.attestorAddr, ctx.borrower.address, strong);
    await ctx.attestcoin.setTxIndex(10n);
    await ctx.importer.importFromQuery(SOURCE_CHAIN_KEY, 2000, strongTx, ethers.ZeroHash, [], ethers.ZeroHash, []);

    const stale = { ...good, snapshotNonce: 3n }; // older nonce than the 5 already imported
    const { encodedTransaction: staleTx } = buildSnapshotTx(ctx.attestorAddr, ctx.borrower.address, stale);
    await ctx.attestcoin.setTxIndex(11n);
    await expect(
      ctx.importer.importFromQuery(SOURCE_CHAIN_KEY, 2001, staleTx, ethers.ZeroHash, [], ethers.ZeroHash, [])
    ).to.be.revertedWith("asc: stale nonce");
  });

  it("rejects an unknown chainKey with no registered attestor", async () => {
    const ctx = await loadFixture(deployProtocol);
    await expect(
      ctx.importer.importFromQuery(999, 1, "0x", ethers.ZeroHash, [], ethers.ZeroHash, [])
    ).to.be.revertedWith("asc: unknown chainKey");
  });

  it("rejects a proof the precompile does not verify", async () => {
    const ctx = await loadFixture(deployProtocol);
    const fields = await baseFields();
    const { encodedTransaction } = buildSnapshotTx(ctx.attestorAddr, ctx.borrower.address, fields);
    await ctx.attestcoin.setTxIndex(20n);
    await ctx.attestcoin.setVerified(false);
    await expect(
      ctx.importer.importFromQuery(SOURCE_CHAIN_KEY, 3000, encodedTransaction, ethers.ZeroHash, [], ethers.ZeroHash, [])
    ).to.be.revertedWith("asc: proof not verified");
  });
});
