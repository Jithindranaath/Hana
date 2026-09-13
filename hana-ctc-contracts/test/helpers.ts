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
  await registry.setReporter(await loanManager.getAddress(), true);
  await registry.setAccountingAsset(await iusdc.getAddress());
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

/** Reference app #2: SpaceCreditLine + its MockSPACE/MockSpaceStaking dependencies, wired and seeded. */
export async function deploySpaceCreditLine() {
  const base = await deployProtocol();
  const { deployer, registry } = base;

  const MockSPACE = await ethers.getContractFactory("MockSPACE");
  const space = await MockSPACE.deploy(deployer.address);

  const MockSpaceStaking = await ethers.getContractFactory("MockSpaceStaking");
  const staking = await MockSpaceStaking.deploy(await space.getAddress(), deployer.address);

  const SpaceCreditLine = await ethers.getContractFactory("SpaceCreditLine");
  const creditLine = await SpaceCreditLine.deploy(
    await registry.getAddress(),
    await space.getAddress(),
    await staking.getAddress(),
    deployer.address
  );

  await staking.setOperator(await creditLine.getAddress());
  await registry.setReporter(await creditLine.getAddress(), true);
  // SPACE is 18dp; without its own exposure cap, the default 6dp-sized global cap (10,000 * 1e6)
  // would clamp every SPACE limit to a near-zero raw-unit amount.
  await registry.setAssetConfig(await space.getAddress(), true, U18(5_000), U18(10_000));

  // Seed the credit-line's own reserve (what it stakes on a draw) and the staking yield reserve,
  // mirroring how `deployProtocol` seeds `LendingPool` with iUSDC.
  await space.mint(await creditLine.getAddress(), U18(1_000_000));
  await space.mint(deployer.address, U18(1_000_000));
  await space.approve(await staking.getAddress(), U18(1_000_000));
  await staking.fundReserve(U18(1_000_000));

  return { ...base, space, staking, creditLine };
}
