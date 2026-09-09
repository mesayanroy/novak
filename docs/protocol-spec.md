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

**FINALIZED — the ambiguous/non-converging base case.** Base quorum stays
exactly as above — this was never changed. What used to be undefined is what
happens if `observationDeadline` passes with observations on file but
*none* reached `quorumThreshold` (a genuine split, or simply not enough
resolvers responded). Two permissionless, callable-by-anyone terminal paths
now cover every case:
- **Zero observations ever submitted** → `EventRegistry.expire(eventId)` →
  `EventStatus.Expired`. A clean "the network never had an answer" signal;
  no bonds were ever at risk, so nothing to slash.
- **Observations exist but never converged** →
  `IDisputeManager.escalateNonConvergence(eventId)` routes the event
  directly into the same Tier-1 committee ladder a filed dispute uses (see
  below) — no `DISPUTE_BOND` required, since nobody is challenging a
  proposal that never existed. This closes the gap where an ambiguous
  quorum previously had **no path forward at all**.

**FINALIZED — dispute mechanism: bonded, two-tier committee escalation, not
owner arbitration.** This supersedes the original MVP-simplified design
(single owner calls `resolveDispute`) — see `docs/threat-model.md` item 2 for
why that design was explicitly flagged as a real limitation rather than
assumed away, and what changed.

