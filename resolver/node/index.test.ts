import { describe, expect, it } from "vitest";
import { evaluateQuorum, evaluateEscalationQuorum } from "../consensus/quorum.js";
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

describe("escalation quorum (DisputeManager Tier-1/Tier-2 mirror)", () => {
  it("reaches 66% agreement against the committee size, not the vote count", () => {
    // 2 of 3 committee seats voted true; the third never votes — 2/3 = 66.7%.
    const votes = [
      { member: "0xA", outcome: true },
      { member: "0xB", outcome: true },
    ];
    const result = evaluateEscalationQuorum(votes, 3);
    expect(result.reached).toBe(true);
    expect(result.agreedOutcome).toBe(true);
  });

  it("does not reach quorum below 66% of committee size even with unanimous participants", () => {
    // 2 of 7 committee seats have voted so far — unanimous among
    // participants, but nowhere near 66% of the full committee.
    const votes = [
      { member: "0xA", outcome: true },
      { member: "0xB", outcome: true },
    ];
    const result = evaluateEscalationQuorum(votes, 7);
    expect(result.reached).toBe(false);
  });

  it("a handful of early votes can never manufacture 66% on a large committee", () => {
    const votes = [{ member: "0xA", outcome: true }];
    const result = evaluateEscalationQuorum(votes, 15);
    expect(result.reached).toBe(false);
    expect(result.trueCount).toBe(1);
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
