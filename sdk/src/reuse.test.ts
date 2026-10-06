import { describe, expect, it } from "vitest";
import { Comparator, SOURCES, encodePriceAtSpec, sourceId } from "./sources.js";
import { matchesEvent, planLadder, rankMatches, selectPriceLadder, type KnownEvent } from "./reuse.js";
import type { Hex } from "./types.js";

const FEED = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;
const T = 1_800_000_000n;

let n = 0;
function ev(threshold: bigint, opts: { feed?: `0x${string}`; at?: bigint; status?: number; quorum?: number; block?: bigint; cmp?: Comparator } = {}): KnownEvent {
  n++;
  return {
    eventId: `0x${n.toString(16).padStart(64, "0")}` as Hex,
    status: opts.status ?? 1,
    blockNumber: opts.block ?? BigInt(n),
    spec: {
      specVersion: 2,
      sourceId: sourceId(SOURCES.priceAt),
      openTimestamp: T,
      observationDeadline: T + 86_400n,
      disputeWindowSeconds: 600n,
      quorumThreshold: opts.quorum ?? 2,
      spec: encodePriceAtSpec({ feed: opts.feed ?? FEED, threshold, comparator: opts.cmp ?? Comparator.Gte, at: opts.at ?? T, maxStaleness: 3600n }),
    },
  };
}

describe("reuse", () => {
  it("matches only the same source + spec bytes", () => {
    const a = ev(200_00000000n);
    expect(matchesEvent(a, { sourceId: a.spec.sourceId, spec: a.spec.spec })).toBe(true);
    expect(matchesEvent(a, { sourceId: a.spec.sourceId, spec: ev(210_00000000n).spec.spec })).toBe(false);
    expect(matchesEvent(a, { sourceId: sourceId(SOURCES.tradingStatus), spec: a.spec.spec })).toBe(false);
    expect(matchesEvent(a, { sourceId: a.spec.sourceId, spec: a.spec.spec, specVersion: 1 })).toBe(false);
  });

  it("onlyOpen filters decided events and ranking puts undecided first", () => {
    const done = ev(200_00000000n, { status: 5, block: 1n });
    const open = ev(200_00000000n, { status: 1, block: 9n });
    expect(matchesEvent(done, { sourceId: done.spec.sourceId, spec: done.spec.spec, onlyOpen: true })).toBe(false);
    expect(rankMatches([done, open])[0].eventId).toBe(open.eventId);
  });

  it("selects an ascending, de-duplicated ladder for one (feed, T)", () => {
    const rungs = selectPriceLadder(
      [ev(220_00000000n), ev(200_00000000n), ev(210_00000000n), ev(210_00000000n, { quorum: 3 }), ev(205_00000000n, { feed: OTHER }), ev(215_00000000n, { at: T + 1n }), ev(190_00000000n, { cmp: Comparator.Lte })],
      { feed: FEED, at: T },
    );
    expect(rungs.map((r) => r.threshold)).toEqual([200_00000000n, 210_00000000n, 220_00000000n]);
  });

  it("plans which boundaries to reuse and which to create", () => {
    const rungs = selectPriceLadder([ev(200_00000000n), ev(220_00000000n)], { feed: FEED, at: T });
    const plan = planLadder(rungs, [200_00000000n, 210_00000000n, 220_00000000n, 230_00000000n]);
    expect(plan.reuse.map((r) => r.threshold)).toEqual([200_00000000n, 220_00000000n]);
    expect(plan.create).toEqual([210_00000000n, 230_00000000n]);
  });
});
