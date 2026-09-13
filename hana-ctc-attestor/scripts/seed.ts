import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Seeds two demo wallets with distinct histories ("excellent" / "thin") and fires one snapshot()
 * from each (WORKFLOW.md 2.2). Generates the two wallets on first run and persists them to
 * .demo-wallets.json (gitignored) so re-running reuses the same addresses instead of minting new
 * ones every time.
 *
 * Demo wallets need their own Sepolia ETH for gas — `snapshot()` is sent by the subject, not the
 * deployer/owner. Fund both printed addresses from a faucet before the first run on Sepolia; a
 * second run after funding just resumes (each `seedHistory`/`snapshot()` is safe to repeat, though
 * repeating `snapshot()` bumps the nonce again).
 */

interface DemoWallets {
  excellent: { address: string; privateKey: string };
  thin: { address: string; privateKey: string };
}

const walletsFile = path.join(__dirname, "..", ".demo-wallets.json");

function loadOrCreateWallets(): DemoWallets {
  if (fs.existsSync(walletsFile)) {
    return JSON.parse(fs.readFileSync(walletsFile, "utf8"));
  }
  const excellent = ethers.Wallet.createRandom();
  const thin = ethers.Wallet.createRandom();
  const wallets: DemoWallets = {
    excellent: { address: excellent.address, privateKey: excellent.privateKey },
    thin: { address: thin.address, privateKey: thin.privateKey },
  };
  fs.writeFileSync(walletsFile, JSON.stringify(wallets, null, 2) + "\n");
  console.log(`Generated demo wallets -> ${path.relative(process.cwd(), walletsFile)} (gitignored)`);
  return wallets;
}

async function main() {
  const net = network.name;
  const recPath = path.join(__dirname, "..", "deployments", `${net}.json`);
  if (!fs.existsSync(recPath)) throw new Error(`No deployment found for ${net}. Run deploy.ts first.`);
  const rec = JSON.parse(fs.readFileSync(recPath, "utf8"));
  const attestorAddress = rec.contracts?.HanaCreditAttestor?.address;
  if (!attestorAddress) throw new Error("HanaCreditAttestor not deployed yet.");

  const [owner] = await ethers.getSigners();
  const attestor = await ethers.getContractAt("HanaCreditAttestor", attestorAddress, owner);

  const wallets = loadOrCreateWallets();
  const provider = ethers.provider;
  const excellentSigner = new ethers.Wallet(wallets.excellent.privateKey, provider);
  const thinSigner = new ethers.Wallet(wallets.thin.privateKey, provider);

  console.log(`Excellent-history wallet: ${wallets.excellent.address}`);
  console.log(`Thin-history wallet:      ${wallets.thin.address}`);

  let anyUnfunded = false;
  for (const [label, addr] of [
    ["excellent", wallets.excellent.address],
    ["thin", wallets.thin.address],
  ] as const) {
    const balance = await provider.getBalance(addr);
    if (balance === 0n) {
      anyUnfunded = true;
      console.warn(`\n⚠ ${label} wallet ${addr} has 0 ETH on ${net} — fund it from a faucet, then re-run.`);
    }
  }
  if (anyUnfunded) {
    console.warn("\nSeeding histories now (owner tx, no gas needed from the demo wallets), but");
    console.warn("snapshot() below will fail for any unfunded wallet.");
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const daysAgo = (d: number) => now - BigInt(d) * 86400n;

  // "Excellent": long history, many on-time payments, no defaults, significant volume.
  const excellentFields = {
    loansCompleted: 14,
    onTimePayments: 40,
    latePayments: 1,
    defaults: 0,
    cumulativeBorrowedWei: ethers.parseUnits("85000", 18),
    firstActivityTimestamp: daysAgo(720),
  };
  // "Thin": short history, a couple of loans, small volume.
  const thinFields = {
    loansCompleted: 1,
    onTimePayments: 2,
    latePayments: 0,
    defaults: 0,
    cumulativeBorrowedWei: ethers.parseUnits("500", 18),
    firstActivityTimestamp: daysAgo(30),
  };

  console.log("\nSeeding histories (owner tx)...");
  await (
    await attestor.seedHistory(
      wallets.excellent.address,
      excellentFields.loansCompleted,
      excellentFields.onTimePayments,
      excellentFields.latePayments,
      excellentFields.defaults,
      excellentFields.cumulativeBorrowedWei,
      excellentFields.firstActivityTimestamp
    )
  ).wait();
  await (
    await attestor.seedHistory(
      wallets.thin.address,
      thinFields.loansCompleted,
      thinFields.onTimePayments,
      thinFields.latePayments,
      thinFields.defaults,
      thinFields.cumulativeBorrowedWei,
      thinFields.firstActivityTimestamp
    )
  ).wait();
  console.log("Seeded both wallets.");

  console.log("\nFiring snapshot() from each wallet...");
  const results: Record<
    string,
    { address: string; txHash: string; blockNumber: number; snapshotNonce: string }
  > = {};
  for (const [label, signer] of [
    ["excellent", excellentSigner],
    ["thin", thinSigner],
  ] as const) {
    const balance = await provider.getBalance(signer.address);
    if (balance === 0n) {
      console.warn(`Skipping snapshot() for ${label} (still unfunded).`);
      continue;
    }
    const tx = await attestor.connect(signer).snapshot();
    const receipt = await tx.wait();
    const parsed = receipt!.logs
      .map((l) => {
        try {
          return attestor.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((p) => p?.name === "CreditSnapshot");
    const snapshotNonce = parsed ? parsed.args.snapshotNonce.toString() : "?";
    results[label] = {
      address: signer.address,
      txHash: receipt!.hash,
      blockNumber: receipt!.blockNumber,
      snapshotNonce,
    };
    console.log(`  ${label}: tx ${receipt!.hash} (block ${receipt!.blockNumber}, nonce ${snapshotNonce})`);
  }

  if (Object.keys(results).length > 0) {
    console.log("\nRecord these in planning/demo-fixtures.md:");
    console.log(JSON.stringify(results, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
