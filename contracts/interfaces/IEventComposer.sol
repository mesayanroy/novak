// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEventComposer
/// @notice Builds composite events out of primitive (or other composite) event IDs
///         using logical (AND/OR/NOT) and temporal (BEFORE/WITHIN) operators.
/// @dev Composition is deterministic: the same operator + operand event IDs always
///      resolve to the same composite event identity, and once resolved, a
///      composite's outcome never changes. The Composer does not duplicate
///      Registry state — it only references primitive event IDs and derives an
///      outcome from them once all operands are finalized (or reach a terminal
///      non-outcome — see the `Voided` propagation rules below).
///
///      FINALIZED MVP PROTOCOL DECISIONS (see docs/protocol-spec.md):
///      - `compositeId = keccak256(op, canonicalOperands, window)`.
///        **Operand order is canonicalized (sorted ascending) for every
///        order-independent operator** (`And`, `Or`, `Not`, `Within` — all
///        symmetric in their operands) so `AND(a,b)` and `AND(b,a)` dedupe to
///        the same on-chain object. **`Before` is the deliberate exception**:
///        "A before B" is not the same claim as "B before A", so
///        canonicalizing it would silently corrupt semantics — its operand
///        order is preserved exactly as given.
///      - Outcome payload is a single bool per operand (see
///        IEventRegistry.Outcome — specVersion 1 = abi.encode(bool)).
///      - BEFORE/WITHIN use each operand's finalization timestamp: for a
///        primitive event, `IEventRegistry.Outcome.finalizedAt`; for a nested
///        composite operand, the timestamp at which ITS `tryResolve` call
///        first cached a result. Known MVP simplification: a composite's
///        effective "occurred at" time is resolution time, not real-world
///        occurrence time (see docs/protocol-spec.md).
///      - **Structural DAG bounds**: `MAX_DAG_DEPTH` and
///        `MAX_CHILDREN_PER_NODE` cap composition depth and fan-in at
///        creation time — see docs/threat-model.md for the cycle-
///        impossibility proof and the griefing scenario these bounds close.
///      - **Terminal-state propagation**: a `Voided` or `Expired` primitive
///        (or a `Voided` nested composite) no longer stalls a composite that
///        depends on it forever. See `Status` and docs/threat-model.md for
///        the exact precedence table.
interface IEventComposer {
    enum Op {
        And,
        Or,
        Not,
        Before, // operand[0] resolved-true strictly before operand[1]
        Within // operand[0] and operand[1] both resolved-true within `window` of each other
    }

    /// @notice The full 4-state resolution status of a composite event.
    ///         `isResolved`/`getResolvedOutcome` (kept for `EventBus`
    ///         backward compatibility) only ever report the `True`/`False`
    ///         cases — a `Voided` composite reports `isResolved == false`
    ///         through that older boolean-only API, same as a composite that
    ///         simply hasn't resolved yet. Use `getStatus` to tell the two
    ///         apart.
    enum Status {
        Unresolved,
        True,
        False,
        Voided
    }

    struct CompositeSpec {
        Op op;
        bytes32[] operands; // event IDs (primitive or composite); Not/temporal ops constrain length
        uint64 window; // seconds; only meaningful for temporal ops, ignored otherwise
    }

    event CompositeEventCreated(bytes32 indexed compositeId, Op op, bytes32[] operands);
    event CompositeEventResolved(bytes32 indexed compositeId, bool outcome);
    event CompositeEventVoided(bytes32 indexed compositeId);

    /// @notice Registers a composite event definition and returns its deterministic ID.
    ///         Every operand must already exist (a registered primitive event or a
    ///         previously created composite) — composing over an unknown ID reverts.
    ///         Reverts if `operands.length > MAX_CHILDREN_PER_NODE` or if the
    ///         resulting composition depth would exceed `MAX_DAG_DEPTH`.
    function createComposite(CompositeSpec calldata compositeSpec)
        external
        returns (bytes32 compositeId);

    function getCompositeSpec(bytes32 compositeId) external view returns (CompositeSpec memory);

    /// @notice Attempts to resolve a composite event from its operands'
    ///         status. Returns `(false, false)` if any required operand is
    ///         still `Unresolved`, or if the composite itself resolves to
    ///         `Voided` (see `Status`) — callers that need to distinguish
    ///         "not yet resolved" from "permanently voided" must use
    ///         `getStatus`. Once resolved to `True`/`False`/`Voided`, the
    ///         result is cached forever and subsequent calls return the
    ///         cached value.
    function tryResolve(bytes32 compositeId) external returns (bool resolved, bool outcome);

    /// @notice View-only check of cached resolution state, without attempting
    ///         to resolve. Used by EventBus to expose composite outcomes
    ///         through a pull-based `view` read. `True`/`False` only — see
    ///         `getStatus` for the full 4-state read.
    function isResolved(bytes32 compositeId) external view returns (bool);

    function getResolvedOutcome(bytes32 compositeId)
        external
        view
        returns (bool resolved, bool outcome);

    /// @notice The full 4-state resolution status, including `Voided`.
    function getStatus(bytes32 compositeId) external view returns (Status);

    function getResolvedAt(bytes32 compositeId) external view returns (uint64);

    /// @notice Composition depth: 0 for any primitive Registry event
    ///         (implicit), `max(operand depths) + 1` for a composite.
    function getDepth(bytes32 compositeId) external view returns (uint32);
}
