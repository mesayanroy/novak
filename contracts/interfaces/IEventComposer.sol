// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEventComposer
/// @notice Builds composite events out of primitive (or other composite) event IDs
///         using logical (AND/OR/NOT) and temporal (BEFORE/WITHIN) operators.
/// @dev Composition is deterministic: the same operator + operand event IDs always
///      resolve to the same composite event identity, and once resolved, a
///      composite's outcome never changes. The Composer does not duplicate
///      Registry state — it only references primitive event IDs and derives an
///      outcome from them once all operands are finalized.
///
///      FINALIZED MVP PROTOCOL DECISIONS (see docs/protocol-spec.md):
///      - compositeId = keccak256(op, operands, window). Operand order is
///        significant even for commutative ops (AND(a,b) != AND(b,a) as IDs) —
///        callers that want deduping for commutative ops must canonicalize
///        operand order themselves before calling createComposite.
///      - Outcome payload is a single bool per operand (see
///        IEventRegistry.Outcome — specVersion 1 = abi.encode(bool)).
///      - BEFORE/WITHIN use each operand's finalization timestamp: for a
///        primitive event, `IEventRegistry.Outcome.finalizedAt`; for a nested
///        composite operand, the timestamp at which ITS `tryResolve` call
///        first cached a result. This means a composite's effective
///        "occurred at" time is resolution time, not real-world occurrence
///        time — a known MVP simplification (see docs/protocol-spec.md).
interface IEventComposer {
    enum Op {
        And,
        Or,
        Not,
        Before, // operand[0] resolved-true strictly before operand[1]
        Within // operand[0] and operand[1] both resolved-true within `window` of each other
    }

    struct CompositeSpec {
        Op op;
        bytes32[] operands; // event IDs (primitive or composite); Not/temporal ops constrain length
        uint64 window; // seconds; only meaningful for temporal ops, ignored otherwise
    }

    event CompositeEventCreated(bytes32 indexed compositeId, Op op, bytes32[] operands);
    event CompositeEventResolved(bytes32 indexed compositeId, bool outcome);

    /// @notice Registers a composite event definition and returns its deterministic ID.
    ///         Every operand must already exist (a registered primitive event or a
    ///         previously created composite) — composing over an unknown ID reverts.
    function createComposite(CompositeSpec calldata compositeSpec)
        external
        returns (bytes32 compositeId);

    function getCompositeSpec(bytes32 compositeId) external view returns (CompositeSpec memory);

    /// @notice Attempts to resolve a composite event from its operands' finalized
    ///         outcomes. Returns `(false, false)` if any required operand is not
    ///         yet finalized. Once resolved, the result is cached forever and
    ///         subsequent calls return the cached value.
    function tryResolve(bytes32 compositeId) external returns (bool resolved, bool outcome);

    /// @notice View-only check of cached resolution state, without attempting
    ///         to resolve. Used by EventBus to expose composite outcomes
    ///         through a pull-based `view` read.
    function isResolved(bytes32 compositeId) external view returns (bool);

    function getResolvedOutcome(bytes32 compositeId)
        external
        view
        returns (bool resolved, bool outcome);

    function getResolvedAt(bytes32 compositeId) external view returns (uint64);
}
