// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEventComposer} from "./interfaces/IEventComposer.sol";
import {IEventRegistry} from "./interfaces/IEventRegistry.sol";

/// @title EventComposer
/// @notice Builds composite events (AND/OR/NOT, BEFORE/WITHIN) from primitive event
///         IDs already registered in the EventRegistry. Stores only the composite's
///         definition (op + operands + window) and, once resolved, its boolean
///         outcome — it never copies or duplicates primitive event state.
/// @dev Resolution logic (`tryResolve`) is stubbed. Determinism requirement: for a
///      fixed CompositeSpec and fixed underlying primitive outcomes, tryResolve must
///      always return the same (resolved, outcome) pair, forever.
contract EventComposer is IEventComposer {
    IEventRegistry public immutable registry;

    mapping(bytes32 => CompositeSpec) private _specs;
    mapping(bytes32 => bool) private _resolved;
    mapping(bytes32 => bool) private _outcome;

    constructor(address registry_) {
        registry = IEventRegistry(registry_);
    }

    function createComposite(CompositeSpec calldata compositeSpec)
        external
        returns (bytes32 compositeId)
    {
        _validateOperandCount(compositeSpec.op, compositeSpec.operands.length);

        // TODO(protocol semantics): finalize compositeId derivation (including
        // whether operand order matters for commutative ops like AND/OR) before this
        // is treated as canonical. Placeholder below is order-sensitive.
        compositeId = keccak256(
            abi.encode(compositeSpec.op, compositeSpec.operands, compositeSpec.window)
        );

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

        // TODO: implement per-op resolution once all operand primitives are
        // finalized in the Registry:
        //   And:    all operand outcomes true
        //   Or:     any operand outcome true
        //   Not:    single operand, negate its outcome
        //   Before: operand[0] finalizedAt < operand[1] finalizedAt (both true)
        //   Within: |operand[0].finalizedAt - operand[1].finalizedAt| <= window
        //
        // Left unimplemented pending the temporal-ops timestamp source decision
        // (event finalization time vs. an in-spec "occurred at" timestamp) —
        // see docs/protocol-spec.md.
        return (false, false);
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
