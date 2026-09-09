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
     outcome before finalization by posting `DISPUTE_BOND`, which opens
     `DisputeManager`'s Tier-1 committee — drawn from the *full* authorized
     resolver pool (or a pseudo-random sample of it once the pool exceeds 7),
     not from whichever resolvers happened to submit the disputed
     observation. Escalating through Tier-2 (15 members) before a hard
     `Voided` floor makes a false outcome progressively more expensive to
     sustain, and **never hands the decision to a token-governance vote** —
     see `docs/architecture.md`'s UMA comparison for why that specific
     design choice matters.
   - *Status:* **materially improved, still not fully decentralized.** This
     used to be *the* headline gap: a single owner arbitrated every dispute
     (`EventRegistry.resolveDispute`), so a colluding majority that also
     controlled or pressured that owner was undefended. That single point of
     control is now gone — arbitration is a bonded committee process with no
     privileged decider. Two real limitations remain, called out precisely
     rather than glossed over:
     - **If the colluding majority *is* (or dominates) the authorized
       resolver pool**, they are also disproportionately likely to be
       selected onto the Tier-1/Tier-2 committees that are supposed to
       check them, since committee selection draws from that same pool.
       Ultimate resolver authorization is still Registry-owner-gated
       (`setResolverAuthorization`), so this reduces to "don't let the
       owner authorize a captured resolver set" — a weaker but real trust
       assumption, not the single-arbitrator problem, but not eliminated
       either.
     - **No on-chain staking/reputation token** backs committee membership
       (see "Explicitly deferred" in `docs/protocol-spec.md`), so every
       committee member in a tier posts the *same* fixed bond rather than a
       stake proportional to their track record or economic skin in the
       game — see `docs/protocol-spec.md`'s "stated MVP simplifications" for
       the full reasoning.
     Full stake-weighted, VRF-selected, reputation-gated arbitration remains
     a real post-MVP project, not a solved problem — this is progress on the
     gap, not closure of it.

3. **Late or stale observation.** A resolver submits after
   `EventSpec.observationDeadline`.
   - *Mitigation:* **implemented and tested** —
     `test_lateSubmission_afterDeadline_rejected`.

