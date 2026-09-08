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
directly on a resolver.** `derivatives/Market.sol` and `derivatives/Settlement.sol`
hold an `IEventBus` reference only — see the regression test
`test/unit/Market.t.sol::test_market_onlyHoldsEventBusReference`.

- **Event Registry** — canonical event definitions and lifecycle state. Owns the
  state machine above.
- **Resolver Network** — independent off-chain processes that submit
  observations + evidence and participate in quorum. Never called by consumer
  contracts.
- **Dispute Mechanism** — the challenge window between a proposed outcome and
  finalization. Lives in the Registry's state machine (unimplemented in this
  scaffold — see TODOs in `contracts/EventRegistry.sol`).
- **On-chain Event Bus** — pull-based read access to finalized events. The only
  contract applications should import.
- **Event Composer** — builds composite events (logical + temporal operators)
  from primitive event IDs, deterministically, without duplicating Registry
  state.
- **Subscription Layer** — pull model for the MVP (`SubscriptionManager` is a
  stub); push delivery is explicitly deferred.
- **Derivatives Market** — first consumer application; settles positions
  against composite (or primitive) event outcomes read through the Bus.

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

See `docs/protocol-spec.md` for the full in-scope / deferred list.
