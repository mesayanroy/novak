// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEventRegistry
/// @notice Canonical source of truth for event definitions and lifecycle state.
/// @dev Lifecycle: CREATE -> OPEN -> OBSERVATIONS SUBMITTED -> PROPOSED OUTCOME
///      -> DISPUTE WINDOW -> QUORUM/RESOLUTION -> FINALIZED -> AVAILABLE TO CONSUMERS.
///      The Registry owns this state machine. Resolvers write observations into it;
///      consumers only ever read finalized events, and only through the EventBus
///      (see IEventBus) — never directly against the Registry or a resolver.
interface IEventRegistry {
    enum EventStatus {
        None,
        Open,
        ObservationsSubmitted,
        ProposedOutcome,
        DisputeWindow,
        Finalized,
        Voided
    }

    /// @notice Deterministic, machine-checkable description of what is being observed.
    /// @dev TODO(protocol semantics — confirm before implementing): exact encoding of
    ///      `spec`. Candidate: opaque bytes containing an ABI-encoded struct whose shape
    ///      is versioned by `specVersion`, so the Registry never needs to parse it —
    ///      only resolvers and consumers that understand `specVersion` do. Needs a
    ///      decision on- versus off-chain schema storage before this is load-bearing.
    struct EventSpec {
        uint16 specVersion;
        bytes32 sourceId; // identifies which resolver adapter class can serve this event
        uint64 openTimestamp;
        uint64 observationDeadline;
        uint64 disputeWindowSeconds;
        bytes spec; // opaque, versioned event definition (see TODO above)
    }

    struct Outcome {
        bool exists;
        bytes32 outcomeHash; // commitment to the resolved outcome payload
        bytes outcomeData; // decodable per EventSpec.specVersion
        uint64 finalizedAt;
    }

    event EventCreated(bytes32 indexed eventId, bytes32 indexed sourceId, uint16 specVersion);
    event EventStatusChanged(bytes32 indexed eventId, EventStatus previous, EventStatus current);
    event OutcomeProposed(bytes32 indexed eventId, bytes32 outcomeHash, address indexed proposer);
    event EventFinalized(bytes32 indexed eventId, bytes32 outcomeHash);

    /// @notice Registers a new primitive event definition.
    /// @dev TODO(protocol semantics): exact eventId derivation scheme (e.g.
    ///      keccak256(sourceId, specVersion, spec, nonce)) is not yet fixed — confirm
    ///      collision/replay handling before implementing.
    function createEvent(EventSpec calldata eventSpec) external returns (bytes32 eventId);

    function getEventSpec(bytes32 eventId) external view returns (EventSpec memory);

    function getEvent(bytes32 eventId) external view returns (EventStatus status);

    function getOutcome(bytes32 eventId) external view returns (Outcome memory);

    function isFinalized(bytes32 eventId) external view returns (bool);
}
