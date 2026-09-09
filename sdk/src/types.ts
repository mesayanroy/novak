export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export enum CompositeOp {
  And = 0,
  Or = 1,
  Not = 2,
  Before = 3,
  Within = 4,
}

export enum EventStatus {
  None = 0,
  Open = 1,
  ObservationsSubmitted = 2,
  ProposedOutcome = 3,
  DisputeWindow = 4,
  Finalized = 5,
  Voided = 6,
}

export interface EventSpecInput {
  specVersion: number;
  sourceId: Hex;
  openTimestamp: bigint;
  observationDeadline: bigint;
  disputeWindowSeconds: bigint;
  /** Number of matching authorized-resolver observations required for quorum. */
  quorumThreshold: number;
  spec: Hex;
}

export interface CompositeSpecInput {
  op: CompositeOp;
  operands: Hex[];
  /** seconds; only meaningful for Before/Within */
  window: bigint;
}

export interface Outcome {
  exists: boolean;
  outcomeHash: Hex;
  outcomeData: Hex;
  finalizedAt: bigint;
}

export interface MarketDef {
  eventId: Hex;
  createdAt: bigint;
  settled: boolean;
  outcome: boolean;
  yesPool: bigint;
  noPool: bigint;
}

export interface NovakAddresses {
  eventRegistry: Address;
  eventBus: Address;
  eventComposer: Address;
  subscriptionManager: Address;
  settlement: Address;
  positionManager: Address;
  market: Address;
}