4. **Dispute spam / griefing.** Repeated frivolous disputes stall
   finalization of a correct outcome.
   - *Mitigation:* a flat `DISPUTE_BOND` (0.01 ETH) is forfeited (burned +
     sent to treasury) if the committee upholds the original proposal, so
     each frivolous dispute costs the griefer real ETH — the same economic
     shape as before, just decided by a bonded committee instead of an
     owner. A griefer also cannot re-dispute the same event twice (one
     `DisputeCase` per event, enforced by `DisputeManager`), so spam has to
     spread across many distinct events, each paying its own bond.
   - *Status:* **implemented and tested** —
     `test_disputeGriefing_frivolousDisputeCostsBond`
     (`test/adversarial/MaliciousResolver.t.sol`),
     `test_disputeReplay_secondDisputeRejected`. Note every bond in this
     system (`DISPUTE_BOND`, `TIER1_BOND`, `TIER2_BOND`) is a flat MVP
     constant, not scaled to the event's economic stakes — a well-funded
     griefer can still afford to dispute high-value events repeatedly across
     many events (there's no per-address rate-limiting or bond scaling by
     stakes). Scaling bonds or rate-limiting disputes per address is a
     reasonable post-MVP hardening step.

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
   that doesn't exist), to waste gas or mislead a market creator — or, more
   ambitiously, tries to build an oversized or cyclic composition DAG,
   since composability is Novak's core differentiator and therefore an
   attacker's cheapest lever against it.
   - *Mitigation (unknown operands):* **implemented and tested** —
     `EventComposer.createComposite` validates every operand exists (a
     registered primitive event or a previously created composite) at
     creation time and reverts otherwise
     (`test_createComposite_revertsOnUnknownOperand`). Note this only proves
     the operand *exists*; it does not prove it will ever actually finalize
     (e.g. no resolver ever bothers submitting) — a market can still be
     created against a composite that never resolves, and simply never
     becomes settleable. There's no explicit "abandoned market" recovery
     path (see `docs/SPEC_AND_TASKS.md` Issue #15).
   - *Mitigation (oversized/cyclic DAGs):* **implemented and tested** —
     `MAX_CHILDREN_PER_NODE` (10) and `MAX_DAG_DEPTH` (8) bound fan-in and
     composition depth at creation time
     (`test_createComposite_revertsWhenExceedingMaxChildrenPerNode`,
     `test_createComposite_revertsWhenExceedingMaxDagDepth`,
     `test/adversarial/CompositeGriefing.t.sol`). Cycles are not merely
     bounded, they are **cryptographically impossible** — see the proof
     below. Evaluation cost is also bounded regardless of graph size:
     `tryResolve` caches its result forever on first success, so the
     expensive walk happens exactly once, ever, and every later read is an
     O(1) storage lookup.
   - *Mitigation (a permanently-dead operand stalling every composite above
     it forever):* **implemented and tested** — see the terminal-state
     propagation table below. Before this, a `Voided` primitive left every
     dependent composite stuck reporting "not yet resolved" indefinitely,
     with zero signal that anything was wrong; it now propagates to
     `Voided` deterministically.

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

10. **Committee-selection manipulation.** A miner/validator (or, on a
    proposer-builder-separation chain, whoever controls block building)
    could choose whether to include a `dispute`/`escalateNonConvergence`/
    `escalateTier2` transaction in a block whose `blockhash`/`prevrandao`
    happens to seed a committee favorable to them, since
    `DisputeManager._selectCommittee` derives its seed from block data.
    - *Status:* **unresolved, stated plainly.** This is standard
      block-data-pseudo-randomness weakness, not specific to this protocol —
      but it's real, and the fix (a VRF or commit-reveal seed) is
      deliberately out of scope for the MVP alongside the rest of "no
      staking/reputation token" (`docs/protocol-spec.md`). The practical
      exposure is bounded by pool size: when the authorized resolver pool is
      at or below the tier size (as in every test in this repo, and likely
      true early in any real deployment), the committee **is** the whole
      pool — there's nothing to manipulate a selection *into*, since
      everyone is already on it. The risk only becomes live once the
      resolver pool meaningfully exceeds 7 (Tier-1) or 15 (Tier-2).

## Cycle-impossibility proof (Gap 3)

**Claim:** the composition DAG built by `EventComposer.createComposite` can
never contain a cycle, of any length — including the trivial 1-cycle of a
composite referencing itself.

**Proof:** `compositeId = keccak256(abi.encode(op, canonicalOperands,
window))` — a composite's identity is a hash of its own definition,
including its operand list. For a composite to reference itself as one of
its own operands, its `operands` array would need to already contain its
own `compositeId` *before* that ID has been computed — but the ID is only
knowable *after* hashing those exact operands. Constructing such a
self-reference therefore requires finding a preimage of `keccak256` for a
specific target output, which is computationally infeasible. This rules out
the 1-cycle case directly.

For any longer cycle (`A` references `B` references `C` references `A`),
`EventComposer.createComposite` requires every operand to already exist in
storage (`_operandExists`, reverting with `EventComposer: unknown operand`
otherwise) **at the moment of creation**. This means every edge in the DAG
points from a newly-created node to a node that was created in a strictly
earlier transaction. If a cycle existed, at least one edge in it would have
to point from an earlier-created node to a later-created one — contradicting
"every operand must already exist." So no cycle of any length can be
constructed, for the same reason a topologically-sorted-by-construction
graph can't contain one: creation order is a strict, unforgeable partial
order over the DAG, and every edge respects it.

This is stronger than the "prevent revisiting an already-visited node during
traversal" runtime checks a naive implementation might reach for — no
traversal is needed at all, because the cycle is structurally unconstructible
in the first place. See `test/adversarial/CompositeGriefing.t.sol::test_cycleGriefing_cannotReferenceAFutureOrSelfId`.

## Terminal-state propagation table (Gap 4)

Every operand `EventComposer` reads resolves to one of four states:
`Unresolved` (still pending — `Open`/`ObservationsSubmitted`/
`ProposedOutcome`/`Disputed` on the Registry, or a composite that hasn't
resolved yet), `True`, `False`, or `Voided` (a Registry `Voided` or
`Expired` primitive, or a nested composite that itself resolved `Voided` —
the two collapse to one state from a composite's perspective, since both
mean "will never produce a real outcome"). The precedence applied uniformly
across every operator:

| Operator | Rule |
|---|---|
| `And` | Any `False` operand → `False` (short-circuits, ignoring every other operand's state). Else any `Unresolved` operand → stays `Unresolved`. Else any `Voided` operand → `Voided`. Else (all `True`) → `True`. |
| `Or` | Any `True` operand → `True` (short-circuits). Else any `Unresolved` operand → stays `Unresolved`. Else any `Voided` operand → `Voided`. Else (all `False`) → `False`. |
| `Not` | Operand `Unresolved` → stays `Unresolved`. Operand `Voided` → `Voided`. Else negate `True`/`False` normally. |
| `Before` / `Within` | Either operand `False` → `False` (the temporal predicate is already unsatisfiable regardless of the other operand's fate). Else either operand `Unresolved` → stays `Unresolved`. Else either operand `Voided` → `Voided`. Else (both `True`) → the normal timestamp comparison. |

The ordering — decisive short-circuit, *then* check for a still-pending
sibling, *then* propagate `Voided`, *then* compute the normal result — is
the part worth being precise about. A naive reading of "AND propagates
Voided" could jump straight to `Voided` the moment *any* sibling is a dead
end, without checking whether another sibling is still genuinely pending. That
would be wrong, not just imprecise: a pending sibling might still resolve
`False`, which dominates a `Voided` sibling under the same rule (`AND` is
only ever knowably `Voided` once every *other* operand is already decided).
Only a permanently-dead (`Voided`/`Expired`) sibling justifies giving up
early — a merely-pending one does not, since "hasn't happened yet" and "will
never produce an outcome" are different claims that this table is precisely
the mechanism for keeping distinct.

This table is genuinely novel surface area relative to the closest
competitor: UMA's Optimistic Oracle has no composition layer, so it has
never had to define what "an assertion that never resolved" means to a
*downstream* assertion, because no such downstream relationship exists on
UMA — every assertion is a standalone, single-purpose request. See
`docs/architecture.md`'s UMA comparison for the fuller argument.

## Out of scope for MVP threat modeling

Per the deferred-scope list in `docs/protocol-spec.md`: cross-chain event
threats, ZK proof soundness, permissionless resolver marketplace attacks
(no staking/reputation token exists to attack), high-frequency event stream
DoS, perpetual derivatives liquidation attacks. Also out of scope because no
code exists yet: any attack on the relayer/trigger layer (Issue #13) — there
is nothing to attack until it's built.
