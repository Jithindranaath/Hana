import { Contract, ethers } from "ethers";
import { contracts as sepoliaContracts } from "@hana/shared/src/generated/sepolia";
import { contracts as cc3Contracts } from "@hana/shared/src/generated/cc3";
import { config } from "./config";
import { Job, JobStore } from "./jobStore";
import { Listener } from "./listener";
import { makeProofBuilder, waitAttested } from "./attest";
import { fetchProof } from "./prove";
import { submitImport } from "./submit";
import { createServer } from "./server";
import { withRetry } from "./retry";
import { recordLatency } from "./metrics";

async function main() {
  const sepoliaProvider = new ethers.JsonRpcProvider(config.sepoliaRpcUrl);
  const cc3Provider = new ethers.JsonRpcProvider(config.cc3RpcUrl);
  const wallet = new ethers.Wallet(config.submitterPrivateKey, cc3Provider);

  const attestorMeta = (sepoliaContracts as any).HanaCreditAttestor;
  const importerMeta = (cc3Contracts as any).CreditImporterASC;
  if (!attestorMeta || !importerMeta) {
    throw new Error(
      "HanaCreditAttestor or CreditImporterASC missing from @hana/shared's generated address book " +
        '— run "pnpm sync:abis" from the repo root after both are deployed.'
    );
  }

  const attestor = new Contract(attestorMeta.address, attestorMeta.abi, sepoliaProvider);
  const importer = new Contract(importerMeta.address, importerMeta.abi, wallet);

  const store = new JobStore(config.stateDir);
  const proofBuilder = makeProofBuilder(config.sourceChainKey, config.proverUrl);

  async function processJob(job: Job): Promise<void> {
    job = { ...job, error: undefined }; // clear any stale error from a prior failed attempt
    try {
      if (job.state === "SEEN" || job.state === "ATTEST_WAIT") {
        store.upsert({ ...job, state: "ATTEST_WAIT", attestWaitStartedAt: new Date().toISOString() });
        await withRetry("attest-wait", config.maxRetries, () =>
          waitAttested(proofBuilder, config.sourceChainKey, job.blockHeight, config.pollIntervalMs)
        );
        store.upsert({ ...store.get(job.key)!, attestConfirmedAt: new Date().toISOString() });
      }

      store.upsert({ ...store.get(job.key)!, state: "PROOF_FETCH" });
      const proof = await withRetry("proof-fetch", config.maxRetries, () =>
        fetchProof(proofBuilder, job.sepoliaTxHash)
      );
      store.upsert({ ...store.get(job.key)!, proofFetchedAt: new Date().toISOString() });

      store.upsert({ ...store.get(job.key)!, state: "SUBMIT" });
      const result = await submitImport(importer, proof, config.maxRetries);

      const current = store.get(job.key)!;
      const confirmedAt = new Date().toISOString();
      if (result.terminal === "confirmed") {
        const final = { ...current, state: "CONFIRMED" as const, ccTxHash: result.txHash, confirmedAt };
        store.upsert(final);
        console.log(`[worker] CONFIRMED subject=${job.subject} nonce=${job.snapshotNonce} tx=${result.txHash}`);
        recordLatency(config.stateDir, final);
      } else {
        store.upsert({ ...current, state: "CONFIRMED", error: "already imported (replay/stale-nonce revert)" });
        console.log(`[worker] already imported subject=${job.subject} nonce=${job.snapshotNonce} — CONFIRMED`);
        // Not a fresh end-to-end journey (someone/something already imported this query first) —
        // skip the latency sample rather than record a misleading data point.
      }
    } catch (err: any) {
      const current = store.get(job.key) ?? job;
      store.upsert({ ...current, state: "FAILED", error: String(err?.message ?? err) });
      console.error(`[worker] FAILED job ${job.key} (subject=${job.subject}):`, err);
    }
  }

  // Resume anything left mid-pipeline from a previous run before picking up new events — this is
  // what makes "kill mid-ATTEST_WAIT, restart, don't double-submit" (WORKFLOW.md 5.1) hold.
  const pending = store.pending();
  if (pending.length > 0) {
    console.log(`[worker] resuming ${pending.length} pending job(s) from a previous run`);
    for (const job of pending) processJob(job);
  }

  // FAILED is reached only after exhausting withRetry's budget inside a single processJob run —
  // but a network blip (seen live: a prover request timeout, then separately a DNS lookup
  // failure) can outlast that budget without the underlying service actually being down. Sweep
  // periodically and give FAILED jobs a fresh full retry budget rather than leaving them stuck
  // until someone manually restarts the process.
  setInterval(() => {
    const failed = store.all().filter((j) => j.state === "FAILED");
    for (const job of failed) {
      console.log(`[worker] retrying previously-failed job ${job.key} (subject=${job.subject})`);
      processJob({ ...job, state: "SEEN" });
    }
  }, 3 * 60_000);

  const listener = new Listener(
    sepoliaProvider,
    attestor,
    config.sourceChainKey,
    store,
    config.stateDir,
    config.startBlock,
    (job) => {
      processJob(job);
    }
  );
  listener.start(config.pollIntervalMs);

  const app = createServer(store, config.checkoutOrigin);
  app.listen(config.httpPort, () => {
    console.log(`[worker] status endpoint: http://localhost:${config.httpPort}/status/:address`);
  });

  console.log(
    `[worker] watching CreditSnapshot on Sepolia (chainKey ${config.sourceChainKey}) at ${attestorMeta.address}, ` +
      `submitting to CreditImporterASC ${importerMeta.address} on CC3 as ${wallet.address}`
  );
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
