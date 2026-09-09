# Novak Protocol Spec (living document)

This tracks the concrete data shapes and the protocol-semantic decisions that
govern them. Every decision below that was previously an open `TODO` has now
been finalized for the MVP (see `docs/SPEC_AND_TASKS.md` for what that
unlocked) — this document is the reasoning trail for those decisions, so a
future change to any of them should update both the code and this file
together.

## Event specification (`IEventRegistry.EventSpec`)

| Field                  | Type    | Meaning                                                       |
|------------------------|---------|----------------------------------------------------------------|
| `specVersion`          | uint16  | Schema version for `spec` and outcome payload decoding.        |
| `sourceId`             | bytes32 | Identifies which resolver adapter class can serve this event.  |
| `openTimestamp`        | uint64  | When observation may begin.                                    |
| `observationDeadline`  | uint64  | Last time a resolver may submit an observation.                |
| `disputeWindowSeconds` | uint64  | Challenge window after a proposed outcome, before finalization. |
| `quorumThreshold`      | uint8   | Number of matching authorized-resolver observations required.  |
| `spec`                 | bytes   | Opaque, versioned event definition.                             |

**FINALIZED — event ID derivation.** `keccak256(sourceId, specVersion, spec,
nonce)`, where `nonce` is an internal monotonic Registry counter. This means
the same real-world question *can* be posted twice (each `createEvent` call
gets a fresh ID) — deduplication, if ever wanted, is a caller/UI concern, not
a Registry invariant. Not collision-hardened across separate Registry
deployments/chains; fine for a single MVP deployment.

**FINALIZED — outcome payload schema (specVersion 1).** `Outcome.outcomeData`
is `abi.encode(bool)`. Every MVP event — a price threshold, a rate-cut
decision, anything in the spec's examples — reduces to yes/no, so a single
bool covers the MVP without needing a schema registry per `specVersion`.
`Settlement.sol` and `EventComposer.sol` both decode against this schema
directly. A future `specVersion` could introduce richer payloads (e.g. an
enumerated outcome set like `NO_CHANGE`/`CUT_25`/`CUT_50`), but that requires
updating both the decode sites and this document before shipping.

## Resolver network

- Resolvers are individually authorized by the Registry owner
  (`EventRegistry.setResolverAuthorization`) — there is no on-chain
  staking/reputation token in the MVP (see "Explicitly deferred" below).
  Each resolver process (`resolver/`) watches events whose `sourceId`
  matches an adapter it runs.
- Observations are hashed for evidence commitment (`resolver/evidence/`)
  before submission. Raw evidence is currently never published anywhere
  on- or off-chain beyond the resolver's own logs — only the commitment hash
  reaches the Registry. Publishing raw evidence to a content-addressed store
  (e.g. IPFS) alongside the hash is a natural follow-up, not required for the
  MVP's own tests to pass.

**FINALIZED — quorum math.** N-of-M exact agreement: an event's outcome is
proposed once `EventSpec.quorumThreshold` *distinct, authorized* resolvers
have submitted the byte-identical `outcomeData`
(`EventRegistry.submitObservation`). No stake weighting, no tolerance band —
every MVP outcome is boolean, so "agreement" is pure equality. A resolver
that disagrees does not block others from reaching quorum on a different
value; it also does not get to resubmit once an event has left
`ObservationsSubmitted` (see `test_conflictingResolvers_...` and
`test_duplicateSubmission_...` in `test/adversarial/`).

**FINALIZED — dispute mechanism (MVP-simplified).** Any account may dispute
a proposed outcome within the dispute window by posting `DISPUTE_BOND`
(0.01 ETH, a fixed MVP constant, not configurable per-event). The Registry
**owner arbitrates** the dispute (`resolveDispute`) — upholding the proposal
forfeits the disputer's bond to the owner; rejecting it voids the event and
refunds the bond. This is explicitly **not** decentralized arbitration (a
jury, a further vote, a slashing DAO) — see `docs/threat-model.md` item 2 for
why that's called out as a real limitation rather than assumed away.

## Event composition (`IEventComposer`)

Operators: `AND`, `OR`, `NOT`, `BEFORE`, `WITHIN`.

- `AND`/`OR` take 2+ operands; result requires all/any operand outcomes to be
  true.
- `NOT` takes exactly 1 operand; negates it.
- `BEFORE` takes exactly 2 operands; true iff both resolved true **and**
  operand 0's finalization timestamp is strictly before operand 1's.
- `WITHIN` takes exactly 2 operands and a `window` (seconds); true iff both
  resolved true **and** their finalization timestamps differ by at most
  `window` (inclusive — see the fuzz test on this exact boundary).
- Every operand must already exist (a registered primitive event, or a
  previously created composite) at the moment `createComposite` is called —
  composing over an unknown ID reverts, closing a griefing vector where a
  market could reference an event that can structurally never resolve.

**FINALIZED — composite ID derivation and operand-order sensitivity.**
`keccak256(op, operands, window)`. Operand order **is** significant —
`AND(a, b)` and `AND(b, a)` are different composite IDs even though they're
logically equivalent. Callers that want two equivalent commutative
compositions to dedupe to the same ID must canonicalize operand order
themselves before calling `createComposite` (e.g. sort operands
lexicographically); the Composer does not do this for you.

**FINALIZED — timestamp source for temporal ops.** For a primitive operand,
the timestamp is `IEventRegistry.Outcome.finalizedAt` (set when
`EventRegistry.finalize`/`resolveDispute` runs). For a **nested composite**
operand, the timestamp is when that composite's own `tryResolve` call first
cached a result (`EventComposer._resolvedAt`). This is a known simplification:
a composite's effective "occurred at" time is *resolution* time, not the
real-world time its underlying condition became true — a composite that sits
unresolved for a week after its operands finalize will report that later
resolution time to any BEFORE/WITHIN composing over it. For the MVP's single
level of composition (as in the canonical demo) this doesn't come up; it
becomes relevant for compositions-of-compositions where wall-clock accuracy
of "when" matters.

## Derivatives market outcome model

**FINALIZED — parimutuel pools, no token economics.** `Market.sol` is a
binary YES/NO pool: everyone backing a side pools ETH together, and once
settled, the winning pool splits the losing pool pro-rata to stake (plus
gets its own stake back). If nobody backed the winning side, everyone is
refunded their own stake. This is trivially solvent (total payout ≤ total
deposit) without needing an AMM, leverage, or liquidation logic — all
explicitly deferred (see MVP scope below).

## MVP scope

**In scope (all implemented and tested — see `docs/SPEC_AND_TASKS.md`):**
Event Registry, event specification format, resolver network with multiple
observations, quorum, dispute mechanism, event finalization, on-chain
pull-based Event Bus (serving both primitive and composite events),
AND/OR/NOT + BEFORE/WITHIN composition, derivatives market with event-based
settlement, TypeScript SDK, local deployment scripts, end-to-end demo.

**Explicitly deferred:** cross-chain events, ZK oracle proofs, permissionless
resolver marketplace (staking/reputation tokens), MEV mechanisms,
high-frequency event streams, perpetual derivatives, complex liquidation
systems, production-scale token economics, decentralized dispute
arbitration, a push/relayer execution layer (Issue #13 — the one P1 item with
zero code so far), and real testnet deployment (needs a funded key/RPC — see
`docs/SPEC_AND_TASKS.md` Issue #20).
