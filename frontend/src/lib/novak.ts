"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, type PublicClient } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";
import {
  Availability,
  CHAINLINK_FEEDS_MAINNET,
  Comparator,
  CompositeOp,
  EventStatus,
  MarketStatus,
  NovakClient,
  SOURCES,
  STOCK_TOKENS_MAINNET,
  TradingSession,
  decodeCorporateActionSpec,
  decodePriceAtSpec,
  decodeTradingStatusSpec,
  decodeFedRateSpec,
  feedByAddress,
  feedBySymbol,
  eventBusAbi,
  eventComposerAbi,
  eventRegistryAbi,
  sourceName,
  type EventSpecInput,
  type Hex,
  type MarketDef,
} from "@novakoracle/sdk";
import { deployment, novakAddresses } from "./addresses";

export const USDG_DECIMALS = 6;
export const fmtUsdg = (v: bigint) =>
  Number(formatUnits(v, USDG_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 });

export const fmtTime = (unix: bigint | number) =>
  new Date(Number(unix) * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const tickerFor = (addr: string, table: Record<string, string>) =>
  Object.entries(table).find(([, a]) => a.toLowerCase() === addr.toLowerCase())?.[0] ?? `${addr.slice(0, 8)}…`;

const SESSION_LABEL: Record<TradingSession, string> = {
  [TradingSession.Market]: "regular session",
  [TradingSession.Extended]: "extended hours",
  [TradingSession.Overnight]: "overnight",
};

export type MarketCategory = "stocks" | "bonds" | "crypto" | "macro" | "corporate" | "trading" | "other";

export interface SpecInfo {
  title: string;
  source: string;
  /** Chainlink feed (Robinhood Chain mainnet) behind this event, if any. */
  feed?: Hex;
  ticker?: string;
  category: MarketCategory;
}

export const categoryForFeed = (feed: string): MarketCategory => {
  const f = feedByAddress(feed);
  if (!f) return "other";
  if (f.symbol === "GLD") return "stocks"; // a gold ETF token, filed under Crypto by the feed directory
  return f.assetClass === "Bond" ? "bonds" : f.assetClass === "Equity" ? "stocks" : "crypto";
};

/** Human-readable title, source, Chainlink feed and category for a primitive event's on-chain spec. */
export function describeSpec(spec: EventSpecInput): SpecInfo {
  const name = sourceName(spec.sourceId);
  try {
    if (name === SOURCES.priceAt) {
      const s = decodePriceAtSpec(spec.spec);
      const t = feedByAddress(s.feed)?.symbol ?? tickerFor(s.feed, CHAINLINK_FEEDS_MAINNET);
      const cmp = s.comparator === Comparator.Gte ? "≥" : "≤";
      return {
        title: `${t} ${cmp} $${(Number(s.threshold) / 1e8).toLocaleString()} at ${fmtTime(s.at)}`,
        source: "Chainlink price (Robinhood Chain mainnet)",
        feed: s.feed,
        ticker: t,
        category: categoryForFeed(s.feed),
      };
    }
    if (name === SOURCES.corporateAction) {
      const s = decodeCorporateActionSpec(spec.spec);
      const t = tickerFor(s.stockToken, STOCK_TOKENS_MAINNET);
      const what = s.minChangeBps >= 5_000 ? "split-size" : s.minChangeBps > 0 ? `≥${s.minChangeBps / 100}%` : "any";
      return {
        title: `${t}: ${what} corporate action effective ${fmtTime(s.windowStart)} – ${fmtTime(s.windowEnd)}`,
        source: "ERC-8056 stock token (Robinhood Chain mainnet)",
        feed: feedBySymbol(t)?.address,
        ticker: t,
        category: "corporate",
      };
    }
    if (name === SOURCES.tradingStatus) {
      const s = decodeTradingStatusSpec(spec.spec);
      return {
        title: `${s.symbol} NOT tradable (${SESSION_LABEL[s.session]})`,
        source: "Robinhood asset registry",
        feed: feedBySymbol(s.symbol)?.address,
        ticker: s.symbol,
        category: "trading",
      };
    }
    if (name === SOURCES.fedRate) {
      const s = decodeFedRateSpec(spec.spec);
      const cmp = s.comparator === Comparator.Gte ? "≥" : "≤";
      return {
        title: `Fed funds upper bound ${cmp} ${(s.upperBoundBps / 100).toFixed(2)}% on ${new Date(Number(s.date) * 1000).toISOString().slice(0, 10)}`,
        source: "FRED DFEDTARU (St. Louis Fed)",
        ticker: "FED",
        category: "macro",
      };
    }
  } catch {
    /* malformed spec — fall through */
  }
  return { title: `Custom event (${spec.sourceId.slice(0, 10)}…)`, source: "custom source", category: "other" };
}

export type CompositeStatusLabel = "Unresolved" | "True" | "False" | "Voided";
const COMPOSITE_STATUS: CompositeStatusLabel[] = ["Unresolved", "True", "False", "Voided"];
export const OP_LABEL: Record<CompositeOp, string> = {
  [CompositeOp.And]: "And",
  [CompositeOp.Or]: "Or",
  [CompositeOp.Not]: "Not",
  [CompositeOp.Before]: "Before",
  [CompositeOp.Within]: "Within",
};

export interface EventNode {
  id: Hex;
  kind: "primitive" | "composite";
  title: string;
  source?: string;
  availability: Availability;
  /** primitive only */
  status?: EventStatus;
  spec?: EventSpecInput;
  /** composite only */
  compositeStatus?: CompositeStatusLabel;
  op?: CompositeOp;
  windowSeconds?: number;
  children?: EventNode[];
  /** Earliest openTimestamp among leaf primitives — when trading must close. */
  opensAt?: bigint;
  /** Chainlink feed / ticker / category of the (first) underlying asset. */
  feed?: Hex;
  ticker?: string;
  category?: MarketCategory;
}

/** Every distinct underlying ticker in an event tree (leaf order). */
export function tickersOf(node: Pick<EventNode, "ticker" | "children">): string[] {
  const leaves = node.children?.length ? node.children.flatMap(tickersOf) : node.ticker ? [node.ticker] : [];
  return [...new Set(leaves)];
}

// An event's spec never changes, and a primitive in a terminal state never
// changes again: cache both so lists of many markets refresh cheaply.
const specCache = new Map<string, EventSpecInput>();
const finalNodes = new Map<string, EventNode>();
const FINAL = new Set([EventStatus.Finalized, EventStatus.Voided, EventStatus.Expired]);

export async function loadEventNode(pc: PublicClient, id: Hex, depth = 0): Promise<EventNode> {
  const cached = finalNodes.get(id.toLowerCase());
  if (cached) return cached;
  // getAvailability and getEvent don't depend on each other — fire them
  // concurrently (and, with multicall batching enabled on the client,
  // collapsed into a single RPC round trip) instead of waiting in series.
  const [availabilityRaw, statusRaw] = await Promise.all([
    pc.readContract({ address: novakAddresses.eventBus, abi: eventBusAbi, functionName: "getAvailability", args: [id] }),
    pc.readContract({ address: novakAddresses.eventRegistry, abi: eventRegistryAbi, functionName: "getEvent", args: [id] }),
  ]);
  const availability = Number(availabilityRaw) as Availability;
  const status = Number(statusRaw) as EventStatus;

  if (status !== EventStatus.None) {
    let spec = specCache.get(id.toLowerCase());
    if (!spec) {
      spec = (await pc.readContract({
        address: novakAddresses.eventRegistry,
        abi: eventRegistryAbi,
        functionName: "getEventSpec",
        args: [id],
      })) as EventSpecInput;
      specCache.set(id.toLowerCase(), spec);
    }
    const d = describeSpec(spec);
    const node: EventNode = {
      id,
      kind: "primitive",
      title: d.title,
      source: d.source,
      availability,
      status,
      spec,
      opensAt: spec.openTimestamp,
      feed: d.feed,
      ticker: d.ticker,
      category: d.category,
    };
    if (FINAL.has(status)) finalNodes.set(id.toLowerCase(), node);
    return node;
  }

  const [cs, cStatusRaw] = await Promise.all([
    pc.readContract({
      address: novakAddresses.eventComposer,
      abi: eventComposerAbi,
      functionName: "getCompositeSpec",
      args: [id],
    }),
    pc.readContract({ address: novakAddresses.eventComposer, abi: eventComposerAbi, functionName: "getStatus", args: [id] }),
  ]);
  const cStatus = Number(cStatusRaw);
  const op = Number(cs.op) as CompositeOp;
  const children =
    depth < 3 ? await Promise.all(cs.operands.map((o) => loadEventNode(pc, o as Hex, depth + 1))) : [];
  const opensAt = children.reduce<bigint | undefined>(
    (m, c) => (c.opensAt !== undefined && (m === undefined || c.opensAt < m) ? c.opensAt : m),
    undefined,
  );
  const window = Number(cs.window);
  return {
    id,
    kind: "composite",
    title:
      children.length > 0
        ? children.map((c) => c.title).join(` ${OP_LABEL[op].toUpperCase()}${window ? ` (${window / 3600}h)` : ""} `)
        : `${OP_LABEL[op]} composite`,
    availability,
    compositeStatus: COMPOSITE_STATUS[cStatus],
    feed: children.find((c) => c.feed)?.feed,
    ticker: children.find((c) => c.ticker)?.ticker,
    category: children.find((c) => c.category)?.category,
    op,
    windowSeconds: window || undefined,
    children,
    opensAt,
  };
}

export function useNovakClient(): NovakClient | undefined {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  return useMemo(
    () =>
      publicClient && deployment
        ? new NovakClient(publicClient as never, walletClient as never, novakAddresses)
        : undefined,
    [publicClient, walletClient],
  );
}

export interface LiveMarket extends MarketDef {
  marketId: Hex;
  event: EventNode;
  /** Preview data shown only when no deployment exists — render <ExampleDataBadge />. */
  isExample?: boolean;
}

const MOCK_MARKETS_RAW: LiveMarket[] = [
  {
    marketId: "0x8a791620dd6260079bf849dc5567adc3f2fdc318",
    eventId: "0x0100000000000000000000000000000000000000000000000000000000000001",
    creator: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    createdAt: BigInt(Math.floor(Date.now() / 1000) - 86400 * 3),
    tradingClosesAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 5),
    status: MarketStatus.Open,
    outcome: false,
    yesPool: 125000000000n, // $125,000 USDG
    noPool: 75000000000n,   // $75,000 USDG
    feeTaken: 0n,
    question: "Will NVDA execute a stock split AND Bitcoin exceed $100k within 48h of split announcement?",
    event: {
      id: "0x0100000000000000000000000000000000000000000000000000000000000001",
      kind: "composite",
      title: "NVDA Split AND BTC ≥ $100k WITHIN (48h)",
      availability: Availability.Pending,
      compositeStatus: "Unresolved",
      op: CompositeOp.And,
      windowSeconds: 172800,
      opensAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 5),
      children: [
        {
          id: "0x0200000000000000000000000000000000000000000000000000000000000002",
          kind: "primitive",
          title: "NVDA: split-size corporate action effective Oct 15 – Oct 20",
          source: "ERC-8056 stock token (Robinhood Chain mainnet)",
          availability: Availability.Pending,
          status: EventStatus.Open,
          opensAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 5),
        },
        {
          id: "0x0300000000000000000000000000000000000000000000000000000000000003",
          kind: "primitive",
          title: "BTC ≥ $100,000 at Oct 20, 2026, 04:00 PM",
          source: "Chainlink price (Robinhood Chain mainnet)",
          availability: Availability.Pending,
          status: EventStatus.Open,
          opensAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 6),
        },
      ],
    },
  },
  {
    marketId: "0x9b881620dd6260079bf849dc5567adc3f2fdc319",
    eventId: "0x0400000000000000000000000000000000000000000000000000000000000004",
    creator: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    createdAt: BigInt(Math.floor(Date.now() / 1000) - 86400 * 2),
    tradingClosesAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 3),
    status: MarketStatus.Open,
    outcome: false,
    yesPool: 45000000000n, // $45,000 USDG
    noPool: 55000000000n,  // $55,000 USDG
    feeTaken: 0n,
    question: "Will TSLA stock trading be halted during Robinhood extended hours session?",
    event: {
      id: "0x0400000000000000000000000000000000000000000000000000000000000004",
      kind: "primitive",
      title: "TSLA NOT tradable (extended hours)",
      source: "Robinhood asset registry",
      availability: Availability.Pending,
      status: EventStatus.Open,
      opensAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 3),
    },
  },
  {
    marketId: "0xa1111620dd6260079bf849dc5567adc3f2fdc320",
    eventId: "0x0500000000000000000000000000000000000000000000000000000000000005",
    creator: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    createdAt: BigInt(Math.floor(Date.now() / 1000) - 86400 * 5),
    tradingClosesAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
    status: MarketStatus.Open,
    outcome: false,
    yesPool: 90000000000n, // $90,000 USDG
    noPool: 30000000000n,  // $30,000 USDG
    feeTaken: 0n,
    question: "Will Apple Inc (AAPL) announce a special dividend or capital distribution ≥ 5%?",
    event: {
      id: "0x0500000000000000000000000000000000000000000000000000000000000005",
      kind: "primitive",
      title: "AAPL: ≥5% corporate action effective Oct 25 – Oct 30",
      source: "ERC-8056 stock token (Robinhood Chain mainnet)",
      availability: Availability.Pending,
      status: EventStatus.Open,
      opensAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
    },
  },
  {
    marketId: "0xb2221620dd6260079bf849dc5567adc3f2fdc321",
    eventId: "0x0600000000000000000000000000000000000000000000000000000000000006",
    creator: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    createdAt: BigInt(Math.floor(Date.now() / 1000) - 86400 * 4),
    tradingClosesAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 4),
    status: MarketStatus.Open,
    outcome: false,
    yesPool: 60000000000n, // $60,000 USDG
    noPool: 40000000000n,  // $40,000 USDG
    feeTaken: 0n,
    question: "Will Amazon (AMZN) Chainlink stock feed report price ≤ $180 at Friday market close?",
    event: {
      id: "0x0600000000000000000000000000000000000000000000000000000000000006",
      kind: "primitive",
      title: "AMZN ≤ $180 at Oct 22, 2026, 04:00 PM",
      source: "Chainlink price (Robinhood Chain mainnet)",
      availability: Availability.Pending,
      status: EventStatus.Open,
      opensAt: BigInt(Math.floor(Date.now() / 1000) + 86400 * 4),
    },
  },
];

