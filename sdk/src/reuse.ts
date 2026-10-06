import { Comparator, SOURCES, decodePriceAtSpec, sourceId } from "./sources.js";
import type { Address, EventSpecInput, Hex } from "./types.js";

/**
 * Reuse before you create. A Novak event is resolved, disputed and finalized
 * ONCE and then read by any number of markets — so the cheapest, most
 * liquid-friendly integration is to point your market at an event that
 * already exists. These helpers do the matching; `NovakClient.findMatchingEvents`
 * / `findPriceLadder` feed them from chain.
 */

export interface KnownEvent {
  eventId: Hex;
  spec: EventSpecInput;
  /** Registry `EventStatus` (1 Open … 5 Finalized, 6 Voided, 7 Expired). */
  status: number;
  blockNumber: bigint;
}

/** What has to match for two events to be "the same question". */
export interface EventMatch {
  sourceId: Hex;
  spec: Hex;
  specVersion?: number;
  /** Only events nobody has decided yet (a new market can still trade on them). Default false. */
  onlyOpen?: boolean;
  /** Reject events whose observation deadline is sooner than this (unix seconds). */
  minObservationDeadline?: bigint;
}

const OPEN_STATUSES = new Set([1, 2, 3]); // Open, ObservationsSubmitted, ProposedOutcome

export const isUndecided = (status: number) => OPEN_STATUSES.has(status);

/** Same source, same spec bytes (and version, if given): the same real-world question. */
export function matchesEvent(e: KnownEvent, m: EventMatch): boolean {
  if (e.spec.sourceId.toLowerCase() !== m.sourceId.toLowerCase()) return false;
  if (e.spec.spec.toLowerCase() !== m.spec.toLowerCase()) return false;
  if (m.specVersion !== undefined && e.spec.specVersion !== m.specVersion) return false;
  if (m.onlyOpen && !isUndecided(e.status)) return false;
  if (m.minObservationDeadline !== undefined && e.spec.observationDeadline < m.minObservationDeadline) return false;
  return true;
}

/** Best first: undecided before decided, then the most-quorum'd, then the oldest (most likely already referenced). */
export function rankMatches(events: KnownEvent[]): KnownEvent[] {
  return [...events].sort((a, b) => {
    const open = Number(isUndecided(b.status)) - Number(isUndecided(a.status));
    if (open) return open;
    const q = b.spec.quorumThreshold - a.spec.quorumThreshold;
    if (q) return q;
    return a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : 0;
  });
}

export interface LadderRung {
  eventId: Hex;
  threshold: bigint;
  status: number;
}

export interface LadderQuery {
  /** Chainlink feed on Robinhood Chain mainnet (see CHAINLINK_FEEDS_MAINNET). */
  feed: Address;
  /** Evaluation time T of the ladder. */
  at: bigint;
  onlyOpen?: boolean;
}

/**
 * Every "feed ≥ X at T" event for one (feed, T), one per threshold, ascending —
 * the boundary set of a range market. Pass `rungs.map(r => r.eventId)` straight
 * to DistributionMarket.createMarket or NovakCTFAdapter.prepareRange.
 * Duplicate thresholds keep the best-ranked event.
 */
export function selectPriceLadder(events: KnownEvent[], q: LadderQuery): LadderRung[] {
  const priceAt = sourceId(SOURCES.priceAt).toLowerCase();
  const byThreshold = new Map<bigint, KnownEvent>();
  for (const e of rankMatches(events)) {
    if (e.spec.sourceId.toLowerCase() !== priceAt) continue;
    if (q.onlyOpen && !isUndecided(e.status)) continue;
    let s;
    try {
      s = decodePriceAtSpec(e.spec.spec);
    } catch {
      continue;
    }
    if (s.feed.toLowerCase() !== q.feed.toLowerCase() || s.at !== q.at || s.comparator !== Comparator.Gte) continue;
    if (!byThreshold.has(s.threshold)) byThreshold.set(s.threshold, e);
  }
  return [...byThreshold.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([threshold, e]) => ({ eventId: e.eventId, threshold, status: e.status }));
}

/**
 * Splits a desired ladder into rungs that already exist (reuse them) and
 * thresholds you still need to create — so a new range market only pays for
 * the boundaries nobody has asked about yet.
 */
export function planLadder(existing: LadderRung[], thresholds: bigint[]): { reuse: LadderRung[]; create: bigint[] } {
  const have = new Map(existing.map((r) => [r.threshold, r]));
  const reuse: LadderRung[] = [];
  const create: bigint[] = [];
  for (const t of thresholds) {
    const r = have.get(t);
    if (r) reuse.push(r);
    else create.push(t);
  }
  return { reuse, create };
}
