import { createPublicClient, createWalletClient, fallback, http, type Chain, type PublicClient, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry, getDeployment, robinhood, robinhoodTestnet, type NovakDeployment } from "@novakoracle/sdk";
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

/** Tries each URL in order; a rate-limited or failing provider falls through to the next. */
const orderedTransport = (urls: string[]): Transport =>
  urls.length === 1 ? http(urls[0], { retryCount: 2 }) : fallback(urls.map((u) => http(u, { retryCount: 1 })), { retryCount: 2 });

const isAlchemy = (u: string) => /\.alchemy\.com\//.test(u);

/**
 * Like `orderedTransport`, but `eth_getLogs` prefers the non-Alchemy URLs:
 * Alchemy's free tier caps getLogs at a 10-block range, and discovery /
 * evidence backfill scan hundreds of thousands of blocks. Everything else
 * (reads, gas estimates, sends) still goes to Alchemy first.
 */
export function transportFor(urls: string[]): Transport {
  const main = orderedTransport(urls);
  const logUrls = [...urls.filter((u) => !isAlchemy(u)), ...urls.filter(isAlchemy)];
  if (!urls.some(isAlchemy) || urls.every(isAlchemy)) return main;
  const logs = orderedTransport(logUrls);
  return (opts) => {
    const m = main(opts);
    const l = logs(opts);
    const request = ((args: { method: string }, o?: unknown) =>
      args.method === "eth_getLogs" ? (l.request as (a: unknown, o?: unknown) => unknown)(args, o) : (m.request as (a: unknown, o?: unknown) => unknown)(args, o)) as typeof m.request;
    return { ...m, request };
  };
}

/** Hides API keys in logs: https://…alchemy.com/v2/abcd… → …/v2/•••• */
export const redactUrl = (u: string) => u.replace(/(\/v2\/)[^/?#]+/, "$1••••");

export function makeClients(config: ResolverConfig): Clients {
  const chain = chainFor(config.chainId);
  const account = privateKeyToAccount(config.privateKey);
  const rpc = transportFor(config.rpcUrls?.length ? config.rpcUrls : [config.rpcUrl]);
  return {
    publicClient: createPublicClient({ chain, transport: rpc }) as PublicClient,
    walletClient: createWalletClient({ account, chain, transport: rpc }),
    account,
    sourceClient: createPublicClient({
      chain: robinhood,
      transport: transportFor(config.sourceRpcUrls?.length ? config.sourceRpcUrls : [config.sourceRpcUrl]),
    }) as PublicClient,
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
