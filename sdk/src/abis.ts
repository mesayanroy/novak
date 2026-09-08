/**
 * Hand-maintained ABI fragments matching contracts/interfaces/*.sol.
 *
 * TODO: once the Foundry build is set up (`forge build`), replace these with
 * ABIs generated from `out/*.json` (e.g. via a small script that copies
 * `out/EventBus.sol/EventBus.json#abi` into this file, or import them directly
 * from the Foundry `out/` directory) so the SDK can never drift from the
 * on-chain interface.
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

export const eventRegistryAbi = [
  {
    type: "function",
    name: "createEvent",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "eventSpec",
        type: "tuple",
        components: [
          { name: "specVersion", type: "uint16" },
          { name: "sourceId", type: "bytes32" },
          { name: "openTimestamp", type: "uint64" },
          { name: "observationDeadline", type: "uint64" },
          { name: "disputeWindowSeconds", type: "uint64" },
          { name: "spec", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "eventId", type: "bytes32" }],
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
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [],
  },
] as const;
