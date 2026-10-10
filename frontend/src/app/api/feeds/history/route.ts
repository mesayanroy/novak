import { NextResponse, type NextRequest } from "next/server";
import { isAddress, type Address } from "viem";
import { readRounds } from "@/lib/server/rounds";

/**
 * The last N rounds of one Chainlink feed on Robinhood Chain mainnet, plus an
 * annualized realized volatility estimate from them — what the charts and the
 * distribution market's insights panel use.
 *   GET /api/feeds/history?feed=0x...&rounds=40   (max 500, cached 2 min server-side)
 */
const SECONDS_PER_YEAR = 365 * 24 * 3600;

export async function GET(req: NextRequest) {
  const feed = req.nextUrl.searchParams.get("feed");
  const n = Math.min(Math.max(Number(req.nextUrl.searchParams.get("rounds") ?? 40) || 40, 2), 500);
  if (!feed || !isAddress(feed)) return NextResponse.json({ error: "feed=0x… required" }, { status: 400 });
  try {
    const { decimals, rounds } = await readRounds(feed.toLowerCase() as Address, n);
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
  } catch (e) {
    return NextResponse.json({ error: (e as { shortMessage?: string }).shortMessage ?? (e as Error).message }, { status: 502 });
  }
}
