import { unstable_cache } from "next/cache";
import { parseAbi, type Address } from "viem";
import { mainnetClient } from "./mainnet";

/**
 * Recent Chainlink rounds for one feed, cached server-side per (feed, n) for
 * two minutes. Every viewer and every card asking for the same feed shares one
 * RPC read, which keeps the mainnet RPC from rate-limiting us.
 */

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function getRoundData(uint80) view returns (uint80, int256, uint256, uint256, uint80)",
  "function decimals() view returns (uint8)",
]);

const AGG_MASK = (1n << 64n) - 1n;

export interface FeedRounds {
  decimals: number;
  rounds: { price: number; updatedAt: number }[];
}

async function read(feed: Address, n: number): Promise<FeedRounds> {
  const client = mainnetClient();
  const [latest, decimals] = await Promise.all([
    client.readContract({ address: feed, abi: feedAbi, functionName: "latestRoundData" }),
    client.readContract({ address: feed, abi: feedAbi, functionName: "decimals" }),
  ]);
  const phase = latest[0] >> 64n;
  const agg = latest[0] & AGG_MASK;
  const ids: bigint[] = [];
  for (let i = 0n; i < BigInt(n) && agg - i >= 1n; i++) ids.push((phase << 64n) | (agg - i));
  const res = (
    await Promise.all(
      Array.from({ length: Math.ceil(ids.length / 150) }, (_, k) =>
        client.multicall({
          allowFailure: true,
          contracts: ids.slice(k * 150, k * 150 + 150).map((id) => ({ address: feed, abi: feedAbi, functionName: "getRoundData" as const, args: [id] as const })),
        }),
      ),
    )
  ).flat();
  const rounds = res
    .flatMap((r) => (r.status === "success" ? [{ price: Number(r.result[1]) / 10 ** decimals, updatedAt: Number(r.result[3]) }] : []))
    .filter((r) => r.updatedAt > 0)
    .sort((a, b) => a.updatedAt - b.updatedAt);
  return { decimals, rounds };
}

export const readRounds = unstable_cache(read, ["feed-rounds-v1"], { revalidate: 120 });
