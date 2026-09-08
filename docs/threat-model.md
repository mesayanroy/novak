# Novak Threat Model (living document)

Scope: MVP as defined in `docs/protocol-spec.md`. This is a starting list to
grow as resolver/quorum/dispute logic is implemented — see
`test/adversarial/` for the corresponding (currently placeholder) test suite.

## Adversaries

1. **Malicious or faulty single resolver.** Submits a false or malformed
   observation for an event it monitors.
   - *Mitigation (planned):* quorum requires agreement across multiple
     independent resolvers before an outcome is proposed; a single bad
     observation cannot finalize an event alone.
   - *Status:* quorum logic is a placeholder (`resolver/consensus/quorum.ts`)
     — not yet enforced on-chain.

2. **Colluding resolver majority.** A majority of resolvers watching a given
   event agree on a false outcome.
   - *Mitigation (planned):* the dispute window lets any party challenge a
     proposed outcome before finalization; economic bonding/slashing for
     disputes is intentionally undesigned in the MVP (see protocol-spec.md).
   - *Status:* unresolved — this is the main reason the dispute mechanism
     cannot be treated as fully "in scope" until its economics are decided.

3. **Late or stale observation.** A resolver submits after
   `EventSpec.observationDeadline`.
   - *Mitigation (planned):* Registry should reject submissions once the
     deadline has passed. Not yet implemented (see
     `contracts/EventRegistry.sol` TODOs).

4. **Dispute spam / griefing.** Repeated frivolous disputes stall
   finalization of a correct outcome.
   - *Mitigation (planned):* dispute bonding (slashed on a losing dispute)
     should price this out. Undesigned — flagged in protocol-spec.md as a
     decision to make before implementing dispute logic.

5. **Event Bus bypass.** A consumer contract attempts to read event state
   directly from the Registry or Composer, or (worse) calls a resolver
   directly, breaking the "applications depend on the Bus only" invariant.
   - *Mitigation:* structural — `derivatives/Market.sol` and
     `derivatives/Settlement.sol` hold only an `IEventBus` reference. Guarded
     by `test/unit/Market.t.sol::test_market_onlyHoldsEventBusReference`.
     Any new consumer contract should carry an equivalent test.

6. **Composite event griefing.** An attacker creates a composite event whose
   operands can never all finalize (e.g. referencing a primitive event ID
   that doesn't exist, or a temporal window that can structurally never be
   satisfied), to waste gas or mislead a market creator.
   - *Mitigation:* undesigned. `EventComposer.createComposite` should
     probably validate operand existence at creation time — not yet
     implemented.

7. **Non-deterministic composition.** A bug in `EventComposer.tryResolve`
   (once implemented) causes the same inputs to resolve differently across
   calls (e.g. due to reliance on `block.timestamp` at resolution time rather
   than committed finalization timestamps).
   - *Mitigation:* determinism is a hard requirement — see the fuzz test
     `test/fuzz/EventComposer.fuzz.t.sol` and the TODO there for
     boundary-timestamp fuzzing once `tryResolve` exists.

8. **Front-running market creation / settlement.** MEV-style manipulation of
   `Market.createMarket` / `Market.settle` ordering.
   - *Status:* explicitly deferred — MEV mechanisms are out of MVP scope per
     `docs/protocol-spec.md`. Noted here so it isn't forgotten post-MVP.

## Out of scope for MVP threat modeling

Per the deferred-scope list in `docs/protocol-spec.md`: cross-chain event
threats, ZK proof soundness, permissionless resolver marketplace attacks,
high-frequency event stream DoS, perpetual derivatives liquidation attacks.
