/**
 * A SourceAdapter fetches raw data for a class of events (identified by
 * `sourceId`, matching IEventRegistry.EventSpec.sourceId on-chain) and turns it
 * into an Observation the resolver can submit. Adapters do all "heavy" retrieval
 * and processing off-chain — the chain only ever sees the resulting evidence hash
 * and a boolean outcome (see evidence/ and docs/architecture.md, "minimize
 * on-chain computation").
 *
 * `outcomeData` is a plain `boolean`, matching the finalized MVP outcome-payload
 * schema (IEventRegistry docs, specVersion 1: `abi.encode(bool)`) — every MVP
 * event is a yes/no condition.
 */
export interface Observation {
  /** The event this observation is about (on-chain event ID). */
  eventId: `0x${string}`;
  outcomeData: boolean;
  /** Unix ms timestamp the adapter fetched the source data. */
  observedAt: number;
  /** Raw evidence the adapter used to produce outcomeData (see evidence/). */
  rawEvidence: unknown;
}

export interface SourceAdapter {
  /** Must match a sourceId used in on-chain EventSpecs this adapter can serve. */
  readonly sourceId: string;
  /** Fetches current source data and produces an Observation for the given event. */
  fetchObservation(eventId: `0x${string}`, eventSpec: unknown): Promise<Observation>;
}
