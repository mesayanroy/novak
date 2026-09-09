// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEventComposer} from "./interfaces/IEventComposer.sol";
import {IEventRegistry} from "./interfaces/IEventRegistry.sol";

/// @title EventComposer
/// @notice Builds composite events (AND/OR/NOT, BEFORE/WITHIN) from primitive or
///         other composite event IDs. Stores only the composite's definition
///         (op + operands + window) and, once resolved, its boolean outcome — it
///         never copies or duplicates primitive event state.
/// @dev See IEventComposer for the finalized MVP protocol decisions this
///      implementation encodes (compositeId derivation, outcome payload schema,
///      temporal timestamp source).
contract EventComposer is IEventComposer {
    IEventRegistry public immutable registry;

    mapping(bytes32 => CompositeSpec) private _specs;
    mapping(bytes32 => bool) private _resolved;
    mapping(bytes32 => bool) private _outcome;
    mapping(bytes32 => uint64) private _resolvedAt;

    constructor(address registry_) {
        registry = IEventRegistry(registry_);
    }

    function createComposite(CompositeSpec calldata compositeSpec)
        external
        returns (bytes32 compositeId)
    {
        _validateOperandCount(compositeSpec.op, compositeSpec.operands.length);
        for (uint256 i = 0; i < compositeSpec.operands.length; i++) {
            require(_operandExists(compositeSpec.operands[i]), "EventComposer: unknown operand");
        }

        compositeId = keccak256(
            abi.encode(compositeSpec.op, compositeSpec.operands, compositeSpec.window)
        );
        require(_specs[compositeId].operands.length == 0, "EventComposer: composite exists");

        _specs[compositeId] = compositeSpec;

        emit CompositeEventCreated(compositeId, compositeSpec.op, compositeSpec.operands);
    }

    function getCompositeSpec(bytes32 compositeId) external view returns (CompositeSpec memory) {
        return _specs[compositeId];
    }

    function tryResolve(bytes32 compositeId) external returns (bool resolved, bool outcome) {
        if (_resolved[compositeId]) {
            return (true, _outcome[compositeId]);
        }

        CompositeSpec memory spec = _specs[compositeId];
        require(spec.operands.length != 0, "EventComposer: unknown composite");

        if (spec.op == Op.And || spec.op == Op.Or) {
            bool result = spec.op == Op.And;
            for (uint256 i = 0; i < spec.operands.length; i++) {
                (bool finalized, bool operandOutcome,) = _operandStatus(spec.operands[i]);
                if (!finalized) return (false, false);
                result = spec.op == Op.And ? (result && operandOutcome) : (result || operandOutcome);
            }
            return (true, _cacheResolution(compositeId, result));
        }

        if (spec.op == Op.Not) {
            (bool finalized, bool operandOutcome,) = _operandStatus(spec.operands[0]);
            if (!finalized) return (false, false);
            return (true, _cacheResolution(compositeId, !operandOutcome));
        }

        // Before / Within
        (bool finalized0, bool outcome0, uint64 t0) = _operandStatus(spec.operands[0]);
        (bool finalized1, bool outcome1, uint64 t1) = _operandStatus(spec.operands[1]);
        if (!finalized0 || !finalized1) return (false, false);

        bool result;
        if (spec.op == Op.Before) {
            result = outcome0 && outcome1 && t0 < t1;
        } else {
            uint64 diff = t0 > t1 ? t0 - t1 : t1 - t0;
            result = outcome0 && outcome1 && diff <= spec.window;
        }
        return (true, _cacheResolution(compositeId, result));
    }

    function isResolved(bytes32 compositeId) external view returns (bool) {
        return _resolved[compositeId];
    }

    function getResolvedOutcome(bytes32 compositeId)
        external
        view
        returns (bool resolved, bool outcome)
    {
        return (_resolved[compositeId], _outcome[compositeId]);
    }

    function getResolvedAt(bytes32 compositeId) external view returns (uint64) {
        return _resolvedAt[compositeId];
    }

    // --- Internal helpers ---

    function _cacheResolution(bytes32 compositeId, bool result) private returns (bool) {
        _resolved[compositeId] = true;
        _outcome[compositeId] = result;
        _resolvedAt[compositeId] = uint64(block.timestamp);
        emit CompositeEventResolved(compositeId, result);
        return result;
    }

    /// @dev Resolves an operand's status whether it's a primitive Registry event
    ///      or a nested composite. Not a view function because it may need to be
    ///      called from tryResolve's state-changing context, but it never itself
    ///      mutates state.
    function _operandStatus(bytes32 id)
        private
        view
        returns (bool finalized, bool outcome, uint64 timestamp)
    {
        if (registry.isFinalized(id)) {
            IEventRegistry.Outcome memory o = registry.getOutcome(id);
            return (true, abi.decode(o.outcomeData, (bool)), o.finalizedAt);
        }
        if (_resolved[id]) {
            return (true, _outcome[id], _resolvedAt[id]);
        }
        return (false, false, 0);
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
}
