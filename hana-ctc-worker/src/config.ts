import * as dotenv from "dotenv";
import * as path from "path";

// Load package-local .env first, then the repo-root .env as a fallback.
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const config = {
  sourceChainKey: Number(process.env.SOURCE_CHAIN_KEY ?? 1),
  sepoliaRpcUrl: process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  cc3RpcUrl: process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network",
  proverUrl: process.env.ATTESTCOIN_PROVER_URL ?? "https://prover.cc3-testnet.creditcoin.network",
  submitterPrivateKey: required("WORKER_SUBMITTER_PRIVATE_KEY"),
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 15_000),
  maxRetries: Number(process.env.WORKER_MAX_RETRIES ?? 8),
  stateDir: process.env.WORKER_STATE_DIR ?? "./.worker-state",
  httpPort: Number(process.env.WORKER_HTTP_PORT ?? 8787),
  /** 0 = auto (tip minus a lookback window on first boot — see listener.ts). */
  startBlock: Number(process.env.WORKER_START_BLOCK ?? 0),
  checkoutOrigin: process.env.CHECKOUT_BASE_URL,
} as const;
