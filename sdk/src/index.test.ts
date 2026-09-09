import { describe, expect, it } from "vitest";
import { CompositeOp, EventStatus } from "./types.js";
import { eventBusAbi, eventRegistryAbi, disputeManagerAbi, marketAbi } from "./abis.js";
import { encodeBoolOutcome, decodeBoolOutcome } from "./outcome.js";

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

  it("exposes an EventBus ABI with readOutcome and isAvailable", () => {
    const names = eventBusAbi.map((f) => f.name);
    expect(names).toContain("readOutcome");
    expect(names).toContain("isAvailable");
  });

  it("exposes a Registry ABI with the resolver submission lifecycle (arbitration lives on DisputeManager now)", () => {
    const names = eventRegistryAbi.map((f) => f.name);
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

  it("exposes a DisputeManager ABI with the tiered escalation ladder", () => {
    const names = disputeManagerAbi.map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "dispute",
        "escalateNonConvergence",
        "submitTier1Vote",
        "submitTier2Vote",
        "escalateTier2",
        "voidAfterTier2Timeout",
      ]),
    );
  });

  it("exposes a Market ABI with the parimutuel deposit/claim flow", () => {
    const names = marketAbi.map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining(["createMarket", "depositCollateral", "closePosition", "settle", "claim"]),
    );
  });
});

describe("outcome codec", () => {
  it("round-trips true and false", () => {
    expect(decodeBoolOutcome(encodeBoolOutcome(true))).toBe(true);
    expect(decodeBoolOutcome(encodeBoolOutcome(false))).toBe(false);
  });
});
