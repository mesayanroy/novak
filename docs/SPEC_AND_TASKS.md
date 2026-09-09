# Neural Event Network — Specification & Task Allocation

Living deliverables tracker. Check an item only once its **Acceptance
Criteria** are actually met and verified (tests passing, not just code
written). This mirrors the original milestone breakdown; see
`docs/architecture.md`, `docs/protocol-spec.md`, and `docs/threat-model.md`
for the narrative versions of the same decisions.

**Verification snapshot (last updated after the backend completion pass):**
`forge test` → 44/44 passing across unit/integration/fuzz/adversarial suites;
`examples/end-to-end-flow.ts` runs the full canonical flow (create → resolve
→ quorum → dispute-window → finalize → compose → settle → claim) against a
live local anvil chain, verified in this pass.

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
- [ ] Stake-weighted quorum — **deliberately out of MVP scope**. Resolvers
      are individually authorized by the Registry owner
      (`setResolverAuthorization`), not staked/slashed by a token; see
      "Explicitly deferred: production-scale token economics" in
      `docs/protocol-spec.md`.

---

## Milestone 3 — Dispute System

### Issue #7 — Event Dispute Mechanism
**Owner:** skyyycodes · **Priority:** P0
- [x] `dispute(eventId)` implemented with a fixed bond (`DISPUTE_BOND`,
      0.01 ETH) and dispute window
- [x] `resolveDispute(eventId, upholdProposal)` — bond forfeited to protocol
      owner if the proposal is upheld, refunded to the disputer if not
- [x] A proposed outcome can be challenged before finalization — verified in
      `test/unit/EventRegistry.t.sol` and `test/adversarial/MaliciousResolver.t.sol`
- [ ] Decentralized dispute arbitration — **MVP simplification**: the
      Registry owner arbitrates disputes directly rather than a
      decentralized voting/jury mechanism. See `docs/threat-model.md` item 2
      and `IEventRegistry` docs for why this is called out explicitly rather
      than silently assumed.

### Issue #8 — Adversarial Resolver Test Suite
**Owner:** skyyycodes · **Priority:** P0
- [x] Conflicting resolvers (`test_conflictingResolvers_...`)
- [x] Unauthorized/unavailable resolver (`test_unauthorizedResolver_...`)
- [x] Duplicate submission / replay (`test_duplicateSubmission_...`,
      `test_disputeReplay_...`)
- [x] Stale/late evidence (`test_lateSubmission_afterDeadline_...`)
- [x] Dispute griefing cost analysis (`test_disputeGriefing_...`)
- [x] Finalize-while-disputed guard (`test_finalize_blockedWhileDisputePending`)
- [x] Composer determinism fuzzing, including the WITHIN boundary
      (`test/fuzz/EventComposer.fuzz.t.sol`)
- [ ] Colluding resolver majority (economically) beating the dispute bond —
      requires stake-weighted quorum (deferred, see Issue #6)
- [ ] Dispute-spam-at-scale pricing — requires a real bonding/slashing
      economy beyond the flat MVP bond (deferred, see Issue #7)

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
      composite griefing, non-deterministic composition, front-running —
      each with a stated mitigation and status
- [ ] Colluding resolver majority and dispute-spam-at-scale remain
      explicitly "unresolved" in the threat model pending the
      stake-weighting/bonding economics deferred in Milestones 2–3

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

**Backend (contracts + resolver + SDK) is functionally MVP-complete:**
event lifecycle, quorum, disputes, composition (AND/OR/NOT/BEFORE/WITHIN),
the Bus serving both primitive and composite outcomes, and a settling
derivatives market are all implemented, unit/integration/fuzz/adversarial
tested (44/44 passing), and verified end-to-end against a running chain.

**Left for a deliberate next pass, not silently skipped:**
1. Real testnet deployment (needs your funded key/RPC — see Issue #20).
2. The relayer/trigger service (Issue #13, P1) — currently zero code.
3. A real price-feed data source for the example adapter.
4. On-chain event discovery for resolvers (currently env-var configured).
5. Anything requiring token economics or decentralized dispute arbitration
   — deliberately deferred per the MVP scope boundary, not forgotten.
