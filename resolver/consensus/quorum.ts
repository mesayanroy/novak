import type { Observation } from "../adapters/types.js";

/**
 * Quorum logic: decides whether a set of resolver observations for the same
 * event agree, for this resolver's own off-chain sanity-checking before it
 * bothers submitting (or to decide whether enough of its peers likely already
 * agree). The actual quorum enforcement that finalizes an event's outcome
 * lives on-chain in EventRegistry.submitObservation — see
 * contracts/EventRegistry.sol and IEventRegistry docs for the FINALIZED MVP
 * decision this mirrors: no on-chain staking/reputation weighting, just an
 * exact-match count of `EventSpec.quorumThreshold` authorized resolvers
 * agreeing on the identical `outcomeData`. This module exists so a resolver
 * node can locally simulate that same rule (e.g. before spending gas on a
 * submission it doesn't expect to help reach quorum).
 */
export interface QuorumResult {
  reached: boolean;
  agreedOutcomeData?: boolean;
  agreeingCount: number;
  totalCount: number;
}

/** Exact-match quorum: every MVP outcome is a boolean, so "agreement" is
 *  identity, not a tolerance band — see docs/protocol-spec.md for why. */
export function evaluateQuorum(observations: Observation[], quorumThreshold: number): QuorumResult {
  if (observations.length === 0) {
    return { reached: false, agreeingCount: 0, totalCount: 0 };
  }

  const trueCount = observations.filter((o) => o.outcomeData === true).length;
  const falseCount = observations.length - trueCount;

  if (trueCount >= quorumThreshold) {
    return { reached: true, agreedOutcomeData: true, agreeingCount: trueCount, totalCount: observations.length };
  }
  if (falseCount >= quorumThreshold) {
    return { reached: true, agreedOutcomeData: false, agreeingCount: falseCount, totalCount: observations.length };
  }
  return { reached: false, agreeingCount: Math.max(trueCount, falseCount), totalCount: observations.length };
}
