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
        ? // wagmi's client types are a superset of viem's; NovakClient only uses the shared surface.
          new NovakClient(publicClient as never, walletClient as never, novakAddresses)
        : undefined,
    [publicClient, walletClient],
  );
}

export interface LiveMarket extends MarketDef {
  marketId: Hex;
  event: EventNode;
}

export function useMarkets() {
  const client = useNovakClient();
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "markets", deployment?.market],
    enabled: Boolean(client && pc),
    refetchInterval: 10_000,
    queryFn: async (): Promise<LiveMarket[]> => {
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
    enabled: Boolean(client && pc && marketId),
    refetchInterval: 5_000,
    queryFn: async (): Promise<LiveMarket> => {
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
    enabled: Boolean(client && pc && deployment),
    refetchInterval: 15_000,
    queryFn: async (): Promise<EventNode[]> => {
      const created = await client!.listEvents(BigInt(deployment!.startBlock));
      const nodes = await Promise.all(created.map((e) => loadEventNode(pc as PublicClient, e.eventId)));
      return nodes.reverse();
    },
  });
}
