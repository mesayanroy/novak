# Novak Architecture

Novak (Neural Event Network / NEN) is a decentralized, composable event bus
for Ethereum. Real-world and on-chain events are resolved, finalized, and
stored **once**, then composed (AND/OR/NOT, BEFORE/WITHIN) and read by many
independent smart contracts — instead of every application building and
trusting its own oracle integration from scratch.

The one-sentence version for a dev skimming this file: **an oracle answers a
question once for whoever asked; Novak turns every answered question into a
standing on-chain object that anyone can reference again, and lets you build
new objects out of old ones.**

## The five layers

Novak is five layers stacked strictly bottom-to-top. Each layer has one job,
and — this is the load-bearing rule, see below — a layer may only talk to the
interface directly beneath it. It can never reach around that layer into the
one below.

| # | Layer | Job | Where it lives |
|---|-------|-----|-----------------|
| 1 | **Source** | Raw material: price feeds, Fed announcements, sports results, on-chain state — anything an adapter can fetch. Novak never touches this directly. | External APIs / chains that `resolver/adapters/` watch |
| 2 | **Resolver & evidence** | Independent resolvers watch a source and submit `{resolver, eventId, outcome, evidence, evidenceHash, timestamp}` — never a bare outcome. N-of-M matching observations turn into one proposed outcome. | `resolver/`, `EventRegistry.submitObservation` |
| 3 | **Dispute & finalization** | A proposed outcome sits in a bonded challenge window before it's trusted. Unchallenged → auto-finalizes. Challenged (or ambiguous — see below) → a bonded, two-tier committee escalation ladder decides, never a token vote. Once finalized, the Event is immutable — the canonical fact the rest of the protocol builds on. | `contracts/EventRegistry.sol` (`finalize`, `expire`), `contracts/DisputeManager.sol` |
| 4 | **Event Bus & Composition** | The protocol's core idea. `EventBus` exposes finalized events for pull-based reads — consumers never know or care which resolver produced them. `EventComposer` builds new deterministic events out of finalized ones (`A AND B`, `A WITHIN 48h OF B`, ...), referencing primitive IDs instead of copying state. A composite is itself just another finalized event — composable again, readable by any app. | `contracts/EventBus.sol`, `contracts/EventComposer.sol` |
| 5 | **Application** | Derivatives markets today; insurance or prediction markets tomorrow. Reads exclusively from the Event Bus, referencing a specific (possibly composite) event ID for settlement. | `derivatives/Market.sol`, `Settlement.sol`, `PositionManager.sol` |

## The one rule that must never be broken

**A layer depends only on the interface of the layer directly beneath it —
never on a specific implementation two or more layers down.** Concretely for
the MVP: `derivatives/Market.sol` holds only a `Settlement` reference, and
`Settlement.sol` holds only an `IEventBus` reference. No application contract
ever imports `EventRegistry`, `EventComposer`, or a resolver — resolver
identity is invisible to every consumer. This is enforced by a regression
test: `test/unit/Market.t.sol::test_market_onlyHoldsSettlementReference`. If
you add a new consumer contract, add an equivalent guard test. The same
principle holds on the TS side: the frontend and SDK read event state
through `eventBus`/`settlement`/`market` ABI calls only, never a resolver's
internals.

Why this matters in practice: it's what lets the resolver network evolve —
swap adapters, add resolvers, change quorum rules — without touching, or even
redeploying, a single market built on top of it.

## Event lifecycle

```
CREATE -> OPEN -> OBSERVATIONS SUBMITTED -> PROPOSED OUTCOME -> DISPUTED
       -> FINALIZED (or VOIDED / EXPIRED) -> AVAILABLE TO CONSUMERS
```

- **CREATE / OPEN** — an `EventSpec` is registered in the `EventRegistry`
  (`contracts/EventRegistry.sol`). The event is now open for observation.
- **OBSERVATIONS SUBMITTED** — independent resolvers (`resolver/`) fetch
  source data via adapters and submit observations + evidence hashes.
- **PROPOSED OUTCOME** — once resolver observations reach quorum
  (`EventSpec.quorumThreshold` distinct, authorized, byte-identical
  submissions), an outcome is proposed on-chain.
- **DISPUTED** — during the dispute window, anyone can challenge a proposed
  outcome by bonding into `DisputeManager`, which opens a Tier-1 committee
  (up to 7 resolvers) requiring ≥66% agreement; failing to converge escalates
  to Tier-2 (up to 15). This is also where an *ambiguous* quorum (observations
  split, none reaching threshold before the deadline) gets routed — a case
  that previously had no path forward at all.
