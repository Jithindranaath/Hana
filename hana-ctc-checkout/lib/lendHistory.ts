import type { PublicClient } from "viem";
import { LendingPool } from "./contracts";

// LendingPool's deployment block on CC3 (see hana-ctc-contracts/deployments/cc3.json) — scanning
// from here instead of genesis keeps the yield-history query fast.
export const LENDING_POOL_DEPLOY_BLOCK = 5_434_543n;

export interface RepaidEvent {
  blockNumber: bigint;
  principal: bigint;
  interest: bigint;
  reserve: bigint;
}

/** Every `Repaid` event ever emitted — the pool's entire interest-accrual history. */
export async function getRepaidHistory(publicClient: PublicClient): Promise<RepaidEvent[]> {
  const logs = await publicClient.getContractEvents({
    address: LendingPool.address,
    abi: LendingPool.abi as any,
    eventName: "Repaid",
    fromBlock: LENDING_POOL_DEPLOY_BLOCK,
    toBlock: "latest",
  });
  return logs.map((log: any) => ({
    blockNumber: log.blockNumber,
    principal: log.args.principal as bigint,
    interest: log.args.interest as bigint,
    reserve: log.args.reserve as bigint,
  }));
}
