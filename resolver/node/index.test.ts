import { describe, expect, it } from "vitest";
import { evaluateQuorum } from "../consensus/quorum.js";
import { hashEvidence, encodeOutcomeData } from "../evidence/evidence.js";

describe("quorum", () => {
  const eventId = "0xabc" as `0x${string}`;

  it("reaches quorum when enough observations agree", () => {
    const observations = [
      { eventId, outcomeData: true, observedAt: 1, rawEvidence: {} },
      { eventId, outcomeData: true, observedAt: 2, rawEvidence: {} },
    ];
    const result = evaluateQuorum(observations, 2);
    expect(result.reached).toBe(true);
    expect(result.agreedOutcomeData).toBe(true);
    expect(result.agreeingCount).toBe(2);
  });

  it("does not reach quorum below the threshold", () => {
    const observations = [
      { eventId, outcomeData: true, observedAt: 1, rawEvidence: {} },
      { eventId, outcomeData: false, observedAt: 2, rawEvidence: {} },
    ];
    const result = evaluateQuorum(observations, 2);
    expect(result.reached).toBe(false);
  });

  it("counts true/false votes independently", () => {
    const observations = [
      { eventId, outcomeData: true, observedAt: 1, rawEvidence: {} },
      { eventId, outcomeData: false, observedAt: 2, rawEvidence: {} },
      { eventId, outcomeData: false, observedAt: 3, rawEvidence: {} },
    ];
    const result = evaluateQuorum(observations, 2);
    expect(result.reached).toBe(true);
    expect(result.agreedOutcomeData).toBe(false);
    expect(result.agreeingCount).toBe(2);
  });
});

describe("evidence", () => {
  it("produces a deterministic hash for identical observations", () => {
    const observation = {
      eventId: "0xabc" as `0x${string}`,
      outcomeData: true,
      observedAt: 1,
      rawEvidence: {},
    };
    expect(hashEvidence(observation)).toBe(hashEvidence(observation));
  });

  it("encodes booleans per the abi.encode(bool) outcome schema", () => {
    expect(encodeOutcomeData(true)).not.toBe(encodeOutcomeData(false));
    expect(encodeOutcomeData(true)).toMatch(/^0x/);
  });
});
