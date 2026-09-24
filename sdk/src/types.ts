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
  /** Under bonded committee escalation — see IDisputeManager. Renamed from
   *  the old `DisputeWindow` now that arbitration is no longer a single
   *  dispute-window-then-owner-decides step. */
  Disputed = 4,
  Finalized = 5,
  Voided = 6,
  /** Nobody ever observed the event (or observations never reached quorum)
   *  before its deadline — a terminal non-outcome, distinct from `Voided`. */
  Expired = 7,
}

/** Consumer-facing status from `IEventBus.getAvailability`. */
export enum Availability {
  /** No outcome yet; may still get one. */
  Pending = 0,
  /** A finalized true/false outcome exists. */
  Available = 1,
  /** Will never resolve (voided/expired primitive, or a composite that propagated it). */
  Voided = 2,
}

export enum MarketStatus {
  Open = 0,
  Settled = 1,
  /** The underlying event was voided — every depositor reclaims their own stake. */
  Refunding = 2,
}

export interface EventSpecInput {
  /** 1: outcome = abi.encode(bool). 2: abi.encode(bool, uint64 occurredAt) — use for anything feeding BEFORE/WITHIN. */
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
  creator: Address;
  createdAt: bigint;
  tradingClosesAt: bigint;
  status: MarketStatus;
  outcome: boolean;
  yesPool: bigint;
  noPool: bigint;
  feeTaken: bigint;
  question: string;
}

export interface NovakAddresses {
  eventRegistry: Address;
  /** Optional: only needed by a resolver/committee node driving the
   *  IDisputeManager tiered-escalation calls directly — NovakClient (the
   *  consumer SDK) never writes to it. */
  disputeManager?: Address;
  eventBus: Address;
  eventComposer: Address;
  subscriptionManager: Address;
  settlement: Address;
  positionManager: Address;
  market: Address;
  /** ERC-20 collateral (MockUSDG on testnet, USDG on mainnet). */
  collateral: Address;
  stockLendingGuard?: Address;
}

/** Shape of deployments/<chainId>.json (script/export-deployment.mjs). */
export interface NovakDeployment extends NovakAddresses {
  chainId: number;
  /** L2 block of the first deployment tx — start point for log scans. */
  startBlock: number;
  deployedAt: string;
  collateralIsMock: boolean;
  disputeManager: Address;
  stockLendingGuard: Address;
}
