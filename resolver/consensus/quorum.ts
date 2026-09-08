import type { Observation } from "../adapters/types.js";

/**
 * Quorum logic stub: decides whether a set of resolver observations for the same
 * event agree closely enough to propose a single outcome on-chain.
 *
 * TODO(protocol semantics — confirm before implementing for real): exact quorum
 * threshold (e.g. N-of-M resolvers, or 2/3 by stake), what counts as "agreement"
 * for non-boolean outcome payloads (exact match vs. tolerance band for numeric
 * data), and how ties/no-quorum are handled (re-poll vs. dispute-eligible
 * void). This file intentionally implements only a trivial placeholder so the
 * resolver <-> Registry submission flow is wireable end-to-end for the demo.
 */
export interface QuorumResult {
  reached: boolean;
  agreedOutcomeData?: unknown;
  agreeingCount: number;
  totalCount: number;
}

/** Placeholder: naive unanimous-match quorum over JSON-stringified outcomes. */
export function evaluateQuorum(observations: Observation[]): QuorumResult {
  if (observations.length === 0) {
    return { reached: false, agreeingCount: 0, totalCount: 0 };
  }

  const serialized = observations.map((o) => JSON.stringify(o.outcomeData));
  const first = serialized[0];
  const allAgree = serialized.every((s) => s === first);

  return {
    reached: allAgree,
    agreedOutcomeData: allAgree ? observations[0].outcomeData : undefined,
    agreeingCount: allAgree ? observations.length : 0,
    totalCount: observations.length,
  };
}