- **FINALIZED (or VOIDED / EXPIRED)** — undisputed → auto-finalizes once the
  window elapses. Disputed and a committee converges → finalizes with that
  outcome (the losing side's bonds are slashed). Disputed and neither tier
  converges → permanently `Voided`, bonds refunded — **never** escalated to a
  vote of any kind. Nobody ever observed the event at all →  `Expired`. See
  `docs/protocol-spec.md` for the full bonding/committee-selection design and
  its stated limitations (still not full stake-weighted decentralization).
- **AVAILABLE TO CONSUMERS** — the `EventBus` exposes the finalized outcome
  for pull-based reads by any application contract, forever.

## Component separation

```
                     ┌───────────────────────┐
  resolver network → │     EventRegistry      │  (canonical state, lifecycle)
  (off-chain nodes)  └───────────┬────────────┘
                                 │  finalized primitives
                      ┌──────────┴──────────┐
                      │     EventComposer     │  (AND/OR/NOT, BEFORE/WITHIN)
                      └──────────┬──────────┘
                                 │  finalized composites
                         ┌───────┴────────┐
                         │    EventBus     │  ← the ONLY thing consumers see
                         └───────┬────────┘
                                 │  pull-based reads
                    ┌────────────┴─────────────┐
                    │   Derivatives Market       │  (first consumer app)
                    │  Market / PositionManager  │
                    │       / Settlement          │
                    └────────────────────────────┘
```

- **Event Registry** — canonical event definitions and lifecycle state
  (`contracts/EventRegistry.sol`). Owns quorum counting, proposal, and
  finalization; deliberately knows nothing about committees or bonding
  economics — it only exposes a narrow, `onlyDisputeManager`-gated set of
  state transitions that `DisputeManager` drives.
- **Resolver Network** — independent off-chain processes
  (`resolver/node/index.ts`) that submit observations + evidence hashes
  directly to `EventRegistry.submitObservation`. Never called by consumer
  contracts.
- **Dispute Manager** (`contracts/DisputeManager.sol`) — a bonded, two-tier
  committee escalation ladder between a proposed (or ambiguous) outcome and
  finalization: Tier-1 (≤7 resolvers, ≥66% agreement) → Tier-2 (≤15) →
  permanently `Voided` if neither converges. Never escalates to a
  token-weighted vote — the concrete mechanism behind the UMA comparison
  below. Stated limitations (pseudo-random committee selection, no real
  staking token yet) are in `docs/protocol-spec.md` and
  `docs/threat-model.md`.
- **On-chain Event Bus** (`contracts/EventBus.sol`) — pull-based read access
  to finalized events. Transparently serves **both** primitive events
  (finalized in the Registry) and composite events (resolved in the
  Composer) — the only contract applications should import.
- **Event Composer** (`contracts/EventComposer.sol`) — builds composite
  events (AND/OR/NOT/BEFORE/WITHIN) from primitive event IDs, deterministically,
  without duplicating Registry state. Composite identity is canonicalized
  (operands sorted) for every order-independent operator — `AND(a,b)` and
  `AND(b,a)` are the same object — except `BEFORE`, where order is the claim
  being made. Composition depth and fan-in are structurally bounded, and
  cycles are cryptographically impossible (see `docs/threat-model.md`). A
  `Voided`/`Expired` operand propagates deterministically instead of
  stalling a dependent composite forever. `tryResolve` caches its result
  forever once computed.
- **Subscription Layer** — pull model for the MVP (`SubscriptionManager`
  records subscription intent only); push delivery is explicitly deferred
  (see Issue #13 in `docs/SPEC_AND_TASKS.md` — zero code so far).
- **Derivatives Market** (`derivatives/Market.sol` + `Settlement.sol` +
  `PositionManager.sol`) — first consumer application; a parimutuel YES/NO
  pool that settles against composite (or primitive) event outcomes read
  through `Settlement` → `EventBus`.

## End-to-end trace (the same architecture as one flow)

This is the exact path verified against a live local anvil chain in
`examples/end-to-end-flow.ts`:

1. **Create two primitive events** in the Registry — e.g. "ETH > $5,000" and
   "Fed cuts ≥25bp" (Layer 1→3 setup).
2. **Resolvers observe independently** and submit matching outcomes; each
   event reaches quorum and proposes an outcome (Layer 2).
3. **Dispute window elapses** with no challenge; both events finalize
   (Layer 3). Each is now an immutable, canonical `Outcome` in the Registry.
4. **Compose** `WITHIN(48h)` over the two finalized event IDs in the
   `EventComposer` (Layer 4). This creates one new event ID —
   `CompositeEvent #N` — that did not exist before and required zero new
   off-chain resolution.
5. **Resolve the composite** — `tryResolve` reads both primitives through
   their finalized outcomes, applies the temporal check, and caches the
   result forever.
6. **Create a market** referencing only that composite event ID through
   `Settlement` (Layer 5). The market never learns which resolvers produced
   the underlying primitives.
7. **Two opposing deposits, then settle and claim** — `Settlement` reads the
   composite's outcome from the `EventBus`, and `Market` pays out the
   parimutuel pool accordingly.

Step 4 is the part with no equivalent primitive in either competing design —
see below.

## Design principles

- Events are first-class objects with a deterministic specification and
  outcome schema — not arbitrary oracle blobs.
- Resolution (resolver layer) is strictly separated from consumption
  (application layer).
- Composition is deterministic: same operator + same operand outcomes, same
  result, always.
- Minimize on-chain computation: canonical state, commitments, verification,
  and settlement live on-chain; source retrieval and heavy processing happen
  off-chain in the resolver.
- Pull before push: no automatic callback/trigger execution in the MVP.

## Why this is architecturally ahead of UMA (our closest competitor)

Chainlink and UMA both have live TVL, audits, and years of adversarial
testing that a hackathon MVP hasn't earned yet — this section is not a
security claim. It's a claim about **what the reusable unit of truth is**,
and how tightly an application is coupled to how that truth was produced.

**Chainlink** is a continuous data-delivery network — feeds and Functions
calls deliver data on-chain, but there's no protocol-level object for "did
event X happen," and no way to combine two independently-resolved facts into
a new on-chain primitive other apps can reference. Combination logic is
glue code every consumer writes and trusts itself.

**UMA's Optimistic Oracle** is architecturally the closer comparison —
propose an outcome, open a challenge window, escalate on dispute — but it
resolves **one request at a time**, for whoever asked it. Two consequences
follow directly from that:

1. **No composition primitive.** If a market needs "A AND B within 48h,"
   UMA gives you two separately-settled assertions; the market itself has to
   write and trust the code that combines them. Novak's `EventComposer` does
   that combination at the protocol level — the output (`CompositeEvent #N`)
   is a first-class finalized event with its own ID, exactly like a
   primitive, and can be composed again.
2. **No reuse across apps.** An OOv3 assertion is typically bespoke to its
   requester — its own identifier, bond currency, liveness window. Two
   unrelated apps asking "did the Fed cut on date X?" each pay full oracle
   cost. On Novak, the first resolution finalizes the event once in the
   Registry; every later app reads it off the `EventBus` for free — the
   network gets cheaper to build on as more apps use it, not linearly more
   expensive.

There's also a real, documented failure mode worth naming honestly: when a
UMA assertion escalates past a simple challenge, it goes to the DVM, where
token holders vote and a 65% majority decides. A $60M Polymarket market over
a MicroStrategy Bitcoin sale sat stuck in exactly that queue, prompting a
Wall Street Journal investigation into whether token-voting power — not the
facts — was effectively deciding the payout. Novak's dispute path resolves
on bonded evidence and a deterministic protocol rule instead: a challenged
(or ambiguous) outcome goes to a bonded Tier-1 committee (≤7 resolvers,
≥66% agreement), escalates to Tier-2 (≤15) if that fails to converge, and
becomes permanently `Voided` — a hard floor, not a retry loop — if Tier-2
also fails. **At no point does this path escalate to a token-weighted vote.**
That's a concrete, implemented, tested mechanism
(`contracts/DisputeManager.sol`), not just a design goal. **Caveat, stated
plainly so nobody overclaims it in a pitch:** this is not yet *full*
decentralization — committee selection is block-data pseudo-randomness, not
VRF-based, and there's no on-chain staking/reputation token behind committee
membership (every member in a tier posts the same flat bond rather than a
variable stake). See `docs/protocol-spec.md` and `docs/threat-model.md` for
the precise residual gap. The honest claim is "structurally cannot fall back
to a governance vote," not "fully trustless, fully decentralized" — the
former is true today; the latter is the direction this is built to grow
into.

| Dimension | Chainlink | UMA (Optimistic Oracle) | Novak |
|---|---|---|---|
| Core primitive | Continuous data feed | Discrete, per-request assertion | First-class `Event` object with a full lifecycle |
| Composability | None natively — lives in each consumer contract | None natively — each assertion is standalone | Native `EventComposer`: AND/OR/NOT/BEFORE/WITHIN produce new composite events referencing primitive IDs, with canonicalized identity for order-independent operators |
| Reuse of a resolved fact | High for feeds — the precedent Novak generalizes | Low — assertions are typically single-purpose | High by design — every finalized event, primitive or composite, is a standing object any future app can reference without re-resolving |
| Dispute resolution | N/A at the datum level; feed integrity via node aggregation + staking | Bonded challenge → escalates to token-holder DVM vote | Bonded challenge (or ambiguous quorum) → two-tier committee ladder (≥66% agreement) → permanently `Voided` if unresolved. Never a token vote — implemented in `DisputeManager.sol`, not just proposed |
| App-to-resolver coupling | Apps call a specific feed/consumer contract | Apps integrate against the specific assertion they created | Apps read only the `EventBus`; resolver identity is architecturally invisible (enforced by test) |

**The practical pitch:** on Chainlink or UMA today, "pay out if ETH > $5,000
AND the Fed cuts ≥25bp within 48 hours" isn't one settleable object — it's
glue code the market writes and trusts, wired to two separate oracle
integrations. On Novak, that's `CompositeEvent #N` — a first-class finalized
object this market settles against, and that an unrelated insurance or
prediction-market contract could reference later without ever touching a
resolver or re-deriving the composition logic. Not "a more secure oracle" —
"oracle output becomes a reusable, composable Ethereum primitive instead of
a one-off integration."

## MVP scope

See `docs/protocol-spec.md` for the full in-scope / deferred list, and
`docs/SPEC_AND_TASKS.md` for the milestone-by-milestone deliverables tracker
with what's verified done vs. explicitly left for later.