Disputing (`IDisputeManager.dispute`, within the dispute window, posting
`DISPUTE_BOND` = 0.01 ETH) or a non-converging quorum (see above) both open
**Tier-1**: a committee is drawn from `EventRegistry.getAuthorizedResolvers()`
— the full pool if it's at or below `TIER1_COMMITTEE_SIZE` (7), otherwise a
block-data-seeded pseudo-random sample of 7. Each committee member may cast
one bonded re-resolution vote (`TIER1_BOND` = 0.03 ETH). The instant `>=66%`
of the **fixed committee size** (not of however many members bothered to
vote) agrees on one outcome, the event finalizes with that outcome. If the
`TIER1_WINDOW` (1 hour) elapses without 66% agreement, anyone can call
`escalateTier2`, which refunds every Tier-1 bond in full (no decision was
reached, so nobody is "wrong") and opens **Tier-2**: same mechanics,
`TIER2_COMMITTEE_SIZE` = 15, `TIER2_BOND` = 0.08 ETH, `TIER2_WINDOW` = 2
hours. If Tier-2 also fails to converge, `voidAfterTier2Timeout` marks the
event **permanently `Voided`** — the hard floor of the ladder — and refunds
every remaining bond (Tier-2 committee bonds and the original disputer's
bond, if any) in full. **VOID is never followed by an appeal to any kind of
vote** — this is the concrete difference from UMA's DVM, where an
unresolved dispute escalates to token-holder governance (see
`docs/architecture.md`'s UMA comparison).

Bond accounting when a tier *does* converge: the losing side's bonds split
1/3 burned (sent to the standard `0x…dEaD` burn address), 1/3 distributed
pro-rata to the winning committee members (on top of getting their own bond
back), 1/3 to a fixed `treasury` address. The original disputer's
`DISPUTE_BOND` rides on whether the committee agreed with them: overturned
proposal → refunded in full; upheld proposal → forfeited via the same
burn/treasury split (not redistributed to the committee — a documented
gas/complexity simplification, one extra payout loop avoided).

**Stated MVP simplifications, not final economic design:**
- **Committee selection is pseudo-random** (seeded from block data via
  `keccak256(eventId, tier, blockhash, timestamp)`), not VRF-based — not
  resistant to a miner/validator choosing whether to include the triggering
  transaction in a favorable block. See `docs/threat-model.md`.
- **No variable staking.** The source design for this ladder described
  committee vote weight as `min(bondStaked, MAX_WEIGHT_CAP)`, implying
  resolvers choose their own stake per vote. The MVP has no on-chain
  staking/reputation token (same deferred-scope decision as base-layer
  quorum below), so every committee member in a tier posts the *same* fixed
  bond — which makes the weight cap degenerate to one-member-one-vote by
  construction. This already defeats a single large stake dominating a
  committee, without inventing a variable-stake mechanism the rest of the
  protocol doesn't have.
- Every number above (`N1`/`N2`, the three bond amounts, both windows, the
  66% bar, the 1/3-1/3-1/3 split) is a flat MVP constant, same style as
  `DISPUTE_BOND` always was — not per-event configurable, not a claim about
  the final tuned economics.

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
  market could reference an event that can structurally never resolve. This
  same check is also the load-bearing half of the cycle-impossibility proof
  below.
- **Bounded fan-in and depth**: `operands.length <= MAX_CHILDREN_PER_NODE`
  (10) and composition depth `<= MAX_DAG_DEPTH` (8), enforced at
  `createComposite` time — see the DAG-bounds section below.

**RE-FINALIZED — composite ID derivation is now canonicalized for
order-independent operators.** `compositeId = keccak256(op,
canonicalOperands, window)`. This reverses the original MVP decision that
operand order was always significant: `AND`, `OR`, `NOT` (a single operand,
trivially canonical), and `WITHIN` (symmetric — `|t0-t1|` doesn't care which
side is which) now have their operand array **sorted ascending before
hashing and storing**, so `AND(a,b)` and `AND(b,a)` dedupe to the same
on-chain composite automatically — no caller-side canonicalization needed
anymore, unlike the original design. **`BEFORE` is the deliberate
exception**: "A before B" and "B before A" are different claims, so sorting
its operands would silently corrupt semantics — its order is preserved
exactly as given, and `BEFORE(a,b)` / `BEFORE(b,a)` remain (correctly)
distinct composite IDs. This is what makes the "a resolved fact is a
standing, reusable object" claim in `docs/architecture.md` actually hold for
commutative compositions: two apps independently composing `AND(eventA,
eventB)` get the same object whichever order they happened to list the
operands in.

**FINALIZED — structural DAG bounds and the cycle-impossibility proof.**
`MAX_CHILDREN_PER_NODE` (10) and `MAX_DAG_DEPTH` (8) are flat MVP constants
closing the griefing vector where composability — Novak's core
differentiator — becomes an attacker's cheapest lever: chaining/fanning out
composites into a graph other applications are implicitly forced to pay to
walk. Depth is tracked per composite (`max(operand depths) + 1`; any
primitive Registry event is implicitly depth 0) and checked at creation
time; so is fan-in. Cycles are not just discouraged, they are
**cryptographically impossible**: `compositeId` is the hash of its own
`(op, operands, window)`, so a composite can only reference its own ID as an
operand by knowing that ID before computing it — which requires inverting
`keccak256`. Combined with the existing "every operand must already exist"
check, every edge in the composition DAG points strictly to a node created
in an earlier transaction, so no cycle of any length can be constructed.
Full write-up: `docs/threat-model.md`.

**FINALIZED — terminal-state propagation (`Voided`/`Expired` no longer stall
a composite forever).** Before this, a `Voided` (or, pre-`Expired`, a
never-observed) primitive left every composite depending on it stuck
reporting "not yet resolved" **indefinitely** — there was no way to tell
"will resolve eventually" from "will never resolve." `EventComposer` now
reads each operand as one of four states — `Unresolved` / `True` / `False` /
`Voided` (an `Expired` primitive reads identically to `Voided` from a
composite's perspective) — and applies this precedence uniformly across
every operator:
1. A decisive short-circuit wins regardless of any sibling's state
   (`And`/`Before`/`Within` on any `False`; `Or` on any `True`).
2. Otherwise, any genuinely-pending (`Unresolved`) sibling keeps the whole
   composite `Unresolved` — normal openness, not a stall, since that
   sibling might still produce the decisive short-circuit above (e.g. still
   come back `False`, which would dominate a `Voided` sibling anyway).
3. Otherwise, any `Voided` sibling makes the composite `Voided` — the
   actual fix.
4. Otherwise every sibling is decided and the normal logical/temporal
   comparison applies.
`isResolved`/`getResolvedOutcome` (kept for `EventBus` backward
compatibility) only ever report `True`/`False` — a `Voided` composite
reports `isResolved == false` through that boolean-only API, same as "not
yet resolved," so `EventBus`/`Settlement`/`Market` needed zero code changes;
a `Voided` composite market simply stays permanently unsettleable, which is
already the accepted, documented MVP behavior for any event that never
resolves. Callers that need to distinguish "pending" from "permanently
voided" use the new `getStatus(compositeId)`. This precedence table is
genuinely novel surface area — UMA has no composition layer, so it has never
had to define what "an assertion that never resolved" means to a
*downstream* assertion, because no such downstream relationship exists on
UMA. Full table: `docs/threat-model.md`.

**FINALIZED — timestamp source for temporal ops.** For a primitive operand,
the timestamp is `IEventRegistry.Outcome.finalizedAt` (set when
`EventRegistry.finalize`/`finalizeFromDispute` runs). For a **nested
composite** operand, the timestamp is when that composite's own `tryResolve`
call first cached a result (`EventComposer._resolvedAt`). This is a known
simplification: a composite's effective "occurred at" time is *resolution*
time, not the real-world time its underlying condition became true — a
composite that sits unresolved for a week after its operands finalize will
report that later resolution time to any BEFORE/WITHIN composing over it.
For the MVP's single level of composition (as in the canonical demo) this
doesn't come up; it becomes relevant for compositions-of-compositions where
wall-clock accuracy of "when" matters. (This timestamp is never consulted
when an operand's status is `Unresolved` or `Voided` — see the propagation
precedence above.)

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
observations, quorum (base + the ambiguous-split escalation path), bonded
two-tier dispute/committee escalation (`DisputeManager`), event finalization,
terminal non-outcomes (`Voided`/`Expired`) with propagation through
composition, structural DAG bounds, on-chain pull-based Event Bus (serving
both primitive and composite events), AND/OR/NOT + BEFORE/WITHIN composition
with canonicalized composite identity, derivatives market with event-based
settlement, TypeScript SDK, local deployment scripts, end-to-end demo.

**Explicitly deferred:** cross-chain events, ZK oracle proofs, permissionless
resolver marketplace (staking/reputation tokens), MEV mechanisms,
high-frequency event streams, perpetual derivatives, complex liquidation
systems, production-scale token economics, a push/relayer execution layer
(Issue #13 — the one P1 item with zero code so far), and real testnet
deployment (needs a funded key/RPC — see `docs/SPEC_AND_TASKS.md` Issue #20).
**Note on "decentralized dispute arbitration":** the MVP moved from a single
owner deciding disputes to a bonded, two-tier committee ladder
(`DisputeManager`) that never escalates to a token-governance vote — a real
structural change, not a relabeling. It is still not what "decentralized"
would mean at full maturity: committee selection is block-data
pseudo-randomness (not VRF-based, not front-running-resistant), and there is
no on-chain staking/reputation token behind committee membership, so "every
committee member posts the same fixed bond" is a stand-in for genuine
stake-weighted selection. Don't present this as fully solved — see
`docs/threat-model.md` for the precise residual gap.
