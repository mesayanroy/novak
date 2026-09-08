// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEventBus} from "./interfaces/IEventBus.sol";
import {IEventRegistry} from "./interfaces/IEventRegistry.sol";
import {IEventComposer} from "./interfaces/IEventComposer.sol";

/// @title EventBus
/// @notice The single read surface applications (e.g. the derivatives Market) are
///         allowed to depend on. Wraps the Registry (for primitive events) and the
///         Composer (for composite events) behind one pull-based interface so
///         consumers never need to know which one produced a given event ID.
/// @dev Architectural invariant: this contract may read from EventRegistry and
///      EventComposer. Nothing downstream of this contract may reference a resolver.
contract EventBus is IEventBus {
    IEventRegistry public immutable registry;
    IEventComposer public immutable composer;

    constructor(address registry_, address composer_) {
        registry = IEventRegistry(registry_);
        composer = IEventComposer(composer_);
    }

    function readOutcome(bytes32 eventId)
        external
        view
        returns (IEventRegistry.Outcome memory outcome)
    {
        require(registry.isFinalized(eventId), "EventBus: not finalized");
        return registry.getOutcome(eventId);
    }

    function isAvailable(bytes32 eventId) external view returns (bool) {
        // TODO: once composite events carry their own outcome storage (rather than
        // being derived on-demand via IEventComposer.tryResolve), this should also
        // check composite availability without requiring a state-changing call.
        return registry.isFinalized(eventId);
    }
}
