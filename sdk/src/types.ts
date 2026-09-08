export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export enum CompositeOp {
  And = 0,
  Or = 1,
  Not = 2,
  Before = 3,
  Within = 4,
}

export interface EventSpecInput {
  specVersion: number;
  sourceId: Hex;
  openTimestamp: bigint;
  observationDeadline: bigint;
  disputeWindowSeconds: bigint;
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

export interface NovakAddresses {
  eventRegistry: Address;
  eventBus: Address;
  eventComposer: Address;
  market: Address;
}
