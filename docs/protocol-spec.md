# Novak Protocol Spec (living document)

This tracks the concrete data shapes and open protocol-semantic decisions.
Anything marked `TODO(protocol semantics)` in the contracts mirrors an open
item here — resolve it here first, then update the corresponding contract.

## Event specification (`IEventRegistry.EventSpec`)

| Field                  | Type    | Meaning                                                       |
|------------------------|---------|----------------------------------------------------------------|
| `specVersion`          | uint16  | Schema version for `spec` and outcome payload decoding.        |
| `sourceId`             | bytes32 | Identifies which resolver adapter class can serve this event.  |
| `openTimestamp`        | uint64  | When observation may begin.                                    |
| `observationDeadline`  | uint64  | Last time a resolver may submit an observation.                |
| `disputeWindowSeconds` | uint64  | Challenge window after a proposed outcome, before finalization. |
| `spec`                 | bytes   | Opaque, versioned event definition.                             |

**Open decision — event ID derivation.** Candidate:
`keccak256(sourceId, specVersion, spec, nonce)`. Needs a decision on
replay/collision handling (e.g. can the same real-world question be posted
twice?) before this is canonical. Currently implemented as a placeholder in
`contracts/EventRegistry.sol` — not collision-hardened.

**Open decision — outcome payload schema.** `Outcome.outcomeData` is opaque
bytes today. Needs a schema per `specVersion` so consumers (e.g.
`derivatives/Market.sol`) can decode it generically rather than assuming a
boolean.

## Resolver network

- Resolvers are identified by an address (or resolver ID mapped to an
  address) and each watches events whose `sourceId` matches an adapter they
  run (`resolver/adapters/`).
- Observations are hashed for evidence commitment (`resolver/evidence/`)
  before submission — raw evidence storage location (on-chain vs. off-chain
  content-addressed store) is still open.

**Open decision — quorum math.** `resolver/consensus/quorum.ts` currently
implements a placeholder "all observations must exactly agree" rule. Needs a
decision on: minimum resolver count, weighting (per-resolver vs. per-stake),
and tolerance for numeric outcome data before this is real. **Do not
implement quorum enforcement on-chain until this is settled** — flag it back
for a decision rather than guessing.

**Open decision — dispute mechanism.** Bonding/slashing model for disputing a
proposed outcome is undesigned. MVP requires *a* dispute window to exist
(`disputeWindowSeconds`), but the economic mechanism behind disputes is
deferred within the MVP itself unless/until specified.

## Event composition (`IEventComposer`)

Operators: `AND`, `OR`, `NOT`, `BEFORE`, `WITHIN`.

- `AND`/`OR` take 2+ operands; result requires all/any operand outcomes to be
  true.
- `NOT` takes exactly 1 operand; negates it.
- `BEFORE` takes exactly 2 operands; true iff operand 0 resolved-true strictly
  before operand 1.
- `WITHIN` takes exactly 2 operands and a `window` (seconds); true iff both
  resolved true within `window` of each other.

**Open decision — composite ID derivation and operand-order sensitivity.**
Candidate: `keccak256(op, operands, window)`. This makes `AND(a, b)` and
`AND(b, a)` different composite IDs even though they are logically
equivalent — decide whether commutative ops should canonicalize operand order
before hashing.

**Open decision — timestamp source for temporal ops.** `BEFORE`/`WITHIN`
need a timestamp per resolved primitive event. Candidate: the Registry's
`Outcome.finalizedAt`. Alternative: an in-`spec` "occurred at" timestamp
distinct from finalization time (more accurate to real-world event timing,
but requires resolvers to report it and adds a field to verify). Not yet
decided — `contracts/EventComposer.sol::tryResolve` is unimplemented pending
this.

## MVP scope

**In scope:** Event Registry, event specification format, resolver network
with multiple observations, basic quorum, dispute mechanism, event
finalization, on-chain pull-based Event Bus, AND/OR/NOT + basic temporal
composition, derivatives market with event-based settlement, TypeScript SDK,
testnet deployment scripts, end-to-end demo.

**Explicitly deferred:** cross-chain events, ZK oracle proofs, permissionless
resolver marketplace, MEV mechanisms, high-frequency event streams, perpetual
derivatives, complex liquidation systems, production-scale token economics.