/** Preview markets, clearly flagged. Used ONLY when no deployment exists for
 *  the configured chain — never as a fallback for failed or empty reads. */
export const MOCK_MARKETS: LiveMarket[] = MOCK_MARKETS_RAW.map((m) => ({ ...m, isExample: true }));

export const showingExamples = !deployment;

export function useMarkets() {
  const client = useNovakClient();
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "markets", deployment?.market],
    enabled: showingExamples || Boolean(client && pc),
    refetchInterval: showingExamples ? false : 20_000,
    queryFn: async (): Promise<LiveMarket[]> => {
      if (showingExamples) return MOCK_MARKETS;
      const markets = await client!.listMarkets();
      const withEvents = await Promise.all(
        markets.map(async (m) => ({ ...m, event: await loadEventNode(pc as PublicClient, m.eventId) })),
      );
      return withEvents.reverse(); // newest first
    },
  });
}

export function useMarket(marketId: Hex | undefined) {
  const client = useNovakClient();
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "market", marketId],
    enabled: Boolean(marketId) && (showingExamples || Boolean(client && pc)),
    refetchInterval: showingExamples ? false : 5_000,
    queryFn: async (): Promise<LiveMarket> => {
      if (showingExamples) {
        const match = MOCK_MARKETS.find((m) => m.marketId.toLowerCase() === marketId!.toLowerCase());
        if (!match) throw new Error("Unknown example market");
        return match;
      }
      const m = await client!.getMarket(marketId!);
      return { ...m, marketId: marketId!, event: await loadEventNode(pc as PublicClient, m.eventId) };
    },
  });
}

/** Every primitive event and composite, newest first. */
export function useEvents() {
  const client = useNovakClient();
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "events", deployment?.eventRegistry],
    enabled: showingExamples || Boolean(client && pc),
    refetchInterval: showingExamples ? false : 15_000,
    queryFn: async (): Promise<EventNode[]> => {
      if (showingExamples) return MOCK_MARKETS.map((m) => m.event);
      const created = await client!.listEvents(BigInt(deployment!.startBlock));
      const nodes = await Promise.all(created.map((e) => loadEventNode(pc as PublicClient, e.eventId)));
      return nodes.reverse();
    },
  });
}
