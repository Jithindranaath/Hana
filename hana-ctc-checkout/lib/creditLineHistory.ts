import type { PublicClient } from "viem";
import { SpaceCreditLine } from "./contracts";

// SpaceCreditLine's deployment block on CC3 (see hana-ctc-contracts/deployments/cc3.json) — scanning
// from here instead of genesis keeps the per-account history query fast.
export const SPACE_CREDIT_LINE_DEPLOY_BLOCK = 5_479_862n;

export interface YieldRepaidEvent {
  blockNumber: bigint;
  yieldClaimed: bigint;
  appliedToInterest: bigint;
  appliedToPrincipal: bigint;
  paidToOperator: bigint;
}

/** Every `YieldRepaid` event for this account — used to total up yield applied to debt over time. */
export async function getYieldRepaidHistory(
  publicClient: PublicClient,
  operator: `0x${string}`
): Promise<YieldRepaidEvent[]> {
  const logs = await publicClient.getContractEvents({
    address: SpaceCreditLine.address,
    abi: SpaceCreditLine.abi as any,
    eventName: "YieldRepaid",
    args: { operator },
    fromBlock: SPACE_CREDIT_LINE_DEPLOY_BLOCK,
    toBlock: "latest",
  });
  return logs.map((log: any) => ({
    blockNumber: log.blockNumber,
    yieldClaimed: log.args.yieldClaimed as bigint,
    appliedToInterest: log.args.appliedToInterest as bigint,
    appliedToPrincipal: log.args.appliedToPrincipal as bigint,
    paidToOperator: log.args.paidToOperator as bigint,
  }));
}
