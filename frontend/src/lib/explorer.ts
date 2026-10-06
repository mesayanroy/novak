"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { decodeEventLog, type Address, type Log, type PublicClient } from "viem";
import {
  Comparator,
  decodeCorporateActionSpec,
  decodeFedRateSpec,
  decodeOutcome,
  decodePriceAtSpec,
  decodeTradingStatusSpec,
  disputeManagerAbi,
  eventComposerAbi,
  eventRegistryAbi,
  feedByAddress,
  SOURCES,
  sourceName,
  STOCK_TOKENS_MAINNET,
  stockLendingGuardAbi,
  type EventSpecInput,
  type Hex,
} from "@novakoracle/sdk";
import { deployment, novakAddresses } from "./addresses";
import { fmtTime, type LiveMarket } from "./novak";
import type { DistributionView } from "./distribution";

/* ------------------------------------------------------------------ */
/* Resolver network HTTP (the backend, e.g. the Render service)        */
/* ------------------------------------------------------------------ */

/** Base URL of the resolver service (render.yaml): /health, /evidence/:hash. */
export const RESOLVER_URL = (process.env.NEXT_PUBLIC_RESOLVER_URL ?? "").replace(/\/$/, "");

export interface NodeHealth {
  id?: string;
  resolverId?: string;
  address?: Address;
  authorized?: boolean;
  keeper?: boolean;
  lastLoopAt?: string | null;
  scannedToBlock?: string | number;
  events?: number;
  composites?: number;
  submissions?: number;
  votes?: number;
  keeperActions?: number;
  rewardClaims?: number;
  evidenceRecords?: number;
  restarts?: number;
  lastError?: string;
  error?: string;
  balanceWei?: string;
  minBalanceWei?: string;
  lowBalance?: boolean;
}

/** Works with the multi-node service ({ nodes: [...] }) and a single node (flat object). */
export function useResolverHealth() {
  return useQuery({
    queryKey: ["resolver-health", RESOLVER_URL],
    enabled: Boolean(RESOLVER_URL),
    refetchInterval: 10_000,
    retry: 1,
    queryFn: async (): Promise<NodeHealth[]> => {
      const r = await fetch(`${RESOLVER_URL}/health`, { cache: "no-store" });
      if (!r.ok) throw new Error(`resolver service HTTP ${r.status}`);
      const j = await r.json();
      return Array.isArray(j.nodes) ? j.nodes : [j];
    },
  });
}

