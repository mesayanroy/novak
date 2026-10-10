import { NextResponse, type NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { isAddress, parseAbi, type Address } from "viem";
import { mainnetClient } from "@/lib/server/mainnet";

/**
 * The latest Chainlink round of one feed on Robinhood Chain mainnet — what the
 * live price header and the chart's last candle poll. One eth_call, shared
 * across viewers for 10 seconds.
 *   GET /api/feeds/latest?feed=0x...
 */
const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function decimals() view returns (uint8)",
]);

const read = unstable_cache(
  async (feed: Address) => {
    const client = mainnetClient();
    const [r, decimals] = await Promise.all([
      client.readContract({ address: feed, abi: feedAbi, functionName: "latestRoundData" }),
      client.readContract({ address: feed, abi: feedAbi, functionName: "decimals" }),
    ]);
    return { roundId: r[0].toString(), price: Number(r[1]) / 10 ** decimals, updatedAt: Number(r[3]), decimals };
  },
  ["feed-latest"],
  { revalidate: 10 },
);

export async function GET(req: NextRequest) {
  const feed = req.nextUrl.searchParams.get("feed");
  if (!feed || !isAddress(feed)) return NextResponse.json({ error: "feed=0x… required" }, { status: 400 });
  try {
    return NextResponse.json({ feed, ...(await read(feed.toLowerCase() as Address)), fetchedAt: Date.now() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
