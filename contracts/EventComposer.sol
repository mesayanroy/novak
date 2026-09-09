// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEventComposer} from "./interfaces/IEventComposer.sol";
import {IEventRegistry} from "./interfaces/IEventRegistry.sol";

/// @title EventComposer
/// @notice Builds composite events (AND/OR/NOT, BEFORE/WITHIN) from primitive or
///         other composite event IDs. Stores only the composite's definition
///         (op + canonicalized operands + window) and, once resolved, its
///         status — it never copies or duplicates primitive event state.
/// @dev See IEventComposer for the finalized MVP protocol decisions this
///      implementation encodes (compositeId derivation/canonicalization,
///      outcome payload schema, temporal timestamp source, DAG bounds,
///      terminal-state propagation).
///
///      CYCLE-IMPOSSIBILITY PROOF (see docs/threat-model.md for the written-up
///      version): `compositeId` is `keccak256` of its own `(op, operands,
///      window)`. For a composite to reference itself as an operand, its
///      `operands` array would need to already contain its own `compositeId`
///      — but that ID is only known *after* hashing those same operands, so
///      constructing a self-reference requires inverting keccak256, which is
///      computationally infeasible. Combined with `_operandExists` requiring
///      every operand to already be registered at `createComposite` time,
///      every edge in the composition DAG points to a node created in a
///      strictly earlier transaction, so no cycle — of any length — can ever
///      be constructed.
contract EventComposer is IEventComposer {
    uint32 public constant MAX_DAG_DEPTH = 8;
    uint256 public constant MAX_CHILDREN_PER_NODE = 10;

    IEventRegistry public immutable registry;

    mapping(bytes32 => CompositeSpec) private _specs;
    mapping(bytes32 => Status) private _resolvedStatus;
    mapping(bytes32 => uint64) private _resolvedAt;
    mapping(bytes32 => uint32) private _depth;

    constructor(address registry_) {
        registry = IEventRegistry(registry_);
    }

    function createComposite(CompositeSpec calldata compositeSpec)
        external
        returns (bytes32 compositeId)
    {
        _validateOperandCount(compositeSpec.op, compositeSpec.operands.length);
        require(
            compositeSpec.operands.length <= MAX_CHILDREN_PER_NODE,
            "EventComposer: too many operands"
        );

        // Canonicalize operand order for every order-independent operator so
        // e.g. AND(a,b) and AND(b,a) dedupe to the same composite. `Before`
        // is excluded deliberately — its operand order IS the claim.
        bytes32[] memory operands = compositeSpec.operands;
        if (compositeSpec.op != Op.Before) {
            operands = _sortOperands(operands);
        }

        uint32 maxChildDepth = 0;
        for (uint256 i = 0; i < operands.length; i++) {
            require(_operandExists(operands[i]), "EventComposer: unknown operand");
            uint32 childDepth = _depth[operands[i]];
            if (childDepth > maxChildDepth) {
                maxChildDepth = childDepth;
            }
        }
        uint32 thisDepth = maxChildDepth + 1;
        require(thisDepth <= MAX_DAG_DEPTH, "EventComposer: composition too deep");

        compositeId = keccak256(abi.encode(compositeSpec.op, operands, compositeSpec.window));
        require(_specs[compositeId].operands.length == 0, "EventComposer: composite exists");

        _specs[compositeId] =
            CompositeSpec({op: compositeSpec.op, operands: operands, window: compositeSpec.window});
        _depth[compositeId] = thisDepth;

        emit CompositeEventCreated(compositeId, compositeSpec.op, operands);
    }

    function getCompositeSpec(bytes32 compositeId) external view returns (CompositeSpec memory) {
        return _specs[compositeId];
    }

    function tryResolve(bytes32 compositeId) external returns (bool resolved, bool outcome) {
        Status cached = _resolvedStatus[compositeId];
        if (cached == Status.True) return (true, true);
        if (cached == Status.False) return (true, false);
        if (cached == Status.Voided) return (false, false);

        CompositeSpec memory spec = _specs[compositeId];
        require(spec.operands.length != 0, "EventComposer: unknown composite");

        Status result = _evaluate(spec);
        if (result == Status.Unresolved) {
            return (false, false);
        }

        _cacheResolution(compositeId, result);
        if (result == Status.Voided) {
            return (false, false);
        }
        return (true, result == Status.True);
    }

    function isResolved(bytes32 compositeId) external view returns (bool) {
        Status s = _resolvedStatus[compositeId];
        return s == Status.True || s == Status.False;
    }

    function getResolvedOutcome(bytes32 compositeId)
        external
        view
        returns (bool resolved, bool outcome)
    {
        Status s = _resolvedStatus[compositeId];
        if (s == Status.True) return (true, true);
        if (s == Status.False) return (true, false);
        return (false, false);
    }

    function getStatus(bytes32 compositeId) external view returns (Status) {
        return _resolvedStatus[compositeId];
    }

    function getResolvedAt(bytes32 compositeId) external view returns (uint64) {
        return _resolvedAt[compositeId];
    }

    function getDepth(bytes32 compositeId) external view returns (uint32) {
        return _depth[compositeId];
    }

    // --- Internal: resolution truth table ---

    /// @dev Precedence applied uniformly across every operator (see
    ///      docs/threat-model.md for the full written-out table and the
    ///      rationale for this exact ordering):
    ///        1. A decisive short-circuit wins regardless of any sibling's
    ///           state (And/Before/Within on any False; Or on any True).
    ///        2. Otherwise, any genuinely-pending (`Unresolved`) sibling
    ///           keeps the whole composite `Unresolved` — this is normal
    ///           openness, not a stall, since that sibling might still
    ///           produce the decisive short-circuit above.
    ///        3. Otherwise, any `Voided` sibling makes the composite
    ///           `Voided` — this is the actual fix for the "a dead child
    ///           stalls every composite above it forever" gap.
    ///        4. Otherwise every sibling is decided and the normal
    ///           logical/temporal comparison applies.
    function _evaluate(CompositeSpec memory spec) private view returns (Status) {
        if (spec.op == Op.And || spec.op == Op.Or) {
            bool sawUnresolved = false;
            bool sawVoided = false;
            for (uint256 i = 0; i < spec.operands.length; i++) {
                (Status s,) = _childStatus(spec.operands[i]);
                if (spec.op == Op.And && s == Status.False) return Status.False;
                if (spec.op == Op.Or && s == Status.True) return Status.True;
                if (s == Status.Unresolved) sawUnresolved = true;
                if (s == Status.Voided) sawVoided = true;
            }
            if (sawUnresolved) return Status.Unresolved;
            if (sawVoided) return Status.Voided;
            return spec.op == Op.And ? Status.True : Status.False;
        }

        if (spec.op == Op.Not) {
            (Status s,) = _childStatus(spec.operands[0]);
            if (s == Status.Unresolved) return Status.Unresolved;
            if (s == Status.Voided) return Status.Voided;
            return s == Status.True ? Status.False : Status.True;
        }

        // Before / Within
        (Status s0, uint64 t0) = _childStatus(spec.operands[0]);
        (Status s1, uint64 t1) = _childStatus(spec.operands[1]);

        if (s0 == Status.False || s1 == Status.False) return Status.False;
        if (s0 == Status.Unresolved || s1 == Status.Unresolved) return Status.Unresolved;
        if (s0 == Status.Voided || s1 == Status.Voided) return Status.Voided;

        if (spec.op == Op.Before) {
            return t0 < t1 ? Status.True : Status.False;
        }
        uint64 diff = t0 > t1 ? t0 - t1 : t1 - t0;
        return diff <= spec.window ? Status.True : Status.False;
    }

    function _cacheResolution(bytes32 compositeId, Status result) private {
        _resolvedStatus[compositeId] = result;
        _resolvedAt[compositeId] = uint64(block.timestamp);
        if (result == Status.Voided) {
            emit CompositeEventVoided(compositeId);
        } else {
            emit CompositeEventResolved(compositeId, result == Status.True);
        }
    }

    /// @dev Resolves an operand's status whether it's a primitive Registry
    ///      event or a nested composite. An `Expired` primitive reads
    ///      identically to `Voided` from a composite's perspective — both
    ///      mean "will never produce a real outcome". The returned timestamp
    ///      is meaningless (and never consumed by any caller) when status is
    ///      `Unresolved` or `Voided`.
    function _childStatus(bytes32 id) private view returns (Status status, uint64 timestamp) {
        IEventRegistry.EventStatus regStatus = registry.getEvent(id);

        if (regStatus == IEventRegistry.EventStatus.Finalized) {
            IEventRegistry.Outcome memory o = registry.getOutcome(id);
            bool b = abi.decode(o.outcomeData, (bool));
            return (b ? Status.True : Status.False, o.finalizedAt);
        }
        if (regStatus == IEventRegistry.EventStatus.Voided || regStatus == IEventRegistry.EventStatus.Expired) {
            return (Status.Voided, 0);
        }
        if (regStatus != IEventRegistry.EventStatus.None) {
            // Open / ObservationsSubmitted / ProposedOutcome / Disputed:
            // still genuinely pending, not a dead end.
            return (Status.Unresolved, 0);
        }

        // Not a primitive event at all — must be a nested composite
        // (existence was already validated at createComposite time).
        return (_resolvedStatus[id], _resolvedAt[id]);
    }

    function _operandExists(bytes32 id) private view returns (bool) {
        return registry.getEvent(id) != IEventRegistry.EventStatus.None || _specs[id].operands.length != 0;
    }

    function _validateOperandCount(Op op, uint256 count) private pure {
        if (op == Op.Not) {
            require(count == 1, "EventComposer: NOT takes 1 operand");
        } else if (op == Op.Before || op == Op.Within) {
            require(count == 2, "EventComposer: temporal op takes 2 operands");
        } else {
            require(count >= 2, "EventComposer: AND/OR take >= 2 operands");
        }
    }

    /// @dev Insertion sort — operand arrays are capped at
    ///      `MAX_CHILDREN_PER_NODE` (10), so O(n^2) is cheap and avoids
    ///      pulling in an external sorting library for the MVP.
    function _sortOperands(bytes32[] memory operands) private pure returns (bytes32[] memory) {
        for (uint256 i = 1; i < operands.length; i++) {
            bytes32 key = operands[i];
            uint256 j = i;
            while (j > 0 && operands[j - 1] > key) {
                operands[j] = operands[j - 1];
                j--;
            }
            operands[j] = key;
        }
        return operands;
    }
}
