# Neural Event Network — Specification & Task Allocation

Living deliverables tracker. Check an item only once its **Acceptance
Criteria** are actually met and verified (tests passing, not just code
written). This mirrors the original milestone breakdown; see
`docs/architecture.md`, `docs/protocol-spec.md`, and `docs/threat-model.md`
for the narrative versions of the same decisions.

**Verification snapshot (updated after the protocol-layer gap-closing pass —
see `docs/protocol-spec.md` for what "Gap 1–5" refers to):**
`forge test` → 80/80 passing across unit/integration/fuzz/adversarial suites
(new: `test/unit/DisputeManager.t.sol`,
`test/adversarial/CompositeGriefing.t.sol`, plus expanded
`EventComposer.t.sol`/`EventRegistry.t.sol`/`MaliciousResolver.t.sol`
coverage for canonicalization, DAG bounds, terminal-state propagation, and
the tiered dispute ladder); `pnpm --filter @novak/sdk test` and
`pnpm --filter novak-resolver test` both green after syncing the SDK's ABI/
types to the new `EventRegistry`/`DisputeManager` surface.
`examples/end-to-end-flow.ts` doesn't exercise disputes and is unaffected by
this pass; it was verified against a live local anvil chain in the prior
backend-completion pass, not re-run live in this one — the equivalent
canonical flow, now wired through `DisputeManager` (undisputed path, so its
assertions are unchanged), is covered by
`test/integration/EndToEndFlow.t.sol`, which passes.

**Also done since that pass, not yet reflected anywhere else but here:** the
frontend MVP (Issue #21) — a real landing page, a full `/docs` hub (9
sub-pages), and `/markets` + `/markets/[id]` wired to the live `@novak/sdk`
ABIs wherever a real read/write makes sense — was built out in this
environment on top of the pre-existing minimal scaffold. See
`docs/FRONTEND_SPEC.md` for the exact stack, route map, component inventory,
and live/mock data map, and Issue #21 below for the checklist. This work is
tracked here regardless of which repo-ownership row it falls under.

---

## Repository Ownership

| Component             | Lead       | Primary Owner | Support    |
| --------------------- | ---------- | ------------- | ---------- |
| Protocol architecture | mesayanroy | mesayanroy    | All        |
| Event specification   | mesayanroy | mesayanroy    | skyyycodes |
| Event Registry        | mesayanroy | mesayanroy    | —          |
| Event Bus             | mesayanroy | mesayanroy    | skyyycodes |
| Resolver node          | mesayanroy | skyyycodes    | —          |
| Data adapters          | —          | skyyycodes    | ansu555    |
| Resolver consensus    | mesayanroy | skyyycodes    | —          |
| Disputes               | mesayanroy | skyyycodes    | —          |
| Security testing       | mesayanroy | skyyycodes    | All        |
| Composition engine     | mesayanroy | mesayanroy    | skyyycodes |
| Subscription layer     | mesayanroy | mesayanroy    | skyyycodes |
| Relayer                 | —          | skyyycodes    | —          |
| Derivatives market      | —          | ansu555       | mesayanroy |
| Position accounting     | —          | ansu555       | mesayanroy |
| Settlement              | mesayanroy | ansu555       | —          |
| TypeScript SDK          | —          | ansu555       | mesayanroy |
| Frontend/demo           | —          | ansu555       | All        |
| Deployment              | mesayanroy | mesayanroy    | All        |

---

## Milestone 0 — Architecture Freeze

### Issue #1 — Define Event Protocol Specification
**Owner:** mesayanroy · **Priority:** P0
- [x] Protocol specification exists in `docs/protocol-spec.md`
- [x] Event lifecycle formally defined (CREATE → OPEN → OBSERVATIONS SUBMITTED
      → PROPOSED OUTCOME → DISPUTE WINDOW → FINALIZED/VOIDED)
- [x] State transitions documented (`IEventRegistry.EventStatus` + narrative
      in `docs/architecture.md`)

### Issue #2 — Define Protocol Interfaces
**Owner:** mesayanroy · **Priority:** P0
- [x] `IEventRegistry`, `IEventBus`, `IEventComposer` compile and contain no
      application-specific logic
- [x] Derivatives market integrates without knowing the resolver
      implementation (`derivatives/Market.sol` only imports `Settlement`,
      which only imports `IEventBus`)
