export * from "./chain";
export * from "./types";
export * from "./attestcoin";

/**
 * Generated address books live in ./generated/<network>.ts (produced by
 * `pnpm sync:abis`, which runs each Hardhat package's export:abis script) and are NOT re-exported
 * here to avoid bundling every network's ABIs into every consumer. Import the one you need directly:
 *
 *   import { contracts } from "@hana/shared/src/generated/cc3";
 *   import { contracts as sepoliaContracts } from "@hana/shared/src/generated/sepolia";
 *
 * Nothing outside `scripts/export-abis.ts` in hana-ctc-contracts / hana-ctc-attestor should hand-edit
 * files under ./generated — they are overwritten on every `pnpm sync:abis` run (WORKFLOW rule #1).
 */
