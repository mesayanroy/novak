import type { EventSpecInput, Hex } from "@novakoracle/sdk";

/**
 * A SourceAdapter turns an on-chain event definition (`EventSpec`, whose
 * `sourceId` names the adapter and whose `spec` bytes it decodes) into an
 * Observation, by reading its source — Robinhood Chain mainnet contracts,
 * Chainlink feeds, or the Robinhood assets API. All retrieval happens
 * off-chain; only the outcome and an evidence hash go on-chain.
 *
 * DETERMINISM IS THE CONTRACT: quorum is exact-match on the full payload
 * (outcome AND, for specVersion 2, occurredAt), so every honest resolver
 * reading the same source must produce the identical Observation. Derive
 * `occurredAt` from the source (a round's timestamp, a token's effectiveAt, a
 * spec's window bound) — never from the local clock.
 *
 * Return `null` to ABSTAIN: too early to know, source unavailable, data too
 * stale. Abstaining is always safe — a wrong vote is not.
 */
export interface Observation {
  outcome: boolean;
  /** Unix seconds; the fact's real-world time. Only encoded for specVersion >= 2. */
  occurredAt: bigint;
  /** What the adapter saw — hashed into the evidence commitment, served at /evidence/:hash. */
  rawEvidence: Record<string, unknown>;
}

export interface ObserveContext {
  eventId: Hex;
  spec: EventSpecInput;
  /** Chain time of the chain Novak is deployed on. */
  now: bigint;
}

export interface SourceAdapter {
  /** Catalog name, e.g. "chainlink.price-at.v1"; sourceId = keccak256(name). */
  readonly name: string;
  observe(ctx: ObserveContext): Promise<Observation | null>;
}
