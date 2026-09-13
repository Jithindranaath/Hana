import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

// Load package-local .env first, then the repo-root .env as a fallback.
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const CC3_RPC_URL =
  process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const CC3_CHAIN_ID = Number(process.env.CC3_CHAIN_ID ?? 102031);
const CC3_DEPLOYER_PRIVATE_KEY = process.env.CC3_DEPLOYER_PRIVATE_KEY;

const accounts = CC3_DEPLOYER_PRIVATE_KEY ? [CC3_DEPLOYER_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    // Project pragma is ^0.8.23; pinned OZ v5.1 compiles on 0.8.24. `evmVersion: "paris"` is
    // pinned explicitly (rather than left to solc's per-version default) to avoid emitting the
    // Cancun-era `mcopy` opcode, keeping bytecode portable to CC3 until its opcode support is
    // confirmed (WORKFLOW 0.3) — this applies to both compiler entries below, including the one
    // pulled in for @gluwa/asc-contracts's `EvmV1Decoder` (used by `CreditImporterASC`, confirmed
    // during the Phase 1 spike), which requires solc >=0.8.28.
    compilers: [
      {
        version: "0.8.24",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: "paris",
        },
      },
      {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: "paris",
        },
      },
    ],
    overrides: {
      "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol": {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: "paris",
        },
      },
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
    cc3: {
      url: CC3_RPC_URL,
      chainId: CC3_CHAIN_ID,
      accounts,
    },
  },
  // CC3 explorer is Blockscout-style. Adjust once the verify endpoint is confirmed (WORKFLOW 0.3).
  etherscan: {
    apiKey: {
      cc3: process.env.CC3_EXPLORER_API_KEY ?? "unset",
    },
    customChains: [
      {
        network: "cc3",
        chainId: CC3_CHAIN_ID,
        urls: {
          apiURL:
            process.env.CC3_EXPLORER_API_URL ??
            "https://creditcoin-testnet.blockscout.com/api",
          browserURL:
            process.env.CC3_EXPLORER_URL ??
            "https://creditcoin-testnet.blockscout.com",
        },
      },
    ],
  },
  mocha: {
    timeout: 120_000,
  },
};

export default config;