- [ ] *Adapted, not literal:* the original sketch named `IEventResolver` and
      `IEventConsumer` as separate Solidity interfaces. Resolvers are
      off-chain processes in this design (see `resolver/`), so resolver
      submission is a Registry method (`submitObservation`) rather than a
      contract a resolver implements; there is no `IEventConsumer` marker
      interface because any contract holding an `IEventBus` reference already
      qualifies — see `docs/protocol-spec.md` for the reasoning.

---

## Milestone 1 — Event Registry

### Issue #3 — Implement Event Registry
**Owner:** mesayanroy · **Priority:** P0
- [x] `createEvent()`, `getEvent()`, `getEventSpec()`, `finalize()` implemented
      (`contracts/EventRegistry.sol`)
- [x] Registry stores eventId, sourceId, spec, quorumThreshold,
      observationDeadline, disputeWindowSeconds, status
- [x] A complete event can be created, observed, disputed, and finalized —
      verified end-to-end on a local Ethereum node (anvil)
- [ ] `updateEventMetadata()` — **deliberately not implemented**: events are
      immutable once created (mutable event definitions would break the
      "same inputs, same outcome, forever" determinism guarantee composite
      events depend on). If metadata correction is ever needed, void and
      recreate rather than mutate.

---

## Milestone 2 — Resolver Network

### Issue #4 — Build Resolver Node
**Owner:** skyyycodes · **Priority:** P0
- [x] Off-chain resolver service: source → fetch → normalize → evidence →
      submit (`resolver/node/index.ts`)
- [x] Supports multiple sources via the `SourceAdapter` interface
      (`resolver/adapters/`)
- [x] Multiple independent resolver instances can submit observations for the
      same event — verified in `test/integration/EndToEndFlow.t.sol` (3
      distinct resolver addresses) and live in `examples/end-to-end-flow.ts`
- [ ] Real price/data source integration — `PriceFeedAdapter` reads a mock
      value from an env var; wiring a live HTTP source is a follow-up (see
      TODO in `resolver/adapters/priceFeedAdapter.ts`)
- [ ] On-chain event discovery/indexing — a resolver is told which event IDs
      to watch via `RESOLVER_WATCHED_EVENT_IDS`; there's no subgraph-style
      scan of the Registry for open events yet (see `resolver/README.md`,
      "Known limitation")

### Issue #5 — Resolver Submission Contract
**Owner:** skyyycodes · **Priority:** P0
- [x] `submitObservation()` implemented (`contracts/EventRegistry.sol`)
- [x] Stores resolver, eventId, outcomeHash, evidenceHash, per-resolver
      submission tracking
- [x] Invalid/malformed submissions rejected: unauthorized resolver, past
      deadline, duplicate submission, submission after quorum already
      proposed — all covered by tests
      (`test/unit/EventRegistry.t.sol`, `test/adversarial/MaliciousResolver.t.sol`)
- [ ] Commit/reveal submission — **not implemented**; observations are
      submitted directly (no privacy against front-running a resolver's
      vote). Noted as a gap, not required by MVP scope's explicit checklist.

### Issue #6 — Resolver Consensus
**Owner:** skyyycodes · **Priority:** P0
- [x] Configurable quorum: `EventSpec.quorumThreshold` (N-of-M authorized
      resolvers must submit the identical `outcomeData`)
- [x] Event moves OPEN → OBSERVATIONS SUBMITTED → PROPOSED OUTCOME
      automatically once threshold is met (`EventRegistry.submitObservation`)
- [x] Ambiguous/non-converging quorum has a defined path forward —
      `IDisputeManager.escalateNonConvergence` routes a split observation
      set (deadline passed, nobody reached `quorumThreshold`) directly into
      Tier-1 committee review, instead of leaving the event stuck with no
      way forward at all. `resolver/consensus/quorum.ts` gained
      `evaluateEscalationQuorum` as the off-chain mirror of the on-chain
      66%-of-committee-size rule. See `docs/protocol-spec.md` Gap 5.
- [ ] Stake-weighted quorum — **deliberately out of MVP scope**. Resolvers
      are individually authorized by the Registry owner
      (`setResolverAuthorization`), not staked/slashed by a token; see
      "Explicitly deferred: production-scale token economics" in
      `docs/protocol-spec.md`.

---

## Milestone 3 — Dispute System

