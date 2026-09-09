# Novak Threat Model (living document)

Scope: MVP as defined in `docs/protocol-spec.md`. Every item below has a
corresponding regression test in `test/adversarial/` (or `test/fuzz/` for
determinism) unless marked unresolved.

## Adversaries

1. **Malicious or faulty single resolver.** Submits a false or malformed
   observation for an event it monitors.
   - *Mitigation:* quorum requires `EventSpec.quorumThreshold` independent
     authorized resolvers to agree on the byte-identical outcome before it's
     even proposed — a single resolver cannot move an event past
     `ObservationsSubmitted` alone.
   - *Status:* **implemented and tested** —
     `test_singleMaliciousResolver_cannotReachQuorumAlone`.

2. **Colluding resolver majority.** A majority of resolvers watching a given
   event agree on a false outcome.
   - *Mitigation:* the dispute window lets any account challenge a proposed
     outcome before finalization by posting `DISPUTE_BOND`.
   - *Status:* **partially resolved.** The dispute mechanism itself is
     implemented and tested, but arbitration is owner-controlled for the MVP
     (`EventRegistry.resolveDispute`), not a decentralized jury/stake-slash
     vote. A colluding majority that also controls (or pressures) the
     Registry owner is not defended against — this requires the
     stake-weighted, decentralized-arbitration design explicitly deferred in
     `docs/protocol-spec.md`. Treat the current owner-arbitration as a
     trusted-operator MVP simplification, not a production security model.

3. **Late or stale observation.** A resolver submits after
   `EventSpec.observationDeadline`.
   - *Mitigation:* **implemented and tested** —
     `test_lateSubmission_afterDeadline_rejected`.

4. **Dispute spam / griefing.** Repeated frivolous disputes stall
   finalization of a correct outcome.
   - *Mitigation:* a flat `DISPUTE_BOND` (0.01 ETH) is forfeited to the
     Registry owner if the arbitrator upholds the original proposal, so each
     frivolous dispute costs the griefer real ETH.
   - *Status:* **implemented and tested** —
     `test_disputeGriefing_frivolousDisputeCostsBond`. Note the bond is a
     flat MVP constant, not scaled to the event's economic stakes — a
     well-funded griefer can still afford to dispute high-value events
     repeatedly (each dispute is independent; there's no per-event
     rate-limiting). Scaling the bond or rate-limiting disputes per address
     is a reasonable post-MVP hardening step.

5. **Event Bus bypass.** A consumer contract attempts to read event state
   directly from the Registry or Composer, or (worse) calls a resolver
   directly, breaking the "applications depend on the Bus only" invariant.
   - *Mitigation:* structural — `derivatives/Market.sol` holds only a
     `Settlement` reference, and `Settlement.sol` holds only an `IEventBus`
     reference. Guarded by
     `test/unit/Market.t.sol::test_market_onlyHoldsSettlementReference`. Any
     new consumer contract should carry an equivalent test.

6. **Composite event griefing.** An attacker creates a composite event whose
   operands can never all finalize (e.g. referencing a primitive event ID
   that doesn't exist), to waste gas or mislead a market creator.
   - *Mitigation:* **implemented and tested** —
     `EventComposer.createComposite` validates every operand exists (a
     registered primitive event or a previously created composite) at
     creation time and reverts otherwise
     (`test_createComposite_revertsOnUnknownOperand`). Note this only proves
     the operand *exists*; it does not prove it will ever actually finalize
     (e.g. no resolver ever bothers submitting) — a market can still be
     created against a composite that never resolves, and simply never
     becomes settleable. There's no explicit "abandoned market" recovery
     path (see `docs/SPEC_AND_TASKS.md` Issue #15).

7. **Non-deterministic composition.** A bug causes the same inputs to
   resolve differently across calls (e.g. due to reliance on
   `block.timestamp` at resolution time rather than committed finalization
   timestamps).
   - *Mitigation:* `EventComposer.tryResolve` uses each primitive operand's
     committed `Outcome.finalizedAt` (set once, at finalization) — never the
     current block time — and caches its own result forever on first
     success. **Implemented and fuzz-tested**, including the WITHIN boundary
     exactly at the window edge —
     `test/fuzz/EventComposer.fuzz.t.sol::testFuzz_within_boundaryIsInclusiveAndStable`.
   - *Residual caveat:* for a **nested** composite operand (a composite
     composed of another composite), the timestamp used is that inner
     composite's own resolution time, not a real-world "occurred at" time —
     see `docs/protocol-spec.md` for why this is a known, accepted MVP
     simplification rather than a bug.

8. **Front-running market creation / settlement.** MEV-style manipulation of
   `Market.createMarket` / `Market.settle` ordering.
   - *Status:* explicitly deferred — MEV mechanisms are out of MVP scope per
     `docs/protocol-spec.md`. Noted here so it isn't forgotten post-MVP.

9. **Malicious/careless outcome decoding.** `Settlement.resolveOutcome` and
   `EventComposer`'s operand-status check both call
   `abi.decode(outcomeData, (bool))` unconditionally.
   - *Status:* **unresolved edge case.** Because every event's `outcomeData`
     is written by `EventRegistry` itself (via `abi.encode(bool)` in
     `submitObservation`), a malformed payload can't reach this decode path
     through the normal flow — but if `specVersion` ever changes to a
     non-bool schema without also updating these decode sites, they'd revert
     or silently misdecode. Treat any `specVersion` bump as requiring a
     matching audit of every `abi.decode(..., (bool))` call site
     (`derivatives/Settlement.sol`, `contracts/EventComposer.sol`).

## Out of scope for MVP threat modeling

Per the deferred-scope list in `docs/protocol-spec.md`: cross-chain event
threats, ZK proof soundness, permissionless resolver marketplace attacks
(no staking/reputation token exists to attack), high-frequency event stream
DoS, perpetual derivatives liquidation attacks. Also out of scope because no
code exists yet: any attack on the relayer/trigger layer (Issue #13) — there
is nothing to attack until it's built.
