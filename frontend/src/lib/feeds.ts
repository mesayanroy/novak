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
    refetchInterval: 20_000,
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

/** The feed's latest round, polled every 10 s (the server caches it for 10 s too). */
export function useFeedLatest(feed?: Hex) {
  return useQuery({
    queryKey: ["feed-latest", feed],
    enabled: Boolean(feed),
    refetchInterval: 10_000,
    queryFn: async () => {
      const r = await fetch(`/api/feeds/latest?feed=${feed}`);
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      return (await r.json()) as { roundId: string; price: number; updatedAt: number; decimals: number; fetchedAt: number };
    },
  });
}

/** Recent rounds for many feeds in ONE request (market cards). */
export function useSparklines(feeds: string[], rounds = 30) {
  const key = [...new Set(feeds.map((f) => f.toLowerCase()))].sort();
  return useQuery({
    queryKey: ["feed-sparklines", key.join(","), rounds],
    enabled: key.length > 0,
    refetchInterval: 120_000,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/feeds/sparklines?feeds=${key.join(",")}&rounds=${rounds}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return ((await r.json()) as { rounds: Record<string, { price: number; updatedAt: number }[]> }).rounds;
    },
  });
}

export const fmtPrice = (p: number) =>
  `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: p < 10 ? 4 : 2 })}`;
