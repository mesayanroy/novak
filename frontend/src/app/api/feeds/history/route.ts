import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient, http, isAddress, parseAbi, type Address } from "viem";
import { robinhood } from "viem/chains";

/**
 * The last N rounds of one Chainlink feed on Robinhood Chain mainnet, plus an
 * annualized realized volatility estimate from them — what the distribution
 * market's insights panel uses to model where the price is likely to land.
 *   GET /api/feeds/history?feed=0x...&rounds=40
 * Cached 5 minutes.
 */
export const revalidate = 300;

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function getRoundData(uint80) view returns (uint80, int256, uint256, uint256, uint80)",
  "function decimals() view returns (uint8)",
]);

const AGG_MASK = (1n << 64n) - 1n;
const SECONDS_PER_YEAR = 365 * 24 * 3600;

export async function GET(req: NextRequest) {
  const feed = req.nextUrl.searchParams.get("feed");
  const n = Math.min(Number(req.nextUrl.searchParams.get("rounds") ?? 40), 100);
  if (!feed || !isAddress(feed)) return NextResponse.json({ error: "feed=0x… required" }, { status: 400 });

  const client = createPublicClient({
    chain: robinhood,
    transport: http(process.env.RESOLVER_SOURCE_RPC_URL ?? robinhood.rpcUrls.default.http[0]),
  });
  const [latest, decimals] = await Promise.all([
    client.readContract({ address: feed as Address, abi: feedAbi, functionName: "latestRoundData" }),
    client.readContract({ address: feed as Address, abi: feedAbi, functionName: "decimals" }),
  ]);
  const latestId = latest[0];
  const phase = latestId >> 64n;
  const agg = latestId & AGG_MASK;
  const ids: bigint[] = [];
  for (let i = 0n; i < BigInt(n) && agg - i >= 1n; i++) ids.push((phase << 64n) | (agg - i));

  const res = await client.multicall({
    allowFailure: true,
    contracts: ids.map((id) => ({ address: feed as Address, abi: feedAbi, functionName: "getRoundData" as const, args: [id] })),
  });
  const rounds = res
    .flatMap((r) => (r.status === "success" ? [{ price: Number(r.result[1]) / 10 ** decimals, updatedAt: Number(r.result[3]) }] : []))
    .filter((r) => r.updatedAt > 0)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  // Realized vol: stdev of log returns per sqrt(second), annualized.
  let sumSq = 0;
  let span = 0;
  for (let i = 1; i < rounds.length; i++) {
    const dt = rounds[i].updatedAt - rounds[i - 1].updatedAt;
    if (dt <= 0) continue;
    const r = Math.log(rounds[i].price / rounds[i - 1].price);
    sumSq += r * r;
    span += dt;
  }
  const annualVol = span > 0 ? Math.sqrt((sumSq / span) * SECONDS_PER_YEAR) : null;

  return NextResponse.json({ feed, decimals, rounds, annualVol, fetchedAt: new Date().toISOString() });
}
