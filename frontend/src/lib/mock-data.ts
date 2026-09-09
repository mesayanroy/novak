import { CompositeOp, EventStatus } from "@novak/sdk";

/**
 * Example data for /markets and /markets/[id] — Market.sol has no
 * enumeration getter (only a keyed markets(marketId) lookup), so listing
 * "all markets" is structurally impossible without an indexer that doesn't
 * exist yet. Every consumer of this module must render <ExampleDataBadge />
 * next to it. Shaped identically to what a real read would return
 * (EventStatus, CompositeOp, hex ids) so swapping in live data later is a
 * drop-in replacement, not a reshape.
 *
 * The composite mirrors examples/end-to-end-flow.ts's canonical demo:
 * WITHIN(48h) over a rate-decision event and a price-threshold event.
 */

export interface MockPrimitiveEvent {
  id: `0x${string}`;
  title: string;
  sourceId: string;
  status: EventStatus;
  quorumThreshold: number;
  disputeTier?: 1 | 2;
}

export interface MockCompositeEvent {
  id: `0x${string}`;
  op: CompositeOp;
  operandIds: Array<`0x${string}`>;
  windowSeconds?: number;
  status: "Unresolved" | "True" | "False" | "Voided";
}

export interface MockMarket {
  id: `0x${string}`;
  compositeId: `0x${string}`;
  question: string;
  yesPoolEth: string;
  noPoolEth: string;
  settled: boolean;
  outcome?: boolean;
}

export const mockPrimitiveEvents: MockPrimitiveEvent[] = [
  {
    id: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
    title: "Fed holds rates in December 2026 FOMC meeting",
    sourceId: "example.rate-decision",
    status: EventStatus.Finalized,
    quorumThreshold: 2,
  },
  {
    id: "0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
    title: "ETH/USD closes above $5,000 by December 2026",
    sourceId: "example.price-feed",
    status: EventStatus.Finalized,
    quorumThreshold: 3,
  },
  {
    id: "0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d",
    title: "Novak governance forum reaches quorum on Issue #21",
    sourceId: "example.governance-vote",
    status: EventStatus.Disputed,
    quorumThreshold: 2,
    disputeTier: 1,
  },
];

export const mockCompositeEvent: MockCompositeEvent = {
  id: "0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e",
  op: CompositeOp.Within,
  operandIds: [mockPrimitiveEvents[0].id, mockPrimitiveEvents[1].id],
  windowSeconds: 48 * 60 * 60,
  status: "True",
};

export const mockMarkets: MockMarket[] = [
  {
    id: "0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f",
    compositeId: mockCompositeEvent.id,
    question: "Fed holds AND ETH > $5,000, both within 48h of each other",
    yesPoolEth: "3.40",
    noPoolEth: "1.15",
    settled: true,
    outcome: true,
  },
  {
    id: "0x6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a",
    compositeId: mockPrimitiveEvents[2].id,
    question: "Novak Issue #21 passes governance",
    yesPoolEth: "0.80",
    noPoolEth: "0.80",
    settled: false,
  },
];

export function findMockMarket(id: string): MockMarket | undefined {
  return mockMarkets.find((m) => m.id.toLowerCase() === id.toLowerCase());
}

export function findMockPrimitiveEvent(id: string): MockPrimitiveEvent | undefined {
  return mockPrimitiveEvents.find((e) => e.id.toLowerCase() === id.toLowerCase());
}
