import { describe, expect, it } from "vitest";
import { Availability, CompositeOp, EventStatus, MarketStatus } from "./types.js";
import {
  eventBusAbi,
  eventRegistryAbi,
  disputeManagerAbi,
  marketAbi,
  stockLendingGuardAbi,
  distributionMarketAbi,
  treasuryVaultAbi,
} from "./abis.js";
import {
  encodeBoolOutcome,
  decodeBoolOutcome,
  encodeOutcomeV2,
  decodeOutcome,
  encodeOutcomeForVersion,
} from "./outcome.js";
import {
  Comparator,
  SOURCES,
  TradingSession,
  decodeCorporateActionSpec,
  decodePriceAtSpec,
  decodeTradingStatusSpec,
  encodeCorporateActionSpec,
  encodePriceAtSpec,
  encodeTradingStatusSpec,
  sourceId,
  sourceName,
  buildPriceLadderSpecs,
  ladderBucketLabels,
  CHAINLINK_FEEDS_MAINNET,
} from "./sources.js";
import { ROBINHOOD_MAINNET_ID, ROBINHOOD_TESTNET_ID } from "./chains.js";

/** Function names in an ABI (constructors/events/errors have no callable name). */
function fnNames(abi: readonly { type: string; name?: string }[]): string[] {
  return abi.filter((x) => x.type === "function").map((x) => x.name as string);
}

describe("sdk exports", () => {
  it("exposes composite op enum", () => {
    expect(CompositeOp.And).toBe(0);
    expect(CompositeOp.Within).toBe(4);
  });

  it("exposes the event lifecycle status enum, including the terminal Expired state", () => {
    expect(EventStatus.Open).toBe(1);
    expect(EventStatus.Disputed).toBe(4);
    expect(EventStatus.Finalized).toBe(5);
    expect(EventStatus.Voided).toBe(6);
    expect(EventStatus.Expired).toBe(7);
  });

  it("mirrors the on-chain Availability and MarketStatus enums", () => {
    expect(Availability.Pending).toBe(0);
    expect(Availability.Voided).toBe(2);
    expect(MarketStatus.Refunding).toBe(2);
  });

  it("exposes an EventBus ABI with readOutcome, isAvailable and getAvailability", () => {
    expect(fnNames(eventBusAbi)).toEqual(
      expect.arrayContaining(["readOutcome", "isAvailable", "getAvailability"]),
    );
  });

  it("exposes a Registry ABI with the resolver submission lifecycle (arbitration lives on DisputeManager now)", () => {
    const names = fnNames(eventRegistryAbi);
    expect(names).toEqual(
      expect.arrayContaining([
        "createEvent",
        "submitObservation",
        "finalize",
        "expire",
        "setResolverAuthorization",
        "setDisputeManager",
      ]),
    );
    // Arbitration moved off the Registry entirely — see IDisputeManager.
    expect(names).not.toContain("dispute");
    expect(names).not.toContain("resolveDispute");
  });

  it("exposes a DisputeManager ABI with the tiered escalation ladder and pull payments", () => {
    expect(fnNames(disputeManagerAbi)).toEqual(
      expect.arrayContaining([
        "dispute",
        "escalateNonConvergence",
        "submitTier1Vote",
        "submitTier2Vote",
        "escalateTier2",
        "voidAfterTier2Timeout",
        "withdraw",
        "pendingWithdrawals",
      ]),
    );
  });

  it("exposes a Market ABI with the ERC-20 parimutuel flow and enumeration", () => {
    expect(fnNames(marketAbi)).toEqual(
      expect.arrayContaining([
        "createMarket",
        "depositCollateral",
        "closePosition",
        "settle",
        "claim",
        "getMarket",
        "marketCount",
        "getMarketIds",
        "payoutOf",
      ]),
    );
  });

  it("exposes the StockLendingGuard consumer", () => {
    expect(fnNames(stockLendingGuardAbi)).toEqual(expect.arrayContaining(["canLiquidate", "addRiskRule"]));
  });

  it("knows the Robinhood Chain IDs", () => {
    expect(ROBINHOOD_TESTNET_ID).toBe(46630);
    expect(ROBINHOOD_MAINNET_ID).toBe(4663);
  });
});

