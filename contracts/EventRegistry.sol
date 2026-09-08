// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEventRegistry} from "./interfaces/IEventRegistry.sol";

/// @title EventRegistry
/// @notice Canonical registry of event definitions and lifecycle state. See
///         IEventRegistry for the full contract. This is a skeleton: state layout and
///         event emission are wired up, but resolver-submission, quorum, and dispute
///         logic are NOT implemented here yet — that lives in the resolver network's
///         interaction with this contract, to be filled in once quorum math is agreed.
/// @dev Consumers must never call this contract directly — always go through EventBus.
contract EventRegistry is IEventRegistry {
    mapping(bytes32 => EventSpec) private _specs;
    mapping(bytes32 => EventStatus) private _status;
    mapping(bytes32 => Outcome) private _outcomes;

    // TODO: nonce/salt source for eventId derivation — see IEventRegistry.createEvent.
    uint256 private _nonce;

    function createEvent(EventSpec calldata eventSpec) external returns (bytes32 eventId) {
        // TODO(protocol semantics): finalize eventId derivation before this is
        // treated as canonical. Placeholder scheme below is NOT collision-hardened
        // for production and is intentionally simple for scaffolding purposes.
        eventId = keccak256(
            abi.encode(eventSpec.sourceId, eventSpec.specVersion, eventSpec.spec, _nonce++)
        );

        require(_status[eventId] == EventStatus.None, "EventRegistry: exists");

        _specs[eventId] = eventSpec;
        _status[eventId] = EventStatus.Open;

        emit EventCreated(eventId, eventSpec.sourceId, eventSpec.specVersion);
        emit EventStatusChanged(eventId, EventStatus.None, EventStatus.Open);
    }

    function getEventSpec(bytes32 eventId) external view returns (EventSpec memory) {
        return _specs[eventId];
    }

    function getEvent(bytes32 eventId) external view returns (EventStatus status) {
        return _status[eventId];
    }

    function getOutcome(bytes32 eventId) external view returns (Outcome memory) {
        return _outcomes[eventId];
    }

    function isFinalized(bytes32 eventId) external view returns (bool) {
        return _status[eventId] == EventStatus.Finalized;
    }

    // --- Resolver-facing lifecycle transitions (unimplemented) ---
    //
    // function submitObservation(...) external { ... }   // OBSERVATIONS SUBMITTED
    // function proposeOutcome(...) external { ... }       // PROPOSED OUTCOME
    // function openDispute(...) external { ... }           // DISPUTE WINDOW
    // function finalize(...) external { ... }              // QUORUM/RESOLUTION -> FINALIZED
    //
    // TODO: these require the resolver network's quorum + dispute design (see
    // resolver/consensus/ and docs/protocol-spec.md) before implementation. Deliberately
    // left out of this scaffold rather than guessed.
}
