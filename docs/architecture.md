# Novak Architecture

Novak (Neural Event Network / NEN) is a decentralized, composable event bus for
Ethereum. Events are resolved, finalized, and stored once, then composed and
consumed by many independent smart contracts — instead of every application
building its own oracle integration.

## Event lifecycle

```
CREATE -> OPEN -> OBSERVATIONS SUBMITTED -> PROPOSED OUTCOME -> DISPUTE WINDOW
       -> QUORUM/RESOLUTION -> FINALIZED -> AVAILABLE TO CONSUMERS
```

- **CREATE / OPEN** — an `EventSpec` is registered in the `EventRegistry`
  (`contracts/EventRegistry.sol`). The event is now open for observation.
- **OBSERVATIONS SUBMITTED** — independent resolvers (`resolver/`) fetch source
  data via adapters and submit observations + evidence.
- **PROPOSED OUTCOME** — once resolver observations reach quorum
  (`resolver/consensus/`), an outcome is proposed on-chain.
- **DISPUTE WINDOW** — a fixed window (`EventSpec.disputeWindowSeconds`) during
  which the proposed outcome can be challenged before it is treated as final.
- **QUORUM/RESOLUTION -> FINALIZED** — if undisputed (or once a dispute
  resolves), the Registry marks the event finalized.
- **AVAILABLE TO CONSUMERS** — the `EventBus` (`contracts/EventBus.sol`) exposes
  the finalized outcome for pull-based reads by any application contract.

## Component separation

```
                     ┌───────────────────────┐
  resolver network → │     EventRegistry      │  (canonical state, lifecycle)
  (off-chain nodes)  └───────────┬────────────┘
                                 │
                      ┌──────────┴──────────┐
                      │     EventComposer     │  (AND/OR/NOT, BEFORE/WITHIN)
                      └──────────┬──────────┘
                                 │
                         ┌───────┴────────┐
                         │    EventBus     │  ← the ONLY thing consumers see
                         └───────┬────────┘
                                 │
                    ┌────────────┴─────────────┐
                    │   Derivatives Market       │  (first consumer app)
                    │  Market / PositionManager  │
                    │       / Settlement          │
                    └────────────────────────────┘
```

**Hard architectural invariant: applications depend on the Event Bus, never
directly on a resolver.** `derivatives/Market.sol` depends only on
`derivatives/Settlement.sol`, which itself holds only an `IEventBus`
reference — see the regression test
`test/unit/Market.t.sol::test_market_onlyHoldsSettlementReference`.

- **Event Registry** — canonical event definitions and lifecycle state
  (`contracts/EventRegistry.sol`). Owns the full state machine: quorum
  counting, proposal, dispute bonding/arbitration, and finalization.
- **Resolver Network** — independent off-chain processes
  (`resolver/node/index.ts`) that submit observations + evidence hashes
  directly to `EventRegistry.submitObservation`. Never called by consumer
  contracts.
- **Dispute Mechanism** — a bonded challenge window
  (`EventRegistry.dispute`/`resolveDispute`) between a proposed outcome and
  finalization. Implemented with MVP-simplified (owner-arbitrated, not
  decentralized) arbitration — see `docs/protocol-spec.md`.
- **On-chain Event Bus** (`contracts/EventBus.sol`) — pull-based read access
  to finalized events. Transparently serves **both** primitive events
  (finalized in the Registry) and composite events (resolved in the
  Composer) — the only contract applications should import.
- **Event Composer** (`contracts/EventComposer.sol`) — builds composite
  events (AND/OR/NOT/BEFORE/WITHIN) from primitive event IDs, deterministically,
  without duplicating Registry state. `tryResolve` caches its result forever
  once computed.
- **Subscription Layer** — pull model for the MVP (`SubscriptionManager`
  records subscription intent only); push delivery is explicitly deferred
  (see Issue #13 in `docs/SPEC_AND_TASKS.md` — zero code so far).
- **Derivatives Market** (`derivatives/Market.sol` + `Settlement.sol` +
  `PositionManager.sol`) — first consumer application; a parimutuel YES/NO
  pool that settles against composite (or primitive) event outcomes read
  through `Settlement` → `EventBus`.

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

## MVP scope

See `docs/protocol-spec.md` for the full in-scope / deferred list, and
`docs/SPEC_AND_TASKS.md` for the milestone-by-milestone deliverables tracker
with what's verified done vs. explicitly left for later.
