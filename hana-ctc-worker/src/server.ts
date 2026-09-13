import cors from "cors";
import express, { Express } from "express";
import type { ImportStatus } from "@hana/shared";
import { JobStore } from "./jobStore";

/** GET /status/:address, polled by the Checkout Hub's onboarding UI (WORKFLOW.md 5.1 / 7.3). */
export function createServer(store: JobStore, corsOrigin: string | undefined): Express {
  const app = express();
  app.use(cors(corsOrigin ? { origin: corsOrigin } : undefined));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/status/:address", (req, res) => {
    const job = store.latestForSubject(req.params.address);
    if (!job) {
      res.status(404).json({ error: "no import job found for this address" });
      return;
    }
    const status: ImportStatus = {
      state: job.state,
      subject: job.subject,
      chainKey: job.chainKey,
      snapshotNonce: job.snapshotNonce,
      blockHeight: job.blockHeight,
      txHash: job.ccTxHash ?? job.sepoliaTxHash,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      error: job.error,
    };
    res.json(status);
  });

  return app;
}
