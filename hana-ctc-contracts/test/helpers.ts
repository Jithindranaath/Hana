import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

export const SOURCE_CHAIN_KEY = 1n;
export const USDC = (n: number | bigint) => ethers.parseUnits(n.toString(), 6);
export const U18 = (n: number | bigint) => ethers.parseUnits(n.toString(), 18);

export const SNAPSHOT_TOPIC = ethers.id(
  "CreditSnapshot(address,uint64,uint64,uint64,uint64,uint128,uint64,uint64)"
);

export interface SnapshotFields {
  loansCompleted: bigint;
  onTimePayments: bigint;
  latePayments: bigint;
  defaults: bigint;
  cumulativeBorrowedWei: bigint; // normalized 1e18
  firstActivityTimestamp: bigint;
  snapshotNonce: bigint;
}

export async function deployProtocol() {
  const [deployer, treasury, lp, borrower, merchant, keeper, attestorEOA, outsider] =
    await ethers.getSigners();

  const IUSDC = await ethers.getContractFactory("IUSDC");
  const iusdc = await IUSDC.deploy(deployer.address);

  const CreditRegistry = await ethers.getContractFactory("CreditRegistry");
  const registry = await CreditRegistry.deploy(deployer.address);

  const LendingPool = await ethers.getContractFactory("LendingPool");
  const pool = await LendingPool.deploy(await iusdc.getAddress(), deployer.address, treasury.address);

  const SettlementVault = await ethers.getContractFactory("SettlementVault");
  const vault = await SettlementVault.deploy(await iusdc.getAddress(), deployer.address);

  const MockAttestcoin = await ethers.getContractFactory("MockAttestcoin");
  const attestcoin = await MockAttestcoin.deploy();

  const CreditImporterASC = await ethers.getContractFactory("CreditImporterASC");
  const importer = await CreditImporterASC.deploy(
    await attestcoin.getAddress(),
    await registry.getAddress(),
    deployer.address
  );

  const LoanManager = await ethers.getContractFactory("LoanManager");
  const loanManager = await LoanManager.deploy(
    await registry.getAddress(),
    await pool.getAddress(),
    await vault.getAddress(),
    await iusdc.getAddress(),
    deployer.address
  );

  // ---- wiring --------------------------------------------------------------
  await registry.setWiring(
    await loanManager.getAddress(),
    await importer.getAddress(),
    await pool.getAddress()
  );
  await pool.setLoanManager(await loanManager.getAddress());
  await vault.setLoanManager(await loanManager.getAddress());
  await importer.setAttestor(SOURCE_CHAIN_KEY, attestorEOA.address);

  // ---- seed liquidity ---------------------------------------------------
  await iusdc.mint(lp.address, USDC(1_000_000));
  await iusdc.connect(lp).approve(await pool.getAddress(), ethers.MaxUint256);
  await pool.connect(lp).deposit(USDC(100_000), lp.address);

  return {
    deployer, treasury, lp, borrower, merchant, keeper, attestorEOA, outsider,
    iusdc, registry, pool, vault, attestcoin, importer, loanManager,
    attestorAddr: attestorEOA.address,
  };
}

/**
 * Build an `encodedTransaction` blob matching the real `EvmV1Decoder` format: `abi.encode(uint8
 * txType, bytes[] chunks)`, receipt chunk = `abi.encode(uint8 status, uint64 gasUsed,
 * tuple(address,bytes32[],bytes)[] logs, bytes logsBloom)`. `CreditImporterASC` only ever calls
 * `decodeReceiptFields`, which only reads `chunks[2]` (for txType <= 2) — chunk[0]/chunk[1]
 * (common/type-specific tx fields) are never decoded, so they're left empty here.
 */
const abiCoder = ethers.AbiCoder.defaultAbiCoder();

export function encodeTransactionWithLogs(
  logs: { emitter: string; topics: string[]; data: string }[],
  opts: { receiptStatus?: number; txType?: number } = {}
): string {
  const receiptChunk = abiCoder.encode(
    ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"],
    [
      opts.receiptStatus ?? 1,
      0n,
      logs.map((l) => [l.emitter, l.topics, l.data]),
      "0x",
    ]
  );
  const chunks = ["0x", "0x", receiptChunk];
  return abiCoder.encode(["uint8", "bytes[]"], [opts.txType ?? 0, chunks]);
}

/** Build a CreditSnapshot log entry + its matching `encodedTransaction`. */
export function buildSnapshotTx(
  emitter: string,
  subject: string,
  fields: SnapshotFields,
  opts: { receiptStatus?: number } = {}
) {
  const data = abiCoder.encode(
    ["uint64", "uint64", "uint64", "uint64", "uint128", "uint64", "uint64"],
    [
      fields.loansCompleted,
      fields.onTimePayments,
      fields.latePayments,
      fields.defaults,
      fields.cumulativeBorrowedWei,
      fields.firstActivityTimestamp,
      fields.snapshotNonce,
    ]
  );
  const log = { emitter, topics: [SNAPSHOT_TOPIC, ethers.zeroPadValue(subject, 32)], data };
  return { log, encodedTransaction: encodeTransactionWithLogs([log], opts) };
}

/** Configure the mock (txIndex drives the replay key) and run an import through CreditImporterASC. */
export async function importHistory(
  ctx: Awaited<ReturnType<typeof deployProtocol>>,
  subject: string,
  fields: SnapshotFields,
  opts: { blockHeight?: bigint; transactionIndex?: bigint } = {}
) {
  await ctx.attestcoin.setTxIndex(opts.transactionIndex ?? 0n);
  const { encodedTransaction } = buildSnapshotTx(ctx.attestorAddr, subject, fields);
  return ctx.importer.importFromQuery(
    SOURCE_CHAIN_KEY,
    opts.blockHeight ?? 1000n,
    encodedTransaction,
    ethers.ZeroHash,
    [],
    ethers.ZeroHash,
    []
  );
}

export const daysAgo = async (d: number) => BigInt(await time.latest()) - BigInt(d) * 86400n;
