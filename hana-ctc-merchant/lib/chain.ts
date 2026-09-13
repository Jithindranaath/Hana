import "./env";
import { Contract, JsonRpcProvider } from "ethers";
import { contracts as cc3Contracts } from "@hana/shared/src/generated/cc3";

const CC3_RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
// SettlementVault's deployment block (see hana-ctc-contracts/deployments/cc3.json) — scanning
// from here instead of genesis keeps the settlement-history query fast.
const SETTLEMENT_VAULT_DEPLOY_BLOCK = Number(process.env.SETTLEMENT_VAULT_DEPLOY_BLOCK ?? 5_434_544);
const LOG_CHUNK_BLOCKS = 5000;

export interface SettlementRecord {
  billHash: string;
  merchant: string;
  amount: string;
  releaseType: number;
  releaseTime: string;
  registeredTxHash: string;
  registeredBlock: number;
  claimed: boolean;
  claimedTxHash?: string;
  claimedBlock?: number;
}

function getSettlementVault(): Contract {
  const meta = (cc3Contracts as any).SettlementVault;
  if (!meta) {
    throw new Error("SettlementVault missing from @hana/shared's generated cc3 address book — run \"pnpm sync:abis\"");
  }
  const provider = new JsonRpcProvider(CC3_RPC_URL);
  return new Contract(meta.address, meta.abi, provider);
}

/** Read-only: every SettlementRegistered (+ matching Claimed) event for one merchant payout address. */
export async function getSettlementsForMerchant(payoutAddress: string): Promise<SettlementRecord[]> {
  const vault = getSettlementVault();
  const latest = await vault.runner!.provider!.getBlockNumber();

  const registered: any[] = [];
  const claimed: any[] = [];
  for (let from = SETTLEMENT_VAULT_DEPLOY_BLOCK; from <= latest; from += LOG_CHUNK_BLOCKS) {
    const to = Math.min(from + LOG_CHUNK_BLOCKS - 1, latest);
    const [r, c] = await Promise.all([
      vault.queryFilter(vault.filters.SettlementRegistered(null, payoutAddress), from, to),
      vault.queryFilter(vault.filters.Claimed(null, payoutAddress), from, to),
    ]);
    registered.push(...r);
    claimed.push(...c);
  }

  const claimedByHash = new Map(claimed.map((ev) => [ev.args[0], ev]));

  return registered.map((ev) => {
    const [billHash, merchant, amount, releaseType, releaseTime] = ev.args;
    const claim = claimedByHash.get(billHash);
    return {
      billHash,
      merchant,
      amount: amount.toString(),
      releaseType: Number(releaseType),
      releaseTime: releaseTime.toString(),
      registeredTxHash: ev.transactionHash,
      registeredBlock: ev.blockNumber,
      claimed: Boolean(claim),
      claimedTxHash: claim?.transactionHash,
      claimedBlock: claim?.blockNumber,
    };
  });
}