describe("outcome codec", () => {
  it("round-trips true and false (v1)", () => {
    expect(decodeBoolOutcome(encodeBoolOutcome(true))).toBe(true);
    expect(decodeBoolOutcome(encodeBoolOutcome(false))).toBe(false);
  });

  it("round-trips v2 and keeps the bool readable as v1", () => {
    const data = encodeOutcomeV2(true, 1_790_000_000n);
    expect(decodeOutcome(data)).toEqual({ outcome: true, occurredAt: 1_790_000_000n });
    expect(decodeBoolOutcome(data)).toBe(true);
    expect(decodeOutcome(encodeBoolOutcome(false))).toEqual({ outcome: false });
  });

  it("encodes by spec version", () => {
    expect(encodeOutcomeForVersion(1, true, 5n)).toBe(encodeBoolOutcome(true));
    expect(encodeOutcomeForVersion(2, true, 5n)).toBe(encodeOutcomeV2(true, 5n));
  });
});

describe("source specs", () => {
  it("maps sourceIds both ways", () => {
    expect(sourceName(sourceId(SOURCES.priceAt))).toBe(SOURCES.priceAt);
    expect(sourceName(sourceId("unknown.v1"))).toBeUndefined();
  });

  it("round-trips a price-at spec", () => {
    const spec = {
      feed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15" as const,
      threshold: 250_0000_0000n,
      comparator: Comparator.Gte,
      at: 1_790_300_000n,
      maxStaleness: 86_400n,
    };
    expect(decodePriceAtSpec(encodePriceAtSpec(spec))).toEqual(spec);
  });

  it("round-trips a corporate-action spec", () => {
    const spec = {
      stockToken: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC" as const,
      windowStart: 1n,
      windowEnd: 2n,
      minChangeBps: 10_000,
    };
    expect(decodeCorporateActionSpec(encodeCorporateActionSpec(spec))).toEqual(spec);
  });

  it("round-trips a trading-status spec", () => {
    const spec = { symbol: "NVDA", session: TradingSession.Market };
    expect(decodeTradingStatusSpec(encodeTradingStatusSpec(spec))).toEqual(spec);
  });
});

describe("distribution markets + vault", () => {
  it("exposes the DistributionMarket and TreasuryVault ABIs", () => {
    expect(fnNames(distributionMarketAbi)).toEqual(
      expect.arrayContaining(["createMarket", "buy", "sell", "settle", "redeem", "prices", "quoteBuy", "quoteSell", "payoutOf"]),
    );
    expect(fnNames(treasuryVaultAbi)).toEqual(
      expect.arrayContaining(["depositFees", "allocate", "claimResolverReward", "claimCommitteeReward", "sweepDisputeProceeds"]),
    );
    expect(fnNames(eventRegistryAbi)).toEqual(expect.arrayContaining(["createEvents", "observedOutcome", "observedOutcomeCount"]));
  });

  it("builds an ascending price ladder of >= events and bucket labels", () => {
    const thresholds = [200_0000_0000n, 210_0000_0000n, 220_0000_0000n];
    const specs = buildPriceLadderSpecs({ feed: CHAINLINK_FEEDS_MAINNET.NVDA, thresholds, at: 1_800_000_000n, maxStaleness: 86_400n });
    expect(specs).toHaveLength(3);
    expect(specs.every((s) => s.specVersion === 2 && s.openTimestamp === 1_800_000_000n)).toBe(true);
    expect(ladderBucketLabels(thresholds)).toEqual(["< $200", "$200–$210", "$210–$220", "≥ $220"]);
    expect(() => buildPriceLadderSpecs({ feed: CHAINLINK_FEEDS_MAINNET.NVDA, thresholds: [2n, 1n], at: 1n, maxStaleness: 1n })).toThrow();
  });
});