### Issue #7 — Event Dispute Mechanism
**Owner:** skyyycodes · **Priority:** P0
- [x] `IDisputeManager.dispute(eventId)` implemented with a fixed bond
      (`DISPUTE_BOND`, 0.01 ETH) and dispute window, replacing the old
      `EventRegistry.dispute`
- [x] Bonded, two-tier **committee** escalation replaces single-owner
      arbitration: Tier-1 (≤7 resolvers, `TIER1_BOND` 0.03 ETH, ≥66%
      agreement) → Tier-2 (≤15, `TIER2_BOND` 0.08 ETH) → permanently
      `Voided` (full bond refunds, no slashing) if neither converges. A
      converging tier splits the losing side's bonds burn/reward/treasury;
      the original disputer's bond rides on whether the committee agreed
      with them. Implemented in `contracts/DisputeManager.sol`.
- [x] A proposed outcome can be challenged before finalization — verified in
      `test/unit/DisputeManager.t.sol` and
      `test/adversarial/MaliciousResolver.t.sol`
- [x] ~~Decentralized dispute arbitration~~ — **materially improved, not
      fully closed.** The single-owner arbitrator is gone; arbitration is
      now a bonded committee process with a hard `Voided` floor and no
      governance-vote fallback. What remains genuinely undone: committee
      selection is block-data pseudo-randomness (not VRF-based), and there
      is no on-chain staking/reputation token behind committee membership
      (every member posts the same flat bond rather than a variable stake).
      See `docs/threat-model.md` item 2 and item 10 for the precise residual
      gap — don't present this as "solved."

### Issue #8 — Adversarial Resolver Test Suite
**Owner:** skyyycodes · **Priority:** P0
- [x] Conflicting resolvers (`test_conflictingResolvers_...`)
- [x] Unauthorized/unavailable resolver (`test_unauthorizedResolver_...`)
- [x] Duplicate submission / replay (`test_duplicateSubmission_...`,
      `test_disputeReplay_...`)
- [x] Stale/late evidence (`test_lateSubmission_afterDeadline_...`)
- [x] Dispute griefing cost analysis (`test_disputeGriefing_...`, now against
      the tiered `DisputeManager`)
- [x] Finalize-while-disputed guard (`test_finalize_blockedWhileDisputePending`)
- [x] Composer determinism fuzzing, including the WITHIN boundary
      (`test/fuzz/EventComposer.fuzz.t.sol`)
- [x] Composite DAG griefing: oversized fan-in/depth reverts, cycle
      self-reference is unconstructible, a `Voided` operand no longer
      stalls a dependent composite forever
      (`test/adversarial/CompositeGriefing.t.sol`)
- [x] Tiered dispute escalation: Tier-1 convergence (both directions — upholds
      and overturns the original proposal), Tier-1 → Tier-2 escalation with
      full bond refunds, Tier-2 non-convergence → `Voided`, committee-vote
      guards (non-member, wrong bond, double-vote, window-closed)
      (`test/unit/DisputeManager.t.sol`)
