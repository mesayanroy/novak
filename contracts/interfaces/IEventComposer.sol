// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEventComposer
/// @notice Builds composite events out of primitive (or other composite) event IDs
///         using logical (AND/OR/NOT) and temporal (BEFORE/WITHIN) operators.
/// @dev Composition must be deterministic: the same set of operator + operand event
///      IDs must always resolve to the same composite event identity and the same
///      outcome given the same underlying primitive outcomes. The Composer must not
///      duplicate Registry state — it only references primitive event IDs and derives
///      an outcome from them once all operands are finalized.
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
    /// @dev TODO(protocol semantics — confirm before implementing): exact compositeId
    ///      derivation. Candidate: keccak256(op, operands, window) so identical
    ///      composite definitions always collapse to the same ID (dedupe + determinism).
    ///      Needs a decision on operand ordering sensitivity (e.g. is AND(a,b) == AND(b,a)?)
    ///      before this is load-bearing.
    function createComposite(CompositeSpec calldata compositeSpec)
        external
        returns (bytes32 compositeId);

    function getCompositeSpec(bytes32 compositeId) external view returns (CompositeSpec memory);

    /// @notice Attempts to resolve a composite event from its operands' finalized
    ///         outcomes. Reverts (or no-ops) if any required operand is not yet
    ///         finalized. Resolution logic itself is deterministic given finalized
    ///         operand outcomes — see contracts/EventComposer.sol for the TODO on
    ///         exact temporal-window semantics.
    function tryResolve(bytes32 compositeId) external returns (bool resolved, bool outcome);
}
