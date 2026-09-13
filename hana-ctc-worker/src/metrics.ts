import * as fs from "fs";
import * as path from "path";
import { Job } from "./jobStore";

/** Pivot §6: one line per completed import, for computing a real p50/p95 distribution afterward. */
export function metricsFile(stateDir: string): string {
  return path.join(stateDir, "latency-log.jsonl");
}

export interface LatencyRow {
  key: string;
  subject: string;
  snapshotNonce: number;
  emittedAt?: string;
  attestConfirmedAt?: string;
  proofFetchedAt?: string;
  confirmedAt?: string;
  attestWaitSeconds: number | null;
  proofFetchSeconds: number | null;
  submitSeconds: number | null;
  totalSeconds: number | null;
}

export function recordLatency(stateDir: string, job: Job): LatencyRow | undefined {
  if (!job.emittedAt || !job.confirmedAt) return undefined;

  const emittedAt = new Date(job.emittedAt).getTime();
  const attestConfirmedAt = job.attestConfirmedAt ? new Date(job.attestConfirmedAt).getTime() : undefined;
  const proofFetchedAt = job.proofFetchedAt ? new Date(job.proofFetchedAt).getTime() : undefined;
  const confirmedAt = new Date(job.confirmedAt).getTime();

  const row: LatencyRow = {
    key: job.key,
    subject: job.subject,
    snapshotNonce: job.snapshotNonce,
    emittedAt: job.emittedAt,
    attestConfirmedAt: job.attestConfirmedAt,
    proofFetchedAt: job.proofFetchedAt,
    confirmedAt: job.confirmedAt,
    attestWaitSeconds: attestConfirmedAt !== undefined ? (attestConfirmedAt - emittedAt) / 1000 : null,
    proofFetchSeconds:
      attestConfirmedAt !== undefined && proofFetchedAt !== undefined
        ? (proofFetchedAt - attestConfirmedAt) / 1000
        : null,
    submitSeconds: proofFetchedAt !== undefined ? (confirmedAt - proofFetchedAt) / 1000 : null,
    totalSeconds: (confirmedAt - emittedAt) / 1000,
  };

  fs.appendFileSync(metricsFile(stateDir), JSON.stringify(row) + "\n");
  console.log(
    `[metrics] subject=${job.subject} nonce=${job.snapshotNonce} total=${row.totalSeconds!.toFixed(1)}s ` +
      `(attest=${row.attestWaitSeconds?.toFixed(1) ?? "?"}s, proof=${row.proofFetchSeconds?.toFixed(1) ?? "?"}s, ` +
      `submit=${row.submitSeconds?.toFixed(1) ?? "?"}s)`
  );
  return row;
}
