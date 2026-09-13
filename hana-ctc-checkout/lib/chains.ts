import { defineChain } from "viem";
import { sepolia as sepoliaBase } from "viem/chains";

const CC3_RPC_URL = process.env.NEXT_PUBLIC_CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const CC3_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CC3_CHAIN_ID ?? 102031);
const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

/**
 * Creditcoin CC3 Testnet — the protocol chain. Not a built-in viem chain, so defined here from
 * values confirmed live during the Phase 1 spike (see planning/attestation-latency.md).
 */
export const cc3 = defineChain({
  id: CC3_CHAIN_ID,
  name: "Creditcoin CC3 Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  rpcUrls: {
    default: { http: [CC3_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://creditcoin-testnet.blockscout.com" },
  },
  testnet: true,
});

/**
 * Ethereum Sepolia — the credit-import source chain. Only ever surfaced during the "link your
 * history" onboarding step (WORKFLOW.md 7.3); the rest of the app lives entirely on `cc3`. Same
 * chain as viem's built-in, with our own RPC URL for consistency with the rest of the project.
 */
export const sepolia = defineChain({
  ...sepoliaBase,
  rpcUrls: { default: { http: [SEPOLIA_RPC_URL] } },
});

