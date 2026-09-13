import * as fs from "fs";
import * as path from "path";

export type JobState = "SEEN" | "ATTEST_WAIT" | "PROOF_FETCH" | "SUBMIT" | "CONFIRMED" | "FAILED";

export interface Job {
  /** keccak256(chainKey, blockHeight, txIndex) — mirrors CreditImporterASC's on-chain replay key. */
  key: string;
  chainKey: number;
  blockHeight: number;
  txIndex: number;
  subject: string;
  snapshotNonce: number;
  sepoliaTxHash: string;
  state: JobState;
  ccTxHash?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Latency checkpoints (pivot §6 instrumentation) — all ISO timestamps, all optional since a
   * resumed-from-a-crash job may be missing the earlier ones.
   *   emittedAt          — the Sepolia block's own timestamp (not when the listener noticed it)
   *   attestWaitStartedAt — when this job entered ATTEST_WAIT
   *   attestConfirmedAt  — when waitUntilHeightAttested resolved
   *   proofFetchedAt     — when getProof resolved
   *   confirmedAt        — when the CC3 submission was mined
   */
  emittedAt?: string;
  attestWaitStartedAt?: string;
  attestConfirmedAt?: string;
  proofFetchedAt?: string;
  confirmedAt?: string;
}

/**
 * Whole-file JSON job store: `${stateDir}/jobs.json` holds every job keyed by replay key. Writes
 * are atomic (write to a temp file, then rename) so a crash mid-write never corrupts the file —
 * this is what makes "kill the worker mid-job, restart, resume without double-submitting"
 * (WORKFLOW.md 5.1) safe.
 */
export class JobStore {
  private jobs = new Map<string, Job>();
  private readonly file: string;

  constructor(stateDir: string) {
    fs.mkdirSync(stateDir, { recursive: true });
    this.file = path.join(stateDir, "jobs.json");
    this.load();
  }

  private load() {
    if (!fs.existsSync(this.file)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as Job[];
      for (const j of raw) this.jobs.set(j.key, j);
    } catch (err) {
      console.error(`[jobStore] failed to parse ${this.file}, starting with an empty store:`, err);
    }
  }

  private save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify([...this.jobs.values()], null, 2));
    fs.renameSync(tmp, this.file);
  }

  get(key: string): Job | undefined {
    return this.jobs.get(key);
  }

  upsert(job: Job) {
    this.jobs.set(job.key, { ...job, updatedAt: new Date().toISOString() });
    this.save();
  }

  all(): Job[] {
    return [...this.jobs.values()];
  }

  /** Jobs that haven't reached a terminal state — reprocessed on boot. */
  pending(): Job[] {
    return this.all().filter((j) => j.state !== "CONFIRMED" && j.state !== "FAILED");
  }

  /** Newest job for a subject address (case-insensitive) — backs GET /status/:address. */
  latestForSubject(subject: string): Job | undefined {
    const lower = subject.toLowerCase();
    return this.all()
      .filter((j) => j.subject.toLowerCase() === lower)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
  }
}
