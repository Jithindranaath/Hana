import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

// Load package-local .env first, then the repo-root .env as a fallback.
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const SEPOLIA_CHAIN_ID = Number(process.env.SEPOLIA_CHAIN_ID ?? 11155111);
const SEPOLIA_DEPLOYER_PRIVATE_KEY = process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY;

const accounts = SEPOLIA_DEPLOYER_PRIVATE_KEY ? [SEPOLIA_DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    // No CC3 opcode-portability constraint here (Sepolia is a full, current-spec L1) — kept at the
    // same 0.8.24 + optimizer settings as @hana/contracts for consistency, not necessity.
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: SEPOLIA_CHAIN_ID,
      accounts,
    },
  },
  // Etherscan V2: one API key works across every supported chain (no more per-network keys).
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY ?? "unset",
  },
  // Tried as a free, no-API-key fallback — its verification endpoint errors (non-JSON response)
  // in this environment even though the host is reachable. Etherscan verification works fine on
  // its own, so this stays off rather than producing a confusing partial-failure on every run.
  sourcify: {
    enabled: false,
  },
  mocha: {
    timeout: 120_000,
  },
};

export default config;
