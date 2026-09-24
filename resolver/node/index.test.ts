import { describe, expect, it } from "vitest";
import { TradingSession, encodeTradingStatusSpec, type EventSpecInput } from "@novak/sdk";
import { evaluateQuorum, evaluateEscalationQuorum } from "../consensus/quorum.js";
import { buildEvidence, hashEvidence, EvidenceStore } from "../evidence/evidence.js";
import { changeBps, decideCorporateAction, type MultiplierChange } from "../adapters/corporateAction.js";
import { TradingStatusAdapter } from "../adapters/tradingStatus.js";

describe("quorum", () => {
  it("reaches quorum when enough observations agree", () => {
    const result = evaluateQuorum([{ outcome: true }, { outcome: true }], 2);
    expect(result.reached).toBe(true);
    expect(result.agreedOutcomeData).toBe(true);
    expect(result.agreeingCount).toBe(2);
  });

  it("does not reach quorum below the threshold", () => {
    expect(evaluateQuorum([{ outcome: true }, { outcome: false }], 2).reached).toBe(false);
  });

  it("counts true/false votes independently", () => {
    const result = evaluateQuorum([{ outcome: true }, { outcome: false }, { outcome: false }], 2);
    expect(result.reached).toBe(true);
    expect(result.agreedOutcomeData).toBe(false);
  });
});

describe("escalation quorum (DisputeManager Tier-1/Tier-2 mirror)", () => {
  it("reaches 66% agreement against the committee size, not the vote count", () => {
    const votes = [
      { member: "0xA", outcome: true },
      { member: "0xB", outcome: true },
    ];
    expect(evaluateEscalationQuorum(votes, 3).reached).toBe(true);
  });

  it("does not reach quorum below 66% of committee size even with unanimous participants", () => {
    const votes = [
      { member: "0xA", outcome: true },
      { member: "0xB", outcome: true },
    ];
    expect(evaluateEscalationQuorum(votes, 7).reached).toBe(false);
  });
});

describe("evidence", () => {
  const obs = { outcome: true, occurredAt: 1_788_998_430n, rawEvidence: { answer: 22440881781n } };

  it("is deterministic and bigint-safe (two honest resolvers -> same hash)", () => {
    const a = buildEvidence("0xabc", "chainlink.price-at.v1", obs);
    const b = buildEvidence("0xabc", "chainlink.price-at.v1", { ...obs, rawEvidence: { answer: 22440881781n } });
    expect(hashEvidence(a)).toBe(hashEvidence(b));
  });

  it("stores and serves records by hash", () => {
    const store = new EvidenceStore();
    const hash = store.put(buildEvidence("0xabc", "x", obs));
    expect(store.get(hash)?.occurredAt).toBe("1788998430");
  });
});

describe("rh.corporate-action decision", () => {
  const ONE = 10n ** 18n;
  // The real NVDA dividend-reinvestment update seen on mainnet (block 58952659).
  const nvdaDividend: MultiplierChange = {
    oldMultiplier: ONE,
    newMultiplier: 1_000_775_159_164_630_595n,
    effectiveAt: 1_788_998_430n,
    scheduledAt: 1_788_997_800n,
    blockNumber: 58_952_659n,
    txHash: "0x01",
  };
  const window = { windowStart: 1_788_900_000n, windowEnd: 1_789_100_000n };

  it("computes change in bps", () => {
    expect(changeBps(ONE, 2n * ONE)).toBe(10_000n); // 2:1 split
    expect(changeBps(ONE, nvdaDividend.newMultiplier)).toBe(7n); // ~0.0775%
  });

  it("true with occurredAt = effectiveAt once a qualifying change took effect", () => {
    const d = decideCorporateAction([nvdaDividend], { ...window, minChangeBps: 0 }, 1_789_000_000n);
    expect(d).toMatchObject({ outcome: true, occurredAt: nvdaDividend.effectiveAt });
  });

  it("a dividend does not count as a split (minChangeBps filter)", () => {
    expect(decideCorporateAction([nvdaDividend], { ...window, minChangeBps: 5_000 }, 1_789_000_000n)).toBeNull();
    const after = decideCorporateAction([nvdaDividend], { ...window, minChangeBps: 5_000 }, window.windowEnd + 61n);
    expect(after).toMatchObject({ outcome: false, occurredAt: window.windowEnd });
  });

  it("abstains while a scheduled change hasn't taken effect yet", () => {
    expect(decideCorporateAction([nvdaDividend], { ...window, minChangeBps: 0 }, nvdaDividend.effectiveAt - 1n)).toBeNull();
  });

  it("a later schedule supersedes an earlier pending one", () => {
    const cancelled: MultiplierChange = { ...nvdaDividend, newMultiplier: 2n * ONE, effectiveAt: 1_789_050_000n };
    const replacement: MultiplierChange = {
      ...nvdaDividend,
      oldMultiplier: ONE,
      newMultiplier: ONE,
      effectiveAt: 1_789_060_000n,
      scheduledAt: 1_789_010_000n, // lands before `cancelled` took effect
    };
    const d = decideCorporateAction([cancelled, replacement], { ...window, minChangeBps: 5_000 }, window.windowEnd + 61n);
    expect(d).toMatchObject({ outcome: false });
  });
});

describe("rh.trading-status adapter", () => {
  const spec = (session: TradingSession): EventSpecInput => ({
    specVersion: 1,
    sourceId: "0x00",
    openTimestamp: 0n,
    observationDeadline: 0n,
    disputeWindowSeconds: 0n,
    quorumThreshold: 1,
    spec: encodeTradingStatusSpec({ symbol: "NVDA", session }),
  });
  const assets = async () => [
    {
      tokenSymbol: "NVDA",
      status: "ASSET_STATUS_ACTIVE",
      deployments: [{ contractAddress: "0xd060", chainId: 4663 }],
      tradingCapabilities: {
        market: { whole: "TRADING_STATUS_TRADABLE" },
        overnight: { whole: "TRADING_STATUS_UNTRADABLE" },
      },
    },
  ];

  it("reports NOT tradable as outcome=true", async () => {
    const a = new TradingStatusAdapter(assets);
    expect((await a.observe({ eventId: "0x1", spec: spec(TradingSession.Overnight), now: 5n }))?.outcome).toBe(true);
    expect((await a.observe({ eventId: "0x1", spec: spec(TradingSession.Market), now: 5n }))?.outcome).toBe(false);
  });

  it("abstains when the source is down or the session is unknown", async () => {
    const down = new TradingStatusAdapter(async () => {
      throw new Error("503");
    });
    expect(await down.observe({ eventId: "0x1", spec: spec(TradingSession.Market), now: 5n })).toBeNull();
    const a = new TradingStatusAdapter(assets);
    expect(await a.observe({ eventId: "0x1", spec: spec(TradingSession.Extended), now: 5n })).toBeNull();
  });
});
