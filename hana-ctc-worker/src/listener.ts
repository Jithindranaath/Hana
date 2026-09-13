import * as fs from "fs";
import { Contract, EventLog, JsonRpcProvider, solidityPackedKeccak256 } from "ethers";
import { Job, JobStore } from "./jobStore";

// Public Sepolia RPCs commonly cap eth_getLogs to a small block range (Google ~400s, others ~50).
const MAX_LOG_BLOCK_RANGE = 50;
// If no cursor file exists yet and no explicit start block is configured, backfill from this many
// blocks behind the current tip rather than from genesis (which would take forever to scan).
const DEFAULT_LOOKBACK_BLOCKS = 20_000;

export function replayKey(chainKey: number, blockHeight: number, txIndex: number): string {
  return solidityPackedKeccak256(["uint64", "uint64", "uint64"], [chainKey, blockHeight, txIndex]);
}

/**
 * Backfills + polls `CreditSnapshot` events on Sepolia (WORKFLOW.md 5.1). No WebSocket
 * subscription — public RPC endpoints here are HTTP-only, so this polls on an interval instead,
 * chunking `queryFilter` ranges to stay under the host's `eth_getLogs` cap.
 */
export class Listener {
  private readonly cursorFile: string;

  constructor(
    private readonly provider: JsonRpcProvider,
    private readonly attestor: Contract,
    private readonly chainKey: number,
    private readonly store: JobStore,
    stateDir: string,
    private readonly startBlock: number,
    private readonly onNewJob: (job: Job) => void
  ) {
    this.cursorFile = `${stateDir}/cursor.json`;
  }

  private loadCursor(): number | null {
    if (!fs.existsSync(this.cursorFile)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.cursorFile, "utf8")).nextBlock;
    } catch {
      return null;
    }
  }

  private saveCursor(nextBlock: number) {
    fs.writeFileSync(this.cursorFile, JSON.stringify({ nextBlock }));
  }

  async pollOnce(): Promise<void> {
    const latest = await this.provider.getBlockNumber();
    let from = this.loadCursor();
    if (from === null) {
      from = this.startBlock > 0 ? this.startBlock : Math.max(0, latest - DEFAULT_LOOKBACK_BLOCKS);
      console.log(`[listener] no cursor yet — starting backfill from block ${from}`);
    }
    if (from > latest) return;

    while (from <= latest) {
      const to = Math.min(from + MAX_LOG_BLOCK_RANGE - 1, latest);
      const events = await this.attestor.queryFilter(this.attestor.filters.CreditSnapshot(), from, to);
      for (const ev of events) {
        if (!(ev instanceof EventLog)) continue;
        const [subject, , onTimePayments, , , , , snapshotNonce] = ev.args as unknown as any[];
        void onTimePayments;
        const key = replayKey(this.chainKey, ev.blockNumber, ev.transactionIndex);
        if (this.store.get(key)) continue; // already seen this run or a previous one

        const now = new Date().toISOString();
        const job: Job = {
          key,
          chainKey: this.chainKey,
          blockHeight: ev.blockNumber,
          txIndex: ev.transactionIndex,
          subject,
          snapshotNonce: Number(snapshotNonce),
          sepoliaTxHash: ev.transactionHash,
          state: "SEEN",
          createdAt: now,
          updatedAt: now,
        };
        this.store.upsert(job);
        console.log(`[listener] new CreditSnapshot: subject=${subject} nonce=${job.snapshotNonce} block=${job.blockHeight}`);
        this.onNewJob(job);
      }
      from = to + 1;
      this.saveCursor(from);
    }
  }

  start(intervalMs: number) {
    const tick = () => this.pollOnce().catch((err) => console.error("[listener] poll error:", err));
    tick();
    setInterval(tick, intervalMs);
  }
}
