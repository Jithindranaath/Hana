import * as fs from "fs";
import { config } from "../src/config";
import { metricsFile, LatencyRow } from "../src/metrics";

/** Pivot §6: summarize `latency-log.jsonl` into the p50/p95 the go/no-go decision hinges on. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(label: string, values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) {
    console.log(`${label}: no samples`);
    return;
  }
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  console.log(
    `${label}: n=${n} min=${sorted[0].toFixed(1)}s p50=${percentile(sorted, 50).toFixed(1)}s ` +
      `p95=${percentile(sorted, 95).toFixed(1)}s max=${sorted[n - 1].toFixed(1)}s mean=${mean.toFixed(1)}s`
  );
}

function main() {
  const file = metricsFile(config.stateDir);
  if (!fs.existsSync(file)) {
    console.log(`No latency log at ${file} yet — run some real imports first.`);
    return;
  }
  const rows: LatencyRow[] = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  console.log(`${rows.length} completed import(s) in ${file}\n`);
  summarize("end-to-end (emit -> confirmed)", rows.map((r) => r.totalSeconds).filter((v): v is number => v !== null));
  summarize("attestation wait", rows.map((r) => r.attestWaitSeconds).filter((v): v is number => v !== null));
  summarize("proof fetch", rows.map((r) => r.proofFetchSeconds).filter((v): v is number => v !== null));
  summarize("submission", rows.map((r) => r.submitSeconds).filter((v): v is number => v !== null));

  console.log("\nPer-import:");
  for (const r of rows) {
    console.log(`  nonce=${r.snapshotNonce} total=${r.totalSeconds?.toFixed(1)}s (subject=${r.subject})`);
  }
}

main();
