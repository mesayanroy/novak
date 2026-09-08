import { describe, expect, it } from "vitest";
import { CompositeOp } from "./types.js";
import { eventBusAbi } from "./abis.js";

describe("sdk exports", () => {
  it("exposes composite op enum", () => {
    expect(CompositeOp.And).toBe(0);
    expect(CompositeOp.Within).toBe(4);
  });

  it("exposes an EventBus ABI with readOutcome and isAvailable", () => {
    const names = eventBusAbi.map((f) => f.name);
    expect(names).toContain("readOutcome");
    expect(names).toContain("isAvailable");
  });
});
