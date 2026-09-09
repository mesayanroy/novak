import { describe, expect, it } from "vitest";
import { CompositeOp, EventStatus } from "./types.js";
import { eventBusAbi, eventRegistryAbi, marketAbi } from "./abis.js";
import { encodeBoolOutcome, decodeBoolOutcome } from "./outcome.js";

describe("sdk exports", () => {
  it("exposes composite op enum", () => {
    expect(CompositeOp.And).toBe(0);
    expect(CompositeOp.Within).toBe(4);
  });

  it("exposes the event lifecycle status enum", () => {
    expect(EventStatus.Open).toBe(1);
    expect(EventStatus.Finalized).toBe(5);
    expect(EventStatus.Voided).toBe(6);
  });

  it("exposes an EventBus ABI with readOutcome and isAvailable", () => {
    const names = eventBusAbi.map((f) => f.name);
    expect(names).toContain("readOutcome");
    expect(names).toContain("isAvailable");
  });

  it("exposes a Registry ABI with the full resolver/dispute lifecycle", () => {
    const names = eventRegistryAbi.map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "createEvent",
        "submitObservation",
        "dispute",
        "resolveDispute",
        "finalize",
        "setResolverAuthorization",
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
