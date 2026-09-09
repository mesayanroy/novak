/**
 * Hand-maintained ABI fragments matching contracts/interfaces/*.sol and
 * derivatives/*.sol.
 *
 * TODO: once these stabilize further, consider generating them from Foundry's
 * `out/*.json` build artifacts instead (e.g. a small script copying
 * `out/EventBus.sol/EventBus.json#abi` in here) so the SDK can never drift
 * from the on-chain interface. Hand-maintained is fine for the MVP's pace of
 * change.
 */

export const eventBusAbi = [
  {
    type: "function",
    name: "readOutcome",
    stateMutability: "view",
    inputs: [{ name: "eventId", type: "bytes32" }],
    outputs: [
      {
        name: "outcome",
        type: "tuple",
        components: [
          { name: "exists", type: "bool" },
          { name: "outcomeHash", type: "bytes32" },
          { name: "outcomeData", type: "bytes" },
          { name: "finalizedAt", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "isAvailable",
    stateMutability: "view",
    inputs: [{ name: "eventId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const eventSpecTupleComponents = [
  { name: "specVersion", type: "uint16" },
  { name: "sourceId", type: "bytes32" },
  { name: "openTimestamp", type: "uint64" },
  { name: "observationDeadline", type: "uint64" },
  { name: "disputeWindowSeconds", type: "uint64" },
  { name: "quorumThreshold", type: "uint8" },
  { name: "spec", type: "bytes" },
] as const;

export const eventRegistryAbi = [
  {
    type: "function",
    name: "createEvent",
    stateMutability: "nonpayable",
    inputs: [{ name: "eventSpec", type: "tuple", components: eventSpecTupleComponents }],
    outputs: [{ name: "eventId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "submitObservation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "outcomeData", type: "bytes" },
      { name: "evidenceHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "finalize",
    stateMutability: "nonpayable",
    inputs: [{ name: "eventId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "expire",
    stateMutability: "nonpayable",
    inputs: [{ name: "eventId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setResolverAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "resolver", type: "address" },
      { name: "authorized", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setDisputeManager",
    stateMutability: "nonpayable",
    inputs: [{ name: "disputeManager_", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "isAuthorizedResolver",
    stateMutability: "view",
    inputs: [{ name: "resolver", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getAuthorizedResolvers",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "disputeManager",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getEvent",
    stateMutability: "view",
    inputs: [{ name: "eventId", type: "bytes32" }],
    outputs: [{ name: "status", type: "uint8" }],
  },
  {
    type: "function",
    name: "getEventSpec",
    stateMutability: "view",
    inputs: [{ name: "eventId", type: "bytes32" }],
    outputs: [{ name: "", type: "tuple", components: eventSpecTupleComponents }],
  },
  {
    type: "function",
    name: "getOutcome",
    stateMutability: "view",
    inputs: [{ name: "eventId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "exists", type: "bool" },
          { name: "outcomeHash", type: "bytes32" },
          { name: "outcomeData", type: "bytes" },
          { name: "finalizedAt", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "isFinalized",
    stateMutability: "view",
    inputs: [{ name: "eventId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const eventComposerAbi = [
  {
    type: "function",
    name: "createComposite",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "compositeSpec",
        type: "tuple",
        components: [
          { name: "op", type: "uint8" },
          { name: "operands", type: "bytes32[]" },
          { name: "window", type: "uint64" },
        ],
      },
    ],
    outputs: [{ name: "compositeId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "tryResolve",
    stateMutability: "nonpayable",
    inputs: [{ name: "compositeId", type: "bytes32" }],
    outputs: [
      { name: "resolved", type: "bool" },
      { name: "outcome", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "isResolved",
    stateMutability: "view",
    inputs: [{ name: "compositeId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getResolvedOutcome",
    stateMutability: "view",
    inputs: [{ name: "compositeId", type: "bytes32" }],
    outputs: [
      { name: "resolved", type: "bool" },
      { name: "outcome", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getStatus",
    stateMutability: "view",
    inputs: [{ name: "compositeId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint8" }], // Unresolved=0, True=1, False=2, Voided=3
  },
  {
    type: "function",
    name: "getDepth",
    stateMutability: "view",
    inputs: [{ name: "compositeId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint32" }],
  },
] as const;

/**
 * DisputeManager ABI fragment. Exposed here so the SDK/tests can see the
 * new tiered-escalation surface exists; the consumer-facing `NovakClient`
 * deliberately does NOT wrap these in write methods yet (same reasoning as
 * why it never wrapped `submitObservation`/`dispute`/`resolveDispute` on
 * the old Registry ABI — this is resolver/committee-member territory, not
 * a plain consumer read/write path). A resolver node wiring up Tier-1/
 * Tier-2 voting should call these directly with its own thin viem calls,
 * same as `resolver/node/index.ts` already does for `submitObservation`.
 */
export const disputeManagerAbi = [
  {
    type: "function",
    name: "dispute",
    stateMutability: "payable",
    inputs: [{ name: "eventId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "escalateNonConvergence",
    stateMutability: "nonpayable",
    inputs: [{ name: "eventId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "submitTier1Vote",
    stateMutability: "payable",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "outcome", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submitTier2Vote",
    stateMutability: "payable",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "outcome", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "escalateTier2",
    stateMutability: "nonpayable",
    inputs: [{ name: "eventId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "voidAfterTier2Timeout",
    stateMutability: "nonpayable",
    inputs: [{ name: "eventId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getCommittee",
    stateMutability: "view",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "tier", type: "uint8" },
    ],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "getTierTally",
    stateMutability: "view",
    inputs: [
      { name: "eventId", type: "bytes32" },
      { name: "tier", type: "uint8" },
    ],
    outputs: [
      { name: "trueVotes", type: "uint256" },
      { name: "falseVotes", type: "uint256" },
      { name: "deadline", type: "uint64" },
      { name: "bondAmount", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "DISPUTE_BOND",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "TIER1_BOND",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "TIER2_BOND",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const subscriptionManagerAbi = [
  {
    type: "function",
    name: "subscribe",
    stateMutability: "nonpayable",
    inputs: [
      { name: "topic", type: "bytes32" },
      { name: "consumer", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "unsubscribe",
    stateMutability: "nonpayable",
    inputs: [
      { name: "topic", type: "bytes32" },
      { name: "consumer", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isSubscribed",
    stateMutability: "view",
    inputs: [
      { name: "topic", type: "bytes32" },
      { name: "consumer", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const settlementAbi = [
  {
    type: "function",
    name: "resolveOutcome",
    stateMutability: "view",
    inputs: [{ name: "eventId", type: "bytes32" }],
    outputs: [
      { name: "available", type: "bool" },
      { name: "outcome", type: "bool" },
    ],
  },
] as const;

export const marketAbi = [
  {
    type: "function",
    name: "createMarket",
    stateMutability: "nonpayable",
    inputs: [{ name: "eventId", type: "bytes32" }],
    outputs: [{ name: "marketId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "depositCollateral",
    stateMutability: "payable",
    inputs: [
      { name: "marketId", type: "bytes32" },
      { name: "backingYes", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "closePosition",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "bytes32" },
      { name: "backingYes", type: "bool" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "markets",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "eventId", type: "bytes32" },
      { name: "createdAt", type: "uint64" },
      { name: "settled", type: "bool" },
      { name: "outcome", type: "bool" },
      { name: "yesPool", type: "uint256" },
      { name: "noPool", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "yesBalance",
    stateMutability: "view",
    inputs: [
      { name: "", type: "bytes32" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "noBalance",
    stateMutability: "view",
    inputs: [
      { name: "", type: "bytes32" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
