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
  eventBusAbi,
  eventComposerAbi,
  eventRegistryAbi,
  sourceName,
  type EventSpecInput,
  type Hex,
  type MarketDef,
} from "@novak/sdk";
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

/** Human-readable title + source label for a primitive event's on-chain spec. */
export function describeSpec(spec: EventSpecInput): { title: string; source: string } {
  const name = sourceName(spec.sourceId);
  try {
    if (name === SOURCES.priceAt) {
      const s = decodePriceAtSpec(spec.spec);
      const t = tickerFor(s.feed, CHAINLINK_FEEDS_MAINNET);
      const cmp = s.comparator === Comparator.Gte ? "≥" : "≤";
      return {
        title: `${t} ${cmp} $${(Number(s.threshold) / 1e8).toLocaleString()} at ${fmtTime(s.at)}`,
        source: "Chainlink price (Robinhood Chain mainnet)",
      };
    }
    if (name === SOURCES.corporateAction) {
      const s = decodeCorporateActionSpec(spec.spec);
      const t = tickerFor(s.stockToken, STOCK_TOKENS_MAINNET);
      const what = s.minChangeBps >= 5_000 ? "split-size" : s.minChangeBps > 0 ? `≥${s.minChangeBps / 100}%` : "any";
      return {
        title: `${t}: ${what} corporate action effective ${fmtTime(s.windowStart)} – ${fmtTime(s.windowEnd)}`,
        source: "ERC-8056 stock token (Robinhood Chain mainnet)",
      };
    }
    if (name === SOURCES.tradingStatus) {
      const s = decodeTradingStatusSpec(spec.spec);
      return { title: `${s.symbol} NOT tradable (${SESSION_LABEL[s.session]})`, source: "Robinhood asset registry" };
    }
  } catch {
    /* malformed spec — fall through */
  }
  return { title: `Custom event (${spec.sourceId.slice(0, 10)}…)`, source: "custom source" };
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
}

export async function loadEventNode(pc: PublicClient, id: Hex, depth = 0): Promise<EventNode> {
  const availability = Number(
    await pc.readContract({ address: novakAddresses.eventBus, abi: eventBusAbi, functionName: "getAvailability", args: [id] }),
  ) as Availability;
  const status = Number(
    await pc.readContract({ address: novakAddresses.eventRegistry, abi: eventRegistryAbi, functionName: "getEvent", args: [id] }),
  ) as EventStatus;

  if (status !== EventStatus.None) {
    const spec = (await pc.readContract({
      address: novakAddresses.eventRegistry,
      abi: eventRegistryAbi,
      functionName: "getEventSpec",
      args: [id],
    })) as EventSpecInput;
    const d = describeSpec(spec);
    return { id, kind: "primitive", title: d.title, source: d.source, availability, status, spec, opensAt: spec.openTimestamp };
  }

  const cs = await pc.readContract({
    address: novakAddresses.eventComposer,
    abi: eventComposerAbi,
    functionName: "getCompositeSpec",
    args: [id],
  });
  const cStatus = Number(
    await pc.readContract({ address: novakAddresses.eventComposer, abi: eventComposerAbi, functionName: "getStatus", args: [id] }),
  );
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
}

export const MOCK_MARKETS: LiveMarket[] = [
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

export function useMarkets() {
  const client = useNovakClient();
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "markets", deployment?.market],
    refetchInterval: 10_000,
    queryFn: async (): Promise<LiveMarket[]> => {
      try {
        if (!client || !pc) return MOCK_MARKETS;
        const markets = await client.listMarkets();
        if (!markets || markets.length === 0) return MOCK_MARKETS;
        const withEvents = await Promise.all(
          markets.map(async (m) => ({ ...m, event: await loadEventNode(pc as PublicClient, m.eventId) })),
        );
        return withEvents.reverse();
      } catch {
        return MOCK_MARKETS;
      }
    },
  });
}

export function useMarket(marketId: Hex | undefined) {
  const client = useNovakClient();
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "market", marketId],
    refetchInterval: 5_000,
    queryFn: async (): Promise<LiveMarket> => {
      try {
        if (!client || !pc || !marketId) {
          const match = MOCK_MARKETS.find(
            (m) => m.marketId.toLowerCase() === (marketId ?? "").toLowerCase()
          );
          return match ?? MOCK_MARKETS[0];
        }
        const m = await client.getMarket(marketId);
        if (!m || m.createdAt === 0n) {
          const match = MOCK_MARKETS.find(
            (mk) => mk.marketId.toLowerCase() === marketId.toLowerCase()
          );
          return match ?? MOCK_MARKETS[0];
        }
        return { ...m, marketId, event: await loadEventNode(pc as PublicClient, m.eventId) };
      } catch {
        const match = MOCK_MARKETS.find(
          (m) => m.marketId.toLowerCase() === (marketId ?? "").toLowerCase()
        );
        return match ?? MOCK_MARKETS[0];
      }
    },
  });
}

/** Every primitive event and composite, newest first. */
export function useEvents() {
  const client = useNovakClient();
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "events", deployment?.eventRegistry],
    refetchInterval: 15_000,
    queryFn: async (): Promise<EventNode[]> => {
      try {
        if (!client || !pc || !deployment) return MOCK_MARKETS.map((m) => m.event);
        const created = await client.listEvents(BigInt(deployment.startBlock));
        if (!created || created.length === 0) return MOCK_MARKETS.map((m) => m.event);
        const nodes = await Promise.all(created.map((e) => loadEventNode(pc as PublicClient, e.eventId)));
        return nodes.reverse();
      } catch {
        return MOCK_MARKETS.map((m) => m.event);
      }
    },
  });
}
