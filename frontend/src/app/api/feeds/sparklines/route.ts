import { NextResponse, type NextRequest } from "next/server";
import { isAddress, type Address } from "viem";
import { readRounds } from "@/lib/server/rounds";

/**
 * Recent rounds for MANY feeds in one request — what the market cards' trend
 * lines use, instead of one request per card.
 *   GET /api/feeds/sparklines?feeds=0xA,0xB&rounds=30   (≤ 60 feeds, cached 2 min per feed)
 */
export async function GET(req: NextRequest) {
  const feeds = [...new Set((req.nextUrl.searchParams.get("feeds") ?? "").split(",").map((f) => f.trim().toLowerCase()).filter((f) => isAddress(f)))].slice(0, 60);
  const n = Math.min(Math.max(Number(req.nextUrl.searchParams.get("rounds") ?? 30) || 30, 2), 60);
  const out: Record<string, { price: number; updatedAt: number }[]> = {};
  await Promise.all(
    feeds.map(async (f) => {
      try {
        out[f] = (await readRounds(f as Address, n)).rounds;
      } catch {
        out[f] = [];
      }
    }),
  );
  return NextResponse.json({ rounds: out, fetchedAt: new Date().toISOString() });
}
