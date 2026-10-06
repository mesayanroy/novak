"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, type PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import {
  CHAINLINK_FEEDS_MAINNET,
  DistributionStatus,
  decodePriceAtSpec,
  ladderBucketLabels,
  type Hex,
} from "@novakoracle/sdk";
import { deployment, novakAddresses } from "./addresses";
import { loadEventNode, useNovakClient, type EventNode } from "./novak";

export interface DistributionView {
  marketId: Hex;
  question: string;
  status: DistributionStatus;
  nBuckets: number;
  winningBucket: number;
  tradingClosesAt: bigint;
  createdAt: bigint;
  b: bigint;
  reserve: bigint;
  fees: bigint;
  creator: Hex;
  prices: number[];
  outstanding: bigint[];
  boundaries: EventNode[];
  /** Ascending boundary thresholds in USD (decoded from each boundary's Chainlink spec). */
  thresholds: number[];
  labels: string[];
  feed?: Hex;
  ticker: string;
  /** The resolution time T (Chainlink round in effect at T). */
  at?: bigint;
}

const tradeEvent = parseAbiItem(
  "event Trade(bytes32 indexed marketId, address indexed trader, uint8 indexed bucket, bool isBuy, uint256 shares, uint256 collateral, uint256 fee, uint256[] pricesAfter)",
);

export interface TradeRow {
  trader: Hex;
  bucket: number;
  isBuy: boolean;
  shares: bigint;
  collateral: bigint;
  pricesAfter: number[];
  blockNumber: bigint;
  txHash: Hex;
}

const tickerOf = (feed?: string) =>
  Object.entries(CHAINLINK_FEEDS_MAINNET).find(([, a]) => a.toLowerCase() === feed?.toLowerCase())?.[0] ?? "Asset";

async function loadDistribution(client: NonNullable<ReturnType<typeof useNovakClient>>, pc: PublicClient, id: Hex): Promise<DistributionView> {
  const m = await client.getDistributionMarket(id);
  const boundaries = await Promise.all(m.boundaries.map((b) => loadEventNode(pc, b)));
  const specs = boundaries.map((b) => {
    try {
      return b.spec ? decodePriceAtSpec(b.spec.spec) : null;
    } catch {
      return null;
    }
  });
  const ok = specs.every((s) => s !== null);
  const thresholdsRaw = ok ? specs.map((s) => s!.threshold) : [];
  return {
    marketId: id,
    question: m.question,
    status: m.status,
    nBuckets: m.nBuckets,
    winningBucket: m.winningBucket,
    tradingClosesAt: m.tradingClosesAt,
    createdAt: m.createdAt,
    b: m.b,
    reserve: m.reserve,
    fees: m.fees,
    creator: m.creator,
    prices: m.prices,
    outstanding: m.outstanding,
    boundaries,
    thresholds: thresholdsRaw.map((t) => Number(t) / 1e8),
    labels: ok ? ladderBucketLabels(thresholdsRaw) : Array.from({ length: m.nBuckets }, (_, i) => `Range ${i + 1}`),
    feed: ok ? specs[0]!.feed : undefined,
    ticker: ok ? tickerOf(specs[0]!.feed) : "Asset",
    at: ok ? specs[0]!.at : undefined,
  };
}

export function useDistributionMarkets() {
  const client = useNovakClient();
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "distribution", "list", deployment?.distributionMarket],
    enabled: Boolean(client && pc && deployment?.distributionMarket),
    refetchInterval: 15_000,
    queryFn: async () => {
      const list = await client!.listDistributionMarkets();
      const views = await Promise.all(list.map((m) => loadDistribution(client!, pc as PublicClient, m.marketId)));
      return views.reverse();
    },
  });
}

export function useDistributionMarket(id: Hex | undefined) {
  const client = useNovakClient();
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "distribution", id],
    enabled: Boolean(client && pc && id && deployment?.distributionMarket),
    refetchInterval: 5_000,
    queryFn: () => loadDistribution(client!, pc as PublicClient, id!),
  });
}

/** Every trade on a market, oldest first (from Trade logs). */
export function useTrades(id: Hex | undefined) {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "distribution", "trades", id],
    enabled: Boolean(pc && id && deployment?.distributionMarket),
    refetchInterval: 10_000,
    queryFn: async (): Promise<TradeRow[]> => {
      const logs = await (pc as PublicClient).getLogs({
        address: novakAddresses.distributionMarket!,
        event: tradeEvent,
        args: { marketId: id! },
        fromBlock: BigInt(deployment!.startBlock),
        toBlock: "latest",
      });
      return logs.map((l) => ({
        trader: l.args.trader as Hex,
        bucket: Number(l.args.bucket),
        isBuy: Boolean(l.args.isBuy),
        shares: l.args.shares as bigint,
        collateral: l.args.collateral as bigint,
        pricesAfter: (l.args.pricesAfter as readonly bigint[]).map((p) => Number(p) / 1e18),
        blockNumber: l.blockNumber,
        txHash: l.transactionHash,
      }));
    },
  });
}

/** Spot + realized vol for the market's Chainlink feed (server route, mainnet). */
export function useFeedHistory(feed: Hex | undefined) {
  return useQuery({
    queryKey: ["feed-history", feed],
    enabled: Boolean(feed),
    refetchInterval: 300_000,
    queryFn: async () => {
      const r = await fetch(`/api/feeds/history?feed=${feed}&rounds=40`);
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      return (await r.json()) as { rounds: { price: number; updatedAt: number }[]; annualVol: number | null };
    },
  });
}

// --- Model for the insights panel ---

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 7.5e-8). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/**
 * Lognormal (zero-drift) probability of each bucket, given spot, annualized
 * vol and time to resolution. Bucket k = [thresholds[k-1], thresholds[k]).
 */
export function modelBucketProbabilities(spot: number, annualVol: number, years: number, thresholds: number[]): number[] {
  const sigma = Math.max(annualVol, 1e-4) * Math.sqrt(Math.max(years, 1e-6));
  const below = (k: number) => normCdf((Math.log(k / spot) + 0.5 * sigma * sigma) / sigma);
  const cdf = thresholds.map(below);
  const probs = [cdf[0]];
  for (let i = 1; i < cdf.length; i++) probs.push(cdf[i] - cdf[i - 1]);
  probs.push(1 - cdf[cdf.length - 1]);
  return probs.map((p) => Math.max(0, p));
}

export type Signal = "buy" | "hold" | "sell";

/** Edge = model − market. Beyond ±5 points we flag it; otherwise "fair". */
export function signalFor(model: number, market: number): { signal: Signal; edge: number } {
  const edge = model - market;
  if (edge > 0.05) return { signal: "buy", edge };
  if (edge < -0.05) return { signal: "sell", edge };
  return { signal: "hold", edge };
}