export function useEvidence(hash: Hex | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["evidence", RESOLVER_URL, hash],
    enabled: Boolean(RESOLVER_URL && hash && enabled),
    staleTime: Infinity,
    retry: 0,
    queryFn: async () => {
      const r = await fetch(`${RESOLVER_URL}/evidence/${hash}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as Record<string, unknown>;
    },
  });
}

/* ------------------------------------------------------------------ */
/* Resolver labels (r1, r2, r3 … in authorization order)               */
/* ------------------------------------------------------------------ */

export function useResolverList() {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "resolvers", novakAddresses.eventRegistry],
    enabled: Boolean(pc && deployment),
    staleTime: 60_000,
    queryFn: async () =>
      [...((await pc!.readContract({ address: novakAddresses.eventRegistry, abi: eventRegistryAbi, functionName: "getAuthorizedResolvers" })) as readonly Address[])],
  });
}

export const labelFor = (list: Address[] | undefined, a: Address | undefined) => {
  if (!a) return "—";
  const i = list?.findIndex((r) => r.toLowerCase() === a.toLowerCase()) ?? -1;
  return i >= 0 ? `r${i + 1}` : `${a.slice(0, 6)}…${a.slice(-4)}`;
};

/* ------------------------------------------------------------------ */
/* Spec, in plain language                                             */
/* ------------------------------------------------------------------ */

const tickerOf = (addr: string, table: Record<string, string>) =>
  Object.entries(table).find(([, a]) => a.toLowerCase() === addr.toLowerCase())?.[0] ?? `${addr.slice(0, 8)}…`;
const SESSIONS = ["regular market hours", "extended hours", "overnight"];

export function specRows(spec: EventSpecInput): [string, string][] {
  const rows: [string, string][] = [];
  const name = sourceName(spec.sourceId);
  rows.push(["Source", name ?? `${spec.sourceId.slice(0, 10)}… (custom)`]);
  try {
    if (name === SOURCES.priceAt) {
      const s = decodePriceAtSpec(spec.spec);
      const f = feedByAddress(s.feed);
      rows.push(["Asks", `Is ${f?.symbol ?? "the feed"} ${s.comparator === Comparator.Gte ? "at or above" : "at or below"} $${(Number(s.threshold) / 10 ** (f?.decimals ?? 8)).toLocaleString()}?`]);
      rows.push(["Chainlink feed", `${f?.name ?? ""} ${s.feed}`.trim()]);
      rows.push(["Measured at", `${fmtTime(s.at)} (the round in effect then)`]);
      rows.push(["Staleness limit", `${Math.round(Number(s.maxStaleness) / 3600)} h — older rounds make resolvers abstain`]);
    } else if (name === SOURCES.corporateAction) {
      const s = decodeCorporateActionSpec(spec.spec);
      rows.push(["Asks", `Did ${tickerOf(s.stockToken, STOCK_TOKENS_MAINNET)} have a multiplier change of ${s.minChangeBps ? `≥ ${s.minChangeBps / 100}%` : "any size"} take effect in the window?`]);
      rows.push(["Stock token", s.stockToken]);
      rows.push(["Window", `${fmtTime(s.windowStart)} → ${fmtTime(s.windowEnd)}`]);
    } else if (name === SOURCES.tradingStatus) {
      const s = decodeTradingStatusSpec(spec.spec);
      rows.push(["Asks", `Is ${s.symbol} NOT tradable in ${SESSIONS[s.session] ?? "that session"} when observed?`]);
    } else if (name === SOURCES.fedRate) {
      const s = decodeFedRateSpec(spec.spec);
      rows.push(["Asks", `Is the Fed funds upper bound ${s.comparator === Comparator.Gte ? "≥" : "≤"} ${(s.upperBoundBps / 100).toFixed(2)}% on ${new Date(Number(s.date) * 1000).toISOString().slice(0, 10)}?`]);
      rows.push(["Data", "FRED DFEDTARU (St. Louis Fed)"]);
    }
  } catch {
    rows.push(["Spec", "could not decode"]);
  }
  rows.push(["Observation window", `${fmtTime(spec.openTimestamp)} → ${fmtTime(spec.observationDeadline)}`]);
  rows.push(["Quorum", `${spec.quorumThreshold} identical answers`]);
  rows.push(["Dispute window", `${Math.round(Number(spec.disputeWindowSeconds) / 60)} minutes after quorum`]);
  rows.push(["Payload", spec.specVersion >= 2 ? "v2 · (bool outcome, uint64 occurredAt)" : "v1 · bool outcome"]);
  return rows;
}

/* ------------------------------------------------------------------ */
/* Timeline from on-chain logs                                          */
/* ------------------------------------------------------------------ */

export type TimelineKind = "created" | "observation" | "proposed" | "dispute" | "tier" | "vote" | "converged" | "escalated" | "voided" | "finalized" | "expired" | "composite";

export interface TimelineItem {
  kind: TimelineKind;
  title: string;
  detail?: string;
  actor?: Address;
  tone: "violet" | "emerald" | "rose" | "gray" | "amber";
  time?: number;
  tx: Hex;
  block: bigint;
  logIndex: number;
  evidenceHash?: Hex;
}

const ABI = [...eventRegistryAbi, ...disputeManagerAbi, ...eventComposerAbi].filter((x) => x.type === "event");
const CHUNK = 450_000n;

async function logsFor(pc: PublicClient, eventId: Hex): Promise<Log[]> {
  const d = deployment!;
  const latest = await pc.getBlockNumber();
  const out: Log[] = [];
  for (let from = BigInt(d.startBlock); from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
    const logs = (await pc.request({
      method: "eth_getLogs",
      params: [
        {
          address: [d.eventRegistry, d.disputeManager, d.eventComposer],
          topics: [null, eventId],
          fromBlock: `0x${from.toString(16)}`,
          toBlock: `0x${to.toString(16)}`,
        },
      ],
    } as never)) as Log[];
    out.push(...logs);
  }
  return out;
}

export function useEventTimeline(eventId: Hex | undefined) {
  const pc = usePublicClient();
  const { data: resolvers } = useResolverList();
  return useQuery({
    queryKey: ["novak", "timeline", eventId, resolvers?.length],
    enabled: Boolean(pc && eventId && deployment),
    refetchInterval: 15_000,
    queryFn: async (): Promise<TimelineItem[]> => {
      const raw = await logsFor(pc as PublicClient, eventId!);
      const blocks = [...new Set(raw.map((l) => l.blockNumber!))];
      const times = new Map<bigint, number>();
      await Promise.all(blocks.map(async (b) => times.set(b, Number((await pc!.getBlock({ blockNumber: b })).timestamp))));
      const L = (a?: Address) => labelFor(resolvers, a);
      const items: TimelineItem[] = [];
      for (const log of raw) {
        let ev: { eventName: string; args: Record<string, unknown> };
        try {
          ev = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] }) as typeof ev;
        } catch {
          continue;
        }
        const a = ev.args;
        const base = { tx: log.transactionHash!, block: log.blockNumber!, logIndex: log.logIndex!, time: times.get(log.blockNumber!) };
        switch (ev.eventName) {
          case "EventCreated":
            items.push({ ...base, kind: "created", tone: "gray", title: "Event created", detail: `spec v${a.specVersion}` });
            break;
          case "ObservationSubmitted":
            items.push({
              ...base,
              kind: "observation",
              tone: "violet",
              title: `${L(a.resolver as Address)} observed`,
              actor: a.resolver as Address,
              detail: `answer hash ${(a.outcomeHash as Hex).slice(0, 10)}…`,
              evidenceHash: a.evidenceHash as Hex,
            });
            break;
          case "OutcomeProposed":
            items.push({ ...base, kind: "proposed", tone: "violet", title: "Quorum reached — outcome proposed", detail: `the dispute window opens`, actor: a.proposer as Address });
            break;
          case "DisputeFiled":
            items.push({ ...base, kind: "dispute", tone: "rose", title: `Disputed by ${L(a.disputer as Address)}`, detail: `bond ${Number(a.bond as bigint) / 1e18} ETH`, actor: a.disputer as Address });
            break;
          case "NonConvergenceEscalated":
            items.push({ ...base, kind: "dispute", tone: "amber", title: "Split quorum sent to a committee" });
            break;
          case "SeedingStarted":
            items.push({ ...base, kind: "tier", tone: "violet", title: `Tier ${a.tier} committee draw opened (commit-reveal)`, detail: `commit until ${fmtTime(a.commitDeadline as bigint)} · reveal until ${fmtTime(a.revealDeadline as bigint)}` });
            break;
          case "SeedCommitted":
            items.push({ ...base, kind: "tier", tone: "gray", title: `${L(a.resolver as Address)} committed a salt`, actor: a.resolver as Address });
            break;
          case "SeedRevealed":
            items.push({ ...base, kind: "tier", tone: "gray", title: `${L(a.resolver as Address)} revealed its salt`, actor: a.resolver as Address });
            break;
          case "TierOpened":
            items.push({ ...base, kind: "tier", tone: "violet", title: `Tier ${a.tier} committee drawn`, detail: `${(a.committee as Address[]).map(L).join(", ")} · until ${fmtTime(a.deadline as bigint)}` });
            break;
          case "TierVoteSubmitted":
            items.push({ ...base, kind: "vote", tone: a.outcome ? "emerald" : "rose", title: `${L(a.member as Address)} voted ${a.outcome ? "TRUE" : "FALSE"}`, detail: `Tier ${a.tier}`, actor: a.member as Address });
            break;
          case "TierConverged":
            items.push({ ...base, kind: "converged", tone: "emerald", title: `Tier ${a.tier} reached 66% → ${a.outcome ? "TRUE" : "FALSE"}` });
            break;
          case "TierEscalated":
            items.push({ ...base, kind: "escalated", tone: "amber", title: `No 66% — escalated to Tier ${a.toTier}` });
            break;
          case "DisputeVoided":
          case "CompositeEventVoided":
            items.push({ ...base, kind: "voided", tone: "rose", title: "Voided — markets refund" });
            break;
          case "EventFinalized":
            items.push({ ...base, kind: "finalized", tone: "emerald", title: "Finalized", detail: "readable by every market through the EventBus" });
            break;
          case "EventStatusChanged":
            if (Number(a.current) === 7) items.push({ ...base, kind: "expired", tone: "gray", title: "Expired — nobody observed it in time" });
            break;
          case "CompositeEventCreated":
            items.push({ ...base, kind: "composite", tone: "gray", title: "Composite created", detail: `${(a.operands as Hex[]).length} operands` });
            break;
          case "CompositeEventResolved":
            items.push({ ...base, kind: "finalized", tone: "emerald", title: `Composite resolved → ${a.outcome ? "TRUE" : "FALSE"}` });
            break;
        }
      }
      // Several steps share one transaction (e.g. dispute() opens Tier 1 in the same tx;
      // the deciding vote finalizes in the same tx) — order those by meaning, not log index.
      const RANK: Record<TimelineKind, number> = { created: 0, composite: 0, observation: 1, proposed: 2, dispute: 3, tier: 4, vote: 5, converged: 6, escalated: 6, voided: 7, finalized: 8, expired: 8 };
      return items.sort((x, y) =>
        x.block !== y.block ? (x.block < y.block ? -1 : 1) : x.tx === y.tx && RANK[x.kind] !== RANK[y.kind] ? RANK[x.kind] - RANK[y.kind] : x.logIndex - y.logIndex,
      );
    },
  });
}

/** The outcome a resolver submitted, decoded from its observation (Registry.observedOutcome). */
export const decodeAnswer = (data: Hex) => decodeOutcome(data);

/* ------------------------------------------------------------------ */
/* Who uses this event                                                  */
/* ------------------------------------------------------------------ */

const treeHas = (node: { id: Hex; children?: { id: Hex; children?: unknown[] }[] }, id: Hex): boolean =>
  node.id.toLowerCase() === id.toLowerCase() || Boolean(node.children?.some((c) => treeHas(c as never, id)));

export function usedBy(id: Hex, markets: LiveMarket[] | undefined, dists: DistributionView[] | undefined) {
  return {
    markets: (markets ?? []).filter((m) => !m.isExample && treeHas(m.event, id)),
    ranges: (dists ?? []).filter((d) => d.boundaries.some((b) => b.id.toLowerCase() === id.toLowerCase())),
  };
}

export function useGuardRules(id: Hex | undefined) {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["novak", "guardRules", id],
    enabled: Boolean(pc && id && deployment?.stockLendingGuard),
    queryFn: async () => {
      const out: { ticker: string; token: Address; pauseFrom: bigint; pauseUntil: bigint; failClosed: boolean }[] = [];
      for (const [ticker, token] of Object.entries(STOCK_TOKENS_MAINNET)) {
        const rules = (await pc!.readContract({
          address: deployment!.stockLendingGuard,
          abi: stockLendingGuardAbi,
          functionName: "getRiskRules",
          args: [token as Address],
        })) as readonly { eventId: Hex; pauseFrom: bigint; pauseUntil: bigint; failClosed: boolean }[];
        for (const r of rules) if (r.eventId.toLowerCase() === id!.toLowerCase()) out.push({ ticker, token: token as Address, ...r });
      }
      return out;
    },
  });
}
