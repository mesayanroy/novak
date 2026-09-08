import { describe, expect, it } from "vitest";
import { evaluateQuorum } from "../consensus/quorum.js";
import { hashEvidence } from "../evidence/evidence.js";

describe("quorum", () => {
  it("reaches quorum when all observations agree", () => {
    const eventId = "0xabc" as `0x${string}`;
    const observations = [
      { eventId, outcomeData: { price: 5000 }, observedAt: 1, rawEvidence: {} },
      { eventId, outcomeData: { price: 5000 }, observedAt: 2, rawEvidence: {} },
    ];
    const result = evaluateQuorum(observations);
    expect(result.reached).toBe(true);
    expect(result.agreeingCount).toBe(2);
  });

  it("does not reach quorum on disagreement", () => {
    const eventId = "0xabc" as `0x${string}`;
    const observations = [
      { eventId, outcomeData: { price: 5000 }, observedAt: 1, rawEvidence: {} },
      { eventId, outcomeData: { price: 4999 }, observedAt: 2, rawEvidence: {} },
    ];
    const result = evaluateQuorum(observations);
    expect(result.reached).toBe(false);
  });
});

describe("evidence", () => {
  it("produces a deterministic hash for identical observations", () => {
    const observation = {
      eventId: "0xabc" as `0x${string}`,
      outcomeData: { price: 5000 },
      observedAt: 1,
      rawEvidence: {},
    };
    expect(hashEvidence(observation)).toBe(hashEvidence(observation));
  });
});
