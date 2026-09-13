import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";
import { contracts as sepoliaContracts } from "@hana/shared/src/generated/sepolia";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });
// Root .env's copy of this key is blank in this checkout; the attestor package's own .env has the
// real value (it's the one that actually deployed HanaCreditAttestor to Sepolia). `override: true`
// because dotenv won't replace a key the root .env already set (even to an empty string).
dotenv.config({ path: path.resolve(__dirname, "..", "..", "hana-ctc-attestor", ".env"), override: true });

/** Pivot §6: fire a real HanaCreditAttestor.snapshot() on Sepolia to feed a fresh latency sample. */
async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const pk = process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("SEPOLIA_DEPLOYER_PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);
  const meta = (sepoliaContracts as any).HanaCreditAttestor;
  const attestor = new ethers.Contract(meta.address, meta.abi, wallet);

  console.log(`Calling snapshot() on ${meta.address} as ${wallet.address}...`);
  const tx = await attestor.snapshot();
  console.log(`  tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  const block = await provider.getBlock(receipt!.blockNumber);
  console.log(
    `  mined in block ${receipt!.blockNumber} at ${new Date(block!.timestamp * 1000).toISOString()} ` +
      `(now=${new Date().toISOString()})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
