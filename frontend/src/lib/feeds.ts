"use client";

import { useQuery } from "@tanstack/react-query";
import type { Hex } from "@novakoracle/sdk";
import type { FeedRow } from "@/app/api/feeds/route";

/**
 * Live Chainlink prices for every Robinhood Chain feed (tokenized stocks, the
 * SGOV tokenized-Treasury ETF, crypto), read on-chain by /api/feeds. Shared
 * query key, so cards, the ticker strip, templates and /feeds all reuse one
 * request.
 */
export function useLiveFeeds() {
  return useQuery({
    queryKey: ["feeds"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const r = await fetch("/api/feeds");
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      return (await r.json()) as { fetchedAt: string; rows: FeedRow[] };
    },
  });
}

export function useFeedRow(feed?: Hex) {
  const { data } = useLiveFeeds();
  return feed ? data?.rows.find((r) => r.feed.toLowerCase() === feed.toLowerCase()) : undefined;
}

/** Recent Chainlink rounds for one feed (sparklines, volatility). */
export function useFeedRounds(feed?: Hex, rounds = 30) {
  return useQuery({
    queryKey: ["feed-history", feed, rounds],
    enabled: Boolean(feed),
    refetchInterval: 300_000,
    staleTime: 120_000,
    queryFn: async () => {
      const r = await fetch(`/api/feeds/history?feed=${feed}&rounds=${rounds}`);
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      return (await r.json()) as { rounds: { price: number; updatedAt: number }[]; annualVol: number | null };
    },
  });
}

export const fmtPrice = (p: number) =>
  `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: p < 10 ? 4 : 2 })}`;