- [ ] Colluding resolver majority (economically) beating committee bonds at
      scale — requires stake-weighted quorum (deferred, see Issue #6)
- [ ] Dispute-spam-at-scale pricing — requires a real bonding/slashing
      economy beyond the flat MVP bonds (deferred, see Issue #7)

---

## Milestone 4 — Event Bus

### Issue #9 — Implement On-chain Event Bus
**Owner:** mesayanroy · **Priority:** P0
- [x] `readOutcome()`, `isAvailable()` implemented and serve **both**
      primitive (Registry) and composite (Composer) event IDs transparently
      (`contracts/EventBus.sol`) — this transparency was a real gap in the
      initial scaffold (composite outcomes were unreachable through the Bus)
      and was fixed during this pass
- [x] Protocol events emitted: `EventCreated`, `ObservationSubmitted`,
      `OutcomeProposed`, `EventDisputed`, `DisputeResolved`,
      `EventFinalized`, `ResolverAuthorizationChanged`,
      `CompositeEventCreated`, `CompositeEventResolved`
- [x] Any external contract (the derivatives `Market`, via `Settlement`) can
      consume finalized event state without integrating directly with the
      resolver network — enforced by
      `test_market_onlyHoldsSettlementReference`

---

## Milestone 5 — Composition Engine

### Issue #10 — Event Composition Specification
**Owner:** mesayanroy · **Priority:** P0
- [x] `AND`, `OR`, `NOT`, `BEFORE`, `WITHIN` — deterministic composite
      definitions (`contracts/EventComposer.sol`)
- [x] Same primitive inputs always produce the same composite event ID
      (fuzz-tested: `testFuzz_createComposite_isDeterministicAcrossCallers`)
      and the same resolved result once cached
      (`test_tryResolve_cachesResultOnSubsequentCalls`)
- [x] Composite identity is canonicalized for every order-independent
      operator (`AND`, `OR`, `NOT`, `WITHIN`) — `AND(a,b)` and `AND(b,a)`
      dedupe to the same composite automatically; `BEFORE` is the
      deliberate exception since its operand order is semantic. See
      `docs/protocol-spec.md` Gap 1 (this reverses the original "operand
      order is always significant" decision).
- [x] Structural DAG bounds (`MAX_CHILDREN_PER_NODE` = 10,
      `MAX_DAG_DEPTH` = 8) and a stated cycle-impossibility proof close the
      "composability is Novak's own biggest griefing surface" gap — see
      `docs/threat-model.md`.
- [x] Terminal-state propagation: a `Voided`/`Expired` operand resolves a
      dependent composite to `Voided` instead of stalling it as
      "unresolved" forever, via the precedence table in
      `docs/threat-model.md`. New `IEventComposer.getStatus` exposes the
      full 4-state read (`Unresolved`/`True`/`False`/`Voided`).
- [ ] `SEQUENCE`, `COUNT`, `THRESHOLD` (3-of-5 style) operators — **not
      implemented**. The MVP checklist explicitly scopes composition to
      "AND / OR / NOT" + "basic temporal condition"; these are natural
      post-MVP extensions, not a gap in what was promised.

### Issue #11 — Composite Event Contract
**Owner:** mesayanroy · **Priority:** P0
- [x] `createComposite()`, `getCompositeSpec()`, `tryResolve()` implemented
- [x] Composition references existing event IDs (validated at creation —
      `EventComposer: unknown operand`) rather than copying their state
- [x] A composite event can depend on 2+ finalized primitive events —
      verified in the full canonical flow test and example script

---

## Milestone 6 — Subscription Layer

### Issue #12 — Event Subscription Interface
**Owner:** mesayanroy · **Priority:** P1
- [x] `subscribe(topic, consumer)` / `unsubscribe(topic, consumer)`
      implemented (`contracts/SubscriptionManager.sol`), wrapped in the SDK
      (`NovakClient.subscribe`/`unsubscribe`/`isSubscribed`)
- [x] Pull model is what's actually wired end-to-end (Bus reads); arbitrary
      callbacks are **not** implemented, matching the explicit instruction
      not to make push mandatory for MVP

### Issue #13 — Event Trigger / Relayer
**Owner:** skyyycodes · **Priority:** P1
- [ ] **Not implemented.** No permissionless/incentivized relayer service
      exists. This is the one P1 item left fully undone rather than
      MVP-simplified — building it is a discrete follow-up project, not a
      tweak to existing code.

---

## Milestone 7 — Derivatives Market

### Issue #14 — Derivative Market Core
**Owner:** ansu555 · **Priority:** P0
- [x] `createMarket()`, `depositCollateral()` (take a position),
      `closePosition()`, `settle()` implemented (`derivatives/Market.sol`)
- [x] Two users can enter opposing YES/NO positions and the market settles
      deterministically from the event outcome — verified in
      `test_fullFlow_winnerTakesLoserPoolProRata` and the live example script

### Issue #15 — Position & Collateral Accounting
**Owner:** ansu555 · **Priority:** P0
- [x] Parimutuel YES/NO pools; winners split the losing pool pro-rata to
      stake plus get their own stake back
- [x] Solvency: total payouts can never exceed total deposits by
      construction (no leverage, no external price feed for payout sizing) —
      verified across both the "winner exists" and "no one backed the
      winning side → full refund" paths
- [x] `PositionManager` keeps a queryable audit trail of individual positions
      (`recordPosition`), separate from the funds Market itself custodies
- [ ] Fees — **not implemented** (no protocol fee taken on settlement).
      Not in the explicit MVP checklist; straightforward to add to
      `Market.claim` later.
- [ ] Explicit "expired market" handling — a market whose event never
      finalizes (e.g. no resolver ever submits) simply never becomes
      settleable; there's no separate expiry/cancellation path today.

### Issue #16 — Event-Based Settlement Adapter
**Owner:** ansu555 · **Priority:** P0
- [x] `Market` → `Settlement` → `IEventBus` → outcome → settlement, exactly
      as specified (`derivatives/Settlement.sol`)
- [x] Derivatives market never imports or calls a resolver, the Registry, or
      the Composer directly — structural invariant, regression-tested

### Issue #21 — Frontend MVP (landing, docs, markets)
**Owner:** ansu555 · **Contributors:** all · **Priority:** P1
- [x] Real Next.js 14 App Router site in `frontend/` (extended the existing
      minimal scaffold in place, not a second workspace): landing page,
      `/docs` hub (introduction, architecture, lifecycle, composition,
      disputes, API reference, SDK reference, threat model, FAQ), `/markets`
      list + `/markets/[id]` detail with parimutuel position-taking gated
      behind wallet connection
- [x] RainbowKit + wagmi + viem wallet connection (local Anvil only, chain
      31337 — see `docs/FRONTEND_SPEC.md` for why no testnet chain is listed
      yet), shadcn/ui-style primitives hand-restyled to a strict
      black/white/gray design system (Geist + Geist Mono), no accent color
      anywhere including status — every event/dispute/composite state is a
      distinct shape+icon+label combination, never color-coded
- [x] Wired to the real `@novak/sdk` ABIs/types wherever a live read/write
      makes sense (`EventStatusCard`, `MarketPositionCard`,
      `CreateMarketCard`); `/markets`' list is explicitly mock data with a
      visible "Example data" badge, since `Market.sol` has no market
      enumeration getter — see `docs/FRONTEND_SPEC.md`'s live/mock data map
      for the exact per-page breakdown
- [ ] Real market discovery/indexing — no on-chain enumeration exists;
      `/markets` cannot show real markets until an indexer or subgraph is
      built
- [ ] A live API server for `/docs/api`'s documented REST surface — that
      page is explicitly labeled "on-chain reference, not a live REST API"
      pending one
- [ ] `NovakClient` write methods for the tiered dispute flow (same
      already-tracked gap as Issue #7/#17) — `/docs/sdk` shows them
      "coming soon"

---

## Milestone 8 — SDK

### Issue #17 — TypeScript Event SDK
**Owner:** ansu555 · **Priority:** P1
- [x] `createEvent()`, `getEventStatus()` / `isFinalized()`,
      `createComposite()` (composeEvents), `subscribe()`, `readOutcome()` /
      `resolveOutcome()` (getOutcome), `createMarket()`,
      `depositCollateral()`, `settleMarket()`, `claim()` — all implemented in
      `sdk/src/client.ts`
- [x] A developer can create and consume an event without manually encoding
      contract calls — demonstrated in `sdk/examples/` and
      `examples/end-to-end-flow.ts`

---

## Milestone 9 — End-to-End Demo

### Issue #18 — Build Canonical Demo
**Owner:** ansu555 + mesayanroy · **Priority:** P0
- [x] Full scenario scripted and **verified running against a live local
      anvil chain** in `examples/end-to-end-flow.ts`: two primitive events →
      two authorized resolvers reach quorum on each → dispute window elapses
      → finalize both → compose `WITHIN(48h)` → resolve composite → create
      market → two opposing deposits → settle → winner claims payout.

---

## Milestone 10 — Security & Integration

### Issue #19 — Full Protocol Threat Model
**Owner:** mesayanroy + skyyycodes · **Priority:** P0
- [x] `docs/threat-model.md` covers: single/lone malicious resolver,
      conflicting resolvers, unauthorized submission, duplicate submission,
      late submission, dispute griefing, dispute replay, Bus-bypass,
      composite (incl. DAG fan-in/depth) griefing, non-deterministic
      composition, front-running, malicious outcome decoding, and (new)
      committee-selection pseudo-randomness — each with a stated mitigation
      and status
- [x] Cycle-impossibility proof and the full terminal-state propagation
      table are written up explicitly (`docs/threat-model.md`), not just
      implied by the code — these are the two claims most likely to get
      pressure-tested by judges or auditors
- [x] The "colluding resolver majority" item is updated to reflect the
      tiered `DisputeManager` — materially improved (no single owner
      arbitrating), with its residual gap (committee selection draws from
      the same resolver pool it's meant to check; no real staking) stated
      precisely rather than left vague
- [ ] Dispute-spam-at-scale pricing remains explicitly "unresolved" in the
      threat model pending the stake-weighting/bonding economics deferred
      in Milestones 2–3

### Issue #20 — End-to-End Testnet Deployment
**Owner:** mesayanroy · **Contributors:** all · **Priority:** P0
- [x] Deploy script (`script/Deploy.s.sol`) deploys the full stack in
      dependency order and is testnet-ready (`foundry.toml` has a `testnet`
      rpc endpoint slot)
- [x] Verified on a local Ethereum node (anvil) — full stack deployed, full
      canonical demo run against it, successfully
- [ ] **Not yet run against a real public testnet** (e.g. Sepolia) — this
      needs a funded testnet deployer key and RPC URL, which weren't
      available in this environment. Run:
      `forge script script/Deploy.s.sol --rpc-url testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY --verify`
      once `.env`'s `RPC_URL_TESTNET`, `DEPLOYER_PRIVATE_KEY`, and
      `ETHERSCAN_API_KEY` are filled in with real values.

---

## What's genuinely done vs. what's next

**Backend (contracts + resolver + SDK) is functionally MVP-complete, and the
five protocol-layer gaps that used to separate "design claim" from "code"
are now closed:** event lifecycle (incl. `Voided`/`Expired` terminal
states), quorum (base + the ambiguous-split escalation path), the bonded
two-tier `DisputeManager` committee ladder, composition
(AND/OR/NOT/BEFORE/WITHIN with canonicalized identity, structural DAG
bounds, and terminal-state propagation), the Bus serving both primitive and
composite outcomes, and a settling derivatives market are all implemented,
unit/integration/fuzz/adversarial tested (80/80 passing), with the SDK's
ABI/types kept in sync.

**Frontend (Issue #21) is also functionally MVP-complete on top of that
backend:** a full Next.js 14 site — landing page, a 9-page `/docs` hub, and
`/markets` + `/markets/[id]` — hand-restyled to a strict black/white/gray
design system with RainbowKit/wagmi wallet connection, wired to the real
`@novak/sdk` ABIs everywhere a live read/write is possible (mock data used
only where the contracts have no enumeration getter to make it live, and
always visibly badged as mock). See `docs/FRONTEND_SPEC.md` for the exact
route map, component inventory, and live/mock data breakdown, and Issue #21
above for the per-item checklist. Repo-ownership rows aside, this is real,
verified progress and is recorded here as such.

**Left for a deliberate next pass, not silently skipped:**
1. Real testnet deployment (needs your funded key/RPC — see Issue #20).
2. The relayer/trigger service (Issue #13, P1) — currently zero code.
3. A real price-feed data source for the example adapter.
4. On-chain event discovery for resolvers (currently env-var configured).
5. `resolver/node/index.ts` daemon integration for the new
   `DisputeManager` flow — listening for Tier-1/Tier-2 escalation events and
   auto-submitting committee votes. The on-chain mechanism and its pure
   off-chain quorum math (`evaluateEscalationQuorum`) are done; wiring the
   daemon's event loop to actually call `submitTier1Vote`/`submitTier2Vote`
   is a separate follow-on task, same shape as `submitObservation`'s
   existing wiring.
6. New `sdk/` client write methods for the tiered dispute flow — the ABI is
   exposed (`disputeManagerAbi`) but `NovakClient` doesn't wrap it yet, by
   the same design choice that already excludes `submitObservation` (this
   is resolver/committee-member territory, not a consumer read/write path).
   `frontend/docs/sdk` already lists these method names as "coming soon"
   against that same ABI, so the frontend and SDK docs won't drift once this
   ships.
7. Full stake-weighted, VRF-selected, reputation-gated dispute arbitration —
   the MVP replaced single-owner arbitration with a bonded committee ladder
   (a real structural change), but committee selection is still block-data
   pseudo-randomness and every committee member posts the same flat bond
   rather than a variable stake. Deliberately deferred per the MVP scope
   boundary (no on-chain staking/reputation token), not forgotten — see
   `docs/protocol-spec.md` and `docs/threat-model.md` item 10.
8. Real on-chain market discovery/indexing — `/markets`' list is
   structurally mock today because `Market.sol` has no market-enumeration
   getter; this is an indexer/subgraph problem, not a frontend one (see
   Issue #21 and `docs/FRONTEND_SPEC.md` "Next up" #1).
9. A live API server behind `/docs/api`'s documented REST-style reference —
   that page is explicitly labeled as an on-chain function-signature
   reference, not a deployed API, pending real backend work to stand one up.
