import { createPublicClient, createWalletClient, http, type Chain, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry, getDeployment, robinhood, robinhoodTestnet, type NovakDeployment } from "@novak/sdk";
import type { ResolverConfig } from "./config.js";

export function chainFor(chainId: number): Chain {
  if (chainId === robinhoodTestnet.id) return robinhoodTestnet;
  if (chainId === foundry.id) return foundry;
  throw new Error(`Unsupported NOVAK_CHAIN_ID ${chainId} (use 46630 or 31337)`);
}

export interface Clients {
  /** Chain Novak is deployed on — all protocol reads/writes. */
  publicClient: PublicClient;
  walletClient: ReturnType<typeof createWalletClient>;
  account: ReturnType<typeof privateKeyToAccount>;
  /** Robinhood Chain MAINNET, read-only — the data source. */
  sourceClient: PublicClient;
  deployment: NovakDeployment;
}

export function makeClients(config: ResolverConfig): Clients {
  const chain = chainFor(config.chainId);
  const account = privateKeyToAccount(config.privateKey);
  return {
    publicClient: createPublicClient({ chain, transport: http(config.rpcUrl) }) as PublicClient,
    walletClient: createWalletClient({ account, chain, transport: http(config.rpcUrl) }),
    account,
    sourceClient: createPublicClient({ chain: robinhood, transport: http(config.sourceRpcUrl) }) as PublicClient,
    deployment: getDeployment(config.chainId),
  };
}

/** Chain time of the latest block — use this, not wall-clock, for protocol timing. */
export async function chainNow(client: PublicClient): Promise<bigint> {
  return (await client.getBlock()).timestamp;
}

/** Largest block number whose timestamp is <= `ts` (binary search, ~log2(height) calls). */
export async function findBlockAtOrBefore(client: PublicClient, ts: bigint): Promise<bigint> {
  let hi = await client.getBlockNumber();
  const latest = await client.getBlock({ blockNumber: hi });
  if (latest.timestamp <= ts) return hi;
  let lo = 0n;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    const b = await client.getBlock({ blockNumber: mid });
    if (b.timestamp <= ts) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}

/** JSON.stringify that survives bigint (evidence blobs contain on-chain integers). */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}
