// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEventBus} from "./interfaces/IEventBus.sol";
import {IEventRegistry} from "./interfaces/IEventRegistry.sol";
import {IEventComposer} from "./interfaces/IEventComposer.sol";

/// @title EventBus
/// @notice The single read surface applications (e.g. the derivatives Market) are
///         allowed to depend on. Transparently serves BOTH primitive events
///         (finalized in the Registry) and composite events (resolved in the
///         Composer) behind one pull-based interface, so consumers never need to
///         know or care which one produced a given event ID.
/// @dev Architectural invariant: this contract may read from EventRegistry and
///      EventComposer. Nothing downstream of this contract may reference a
///      resolver. Composite outcomes must already be resolved via
///      `IEventComposer.tryResolve` by someone (any account may call it) before
///      they become available here — the Bus itself never triggers resolution,
///      it only reads the cached result. That keeps `isAvailable`/`readOutcome`
///      pure `view` functions, consistent with the pull model.
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
        if (registry.isFinalized(eventId)) {
            return registry.getOutcome(eventId);
        }

        (bool resolved, bool outcome_) = composer.getResolvedOutcome(eventId);
        require(resolved, "EventBus: not finalized");

        return IEventRegistry.Outcome({
            exists: true,
            outcomeHash: keccak256(abi.encode(outcome_)),
            outcomeData: abi.encode(outcome_),
            finalizedAt: composer.getResolvedAt(eventId)
        });
    }

    function isAvailable(bytes32 eventId) external view returns (bool) {
        if (registry.isFinalized(eventId)) {
            return true;
        }
        return composer.isResolved(eventId);
    }
}
