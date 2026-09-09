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

/**
 * A vote cast by one committee member during dispute-escalation review (see
 * contracts/DisputeManager.sol's Tier-1/Tier-2 ladder — Gap 2 of
 * docs/protocol-spec.md's tiered-arbitration design).
 */
export interface TierVote {
  member: string;
  outcome: boolean;
}

export interface EscalationQuorumResult {
  reached: boolean;
  agreedOutcome?: boolean;
  trueCount: number;
  falseCount: number;
}

/**
 * Mirrors `DisputeManager._hasConverged` / the on-chain check in
 * `_submitTierVote`: agreement is `>= 66%` of the fixed COMMITTEE SIZE
 * decided at selection time — never of however many members happened to
 * vote — so a handful of early votes can never manufacture a false
 * convergence. Lets a resolver locally check whether its own vote would
 * (or already did) push a tier over the line before spending gas on-chain,
 * the same purpose `evaluateQuorum` serves for base-layer quorum.
 */
export function evaluateEscalationQuorum(votes: TierVote[], committeeSize: number): EscalationQuorumResult {
  const trueCount = votes.filter((v) => v.outcome === true).length;
  const falseCount = votes.filter((v) => v.outcome === false).length;

  if (committeeSize > 0 && trueCount * 100 >= committeeSize * 66) {
    return { reached: true, agreedOutcome: true, trueCount, falseCount };
  }
  if (committeeSize > 0 && falseCount * 100 >= committeeSize * 66) {
    return { reached: true, agreedOutcome: false, trueCount, falseCount };
  }
  return { reached: false, trueCount, falseCount };
}
