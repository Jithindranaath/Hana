import * as fs from "fs";
import * as path from "path";

/**
 * Publishes HanaCreditAttestor's address + ABI into @hana/shared (WORKFLOW rule #1).
 *
 * Reads:  deployments/<network>.json  (this package)
 * Writes: packages/shared/src/generated/<network>.ts
 *
 * @hana/contracts and @hana/attestor normally target different networks (cc3 vs sepolia), so
 * there's no real overlap in production. Locally, both could target "hardhat"/"localhost" — this
 * merges into whatever the other package already wrote for that network file instead of
 * clobbering it, since `pnpm sync:abis` runs both packages' export:abis back to back.
 */

const CONTRACT_NAMES = ["HanaCreditAttestor"] as const;

const deploymentsDir = path.join(__dirname, "..", "deployments");
const artifactsDir = path.join(__dirname, "..", "artifacts", "contracts");
const outDir = path.join(__dirname, "..", "..", "packages", "shared", "src", "generated");

function findArtifact(name: string): any {
  const stack = [artifactsDir];
  while (stack.length) {
    const dir = stack.pop()!;
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.name === `${name}.json`) return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  }
  throw new Error(`Artifact not found for ${name}. Run "pnpm build" first.`);
}

function main() {
  const files = fs.existsSync(deploymentsDir)
    ? fs.readdirSync(deploymentsDir).filter((f) => f.endsWith(".json"))
    : [];
  if (files.length === 0) {
    console.log("No deployments found yet — nothing to export.");
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });

  for (const f of files) {
    const network = f.replace(/\.json$/, "");
    const rec = JSON.parse(fs.readFileSync(path.join(deploymentsDir, f), "utf8"));

    const contracts: Record<string, { address: string; abi: any[] }> = {};
    for (const name of CONTRACT_NAMES) {
      const entry = rec.contracts?.[name];
      if (!entry?.address) continue;
      const artifact = findArtifact(name);
      contracts[name] = { address: entry.address, abi: artifact.abi };
    }
    if (Object.keys(contracts).length === 0) continue;

    const outFile = path.join(outDir, `${network}.ts`);
    let merged: { chainId: number; contracts: Record<string, { address: string; abi: any[] }> } = {
      chainId: rec.chainId,
      contracts,
    };
    if (fs.existsSync(outFile)) {
      const prevSrc = fs.readFileSync(outFile, "utf8");
      const prevContractsMatch = prevSrc.match(/export const contracts = ([\s\S]*?) as const;/);
      if (prevContractsMatch) {
        try {
          const prevContracts = JSON.parse(prevContractsMatch[1]);
          merged.contracts = { ...prevContracts, ...contracts };
        } catch {
          // Malformed previous file — overwrite with just this package's contracts.
        }
      }
    }

    const body =
      `// AUTO-GENERATED — do not edit by hand. Written by hana-ctc-contracts/scripts/export-abis.ts\n` +
      `// and hana-ctc-attestor/scripts/export-abis.ts (each merges into the same file).\n` +
      `export const chainId = ${merged.chainId};\n` +
      `export const contracts = ${JSON.stringify(merged.contracts, null, 2)} as const;\n`;
    fs.writeFileSync(outFile, body);
    console.log(
      `Wrote ${path.relative(process.cwd(), outFile)} (${Object.keys(merged.contracts).length} contracts)`
    );
  }
}

main();
