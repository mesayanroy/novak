"use client";

import type { Address, Log, PublicClient } from "viem";
import type { Hex } from "@novakoracle/sdk";

/**
 * eth_getLogs over [fromBlock, latest] that survives provider limits. One
 * request for the whole range when the provider allows it (the public
 * Robinhood RPC does for single-value topic filters); if it refuses a range,
 * the range is halved and retried, down to 25k blocks.
 *
 * Use ONE value per topic position: OR-lists (several event types in one
 * query) are capped at 100k blocks by the public RPC — query each event type
 * separately instead (see `fetchLogsForEvents`).
 */
export async function fetchLogs(
  pc: PublicClient,
  q: { address: Address | Address[]; topics?: (Hex | null)[]; fromBlock: bigint; toBlock?: bigint },
): Promise<Log[]> {
  const to = q.toBlock ?? (await pc.getBlockNumber());
  const get = (from: bigint, end: bigint) =>
    pc.request({
      method: "eth_getLogs",
      params: [{ address: q.address, topics: q.topics, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${end.toString(16)}` }],
    } as never) as Promise<Log[]>;
  const range = async (from: bigint, end: bigint): Promise<Log[]> => {
    try {
      return await get(from, end);
    } catch (e) {
      if (end - from < 25_000n) throw e;
      const mid = from + (end - from) / 2n;
      const [a, b] = await Promise.all([range(from, mid), range(mid + 1n, end)]);
      return [...a, ...b];
    }
  };
  return q.fromBlock > to ? [] : range(q.fromBlock, to);
}

/** Logs of several event types from one contract: one single-topic query per type, in parallel. */
export async function fetchLogsForEvents(pc: PublicClient, address: Address, selectors: Hex[], fromBlock: bigint): Promise<Log[]> {
  const toBlock = await pc.getBlockNumber();
  const all = await Promise.all(selectors.map((s) => fetchLogs(pc, { address, topics: [s], fromBlock, toBlock })));
  return all.flat().sort((a, b) => (a.blockNumber === b.blockNumber ? Number(a.logIndex) - Number(b.logIndex) : a.blockNumber! < b.blockNumber! ? -1 : 1));
}
