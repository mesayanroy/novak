import { NextResponse } from "next/server";
import { parseAbi, type Address } from "viem";
import { mainnetClient } from "@/lib/server/mainnet";

/**
 * Every Chainlink "Robinhood <TICKER> / USD" feed on Robinhood Chain MAINNET
 * (33 tokenized stocks/ETFs, the SGOV tokenized-Treasury feed, crypto), read
 * in ONE multicall. The feed list comes from Chainlink's own public directory,
 * so new feeds appear automatically. Cached 60s.
 */
export const revalidate = 20;

const DIRECTORY = "https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json";
const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);

interface DirectoryFeed {
  name: string;
  proxyAddress: Address;
  heartbeat: number;
  decimals: number;
  assetName?: string;
  docs?: { assetClass?: string; baseAsset?: string; marketHours?: string };
}

export interface FeedRow {
  symbol: string;
  name: string;
  assetClass: string;
  feed: Address;
  decimals: number;
  price: number | null;
  updatedAt: number | null;
  heartbeat: number;
  marketHours: string | null;
}

export async function GET() {
  const dir = await fetch(DIRECTORY, { next: { revalidate: 3600 } });
  if (!dir.ok) return NextResponse.json({ error: `feed directory HTTP ${dir.status}` }, { status: 502 });
  const feeds = ((await dir.json()) as DirectoryFeed[]).filter(
    (f) => f.proxyAddress && !/exchange rate/i.test(f.name),
  );

  const client = mainnetClient();
  const results = await client.multicall({
    allowFailure: true,
    contracts: feeds.map((f) => ({ address: f.proxyAddress, abi: feedAbi, functionName: "latestRoundData" as const })),
  });

  const rows: FeedRow[] = feeds.map((f, i) => {
    const r = results[i];
    const ok = r.status === "success";
    const symbol = (f.docs?.baseAsset ?? f.name.replace(/^Robinhood /, "").split(/[ /-]/)[0]).toUpperCase();
    return {
      symbol,
      name: f.assetName ?? f.name,
      assetClass: f.docs?.assetClass ?? "Crypto",
      feed: f.proxyAddress,
      decimals: f.decimals,
      price: ok ? Number(r.result[1]) / 10 ** f.decimals : null,
      updatedAt: ok ? Number(r.result[3]) : null,
      heartbeat: f.heartbeat,
      marketHours: f.docs?.marketHours ?? null,
    };
  });
  rows.sort((a, b) => (a.assetClass === b.assetClass ? a.symbol.localeCompare(b.symbol) : a.assetClass === "Equity" ? -1 : 1));
  return NextResponse.json({ fetchedAt: new Date().toISOString(), rows });
}
