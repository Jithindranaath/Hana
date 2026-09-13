/**
 * Chain facts shared by the worker and every frontend. Confirmed live against CC3 RPC + the
 * prover during the Phase 1 Attestcoin spike (see WORKFLOW.md Phase 0.3 / 1.1): chainId, the
 * 0xFD2 precompile, and sourceChainKey=1 for Sepolia all checked out via
 * `usc-testnet-bridge-examples`' `check_setup` script. `explorerUrl` is still unconfirmed.
 */

export const cc3 = {
  chainId: Number(process.env.NEXT_PUBLIC_CC3_CHAIN_ID ?? process.env.CC3_CHAIN_ID ?? 102031), // confirmed live: eth_chainId == 102031
  rpcUrl:
    process.env.NEXT_PUBLIC_CC3_RPC_URL ??
    process.env.CC3_RPC_URL ??
    "https://rpc.cc3-testnet.creditcoin.network",
  explorerUrl: process.env.CC3_EXPLORER_URL ?? "https://creditcoin-testnet.blockscout.com", // confirmed live: every CC3 contract in this repo is verified here
  name: "Creditcoin CC3 Testnet",
  currency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
} as const;

export const sepolia = {
  chainId: Number(process.env.SEPOLIA_CHAIN_ID ?? 11155111),
  rpcUrl: process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  name: "Ethereum Sepolia",
} as const;

export const attestcoin = {
  /** Native Query Verifier precompile (proof verification: `verifyAndEmit`/`verify`/`calculateTxIndex`). */
  precompile:
    process.env.ATTESTCOIN_PRECOMPILE ?? "0x0000000000000000000000000000000000000FD2", // confirmed live: contract code present on CC3
  /** Chain Info precompile (`getSupportedChains` etc, via `@gluwa/usc-sdk`'s `chainInfo.PrecompileChainInfoProvider`). Separate from the verifier above. */
  chainInfoPrecompile: "0x0000000000000000000000000000000000000fd3",
  proverUrl: process.env.ATTESTCOIN_PROVER_URL ?? "https://prover.cc3-testnet.creditcoin.network",
  /**
   * Sepolia's chainKey as seen by the CC3 USC runtime. Confirmed live via `getSupportedChains()`:
   * `{ chainKey: 1, chainId: 11155111, chainName: "Sepolia ethereum" }`. (Ethereum mainnet is
   * chainKey 3, chainId 1, for reference — chainKey and chainId are independent numberings.)
   */
  sourceChainKey: BigInt(process.env.SOURCE_CHAIN_KEY ?? 1),
} as const;

export const asset = {
  iUSDCDecimals: 6,
} as const;
