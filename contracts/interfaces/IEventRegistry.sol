// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEventRegistry
/// @notice Canonical source of truth for event definitions and lifecycle state.
/// @dev Lifecycle: CREATE -> OPEN -> OBSERVATIONS SUBMITTED -> PROPOSED OUTCOME
///      -> DISPUTE WINDOW -> QUORUM/RESOLUTION -> FINALIZED (or VOIDED) ->
///      AVAILABLE TO CONSUMERS. The Registry owns this state machine. Resolvers
///      write observations into it; consumers only ever read finalized events,
///      and only through the EventBus (see IEventBus) — never directly against
///      the Registry or a resolver.
///
///      FINALIZED MVP PROTOCOL DECISIONS (see docs/protocol-spec.md for the
///      full rationale — these were open TODOs in the initial scaffold and are
///      now settled for the MVP):
///
///      - Event ID = keccak256(sourceId, specVersion, spec, nonce). Not
///        collision-hardened across chains/deployments; fine for a single MVP
///        deployment.
///      - Outcome payload schema (specVersion 1): `outcomeData` is
///        `abi.encode(bool)` — every MVP event resolves to a single boolean.
///        This matches every example in the spec (price thresholds, rate-cut
///        decisions, etc. are all yes/no conditions) and is what
///        EventComposer/Settlement decode.
///      - Quorum: resolvers are individually authorized by the Registry owner
///        (`setResolverAuthorization`) — no on-chain staking/reputation token
///        in the MVP (that's "production-scale token economics", explicitly
///        deferred). Quorum is reached when `EventSpec.quorumThreshold`
///        authorized resolvers submit the exact same `outcomeData` for an
///        event.
///      - Dispute mechanism: any account may dispute a proposed outcome
///        within the dispute window by posting `DISPUTE_BOND` (native ETH).
///        Disputes are arbitrated by the Registry owner for the MVP
///        (`resolveDispute`) — full decentralized dispute arbitration is out
///        of scope; see docs/threat-model.md item 2.
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

    struct EventSpec {
        uint16 specVersion;
        bytes32 sourceId; // identifies which resolver adapter class can serve this event
        uint64 openTimestamp;
        uint64 observationDeadline;
        uint64 disputeWindowSeconds;
        uint8 quorumThreshold; // number of matching authorized-resolver observations required
        bytes spec; // opaque, versioned event definition (decoded off-chain per specVersion)
    }

    struct Outcome {
        bool exists;
        bytes32 outcomeHash; // commitment to the resolved outcome payload
        bytes outcomeData; // decodable per EventSpec.specVersion (v1: abi.encode(bool))
        uint64 finalizedAt;
    }

    event EventCreated(bytes32 indexed eventId, bytes32 indexed sourceId, uint16 specVersion);
    event EventStatusChanged(bytes32 indexed eventId, EventStatus previous, EventStatus current);
    event ObservationSubmitted(
        bytes32 indexed eventId, address indexed resolver, bytes32 outcomeHash, bytes32 evidenceHash
    );
    event OutcomeProposed(bytes32 indexed eventId, bytes32 outcomeHash, address indexed proposer);
    event EventDisputed(bytes32 indexed eventId, address indexed disputer);
    event DisputeResolved(bytes32 indexed eventId, bool upheldProposal);
    event EventFinalized(bytes32 indexed eventId, bytes32 outcomeHash);
    event ResolverAuthorizationChanged(address indexed resolver, bool authorized);

    /// @notice Registers a new primitive event definition. Anyone may create an
    ///         event — permissionless event creation, permissioned resolution.
    function createEvent(EventSpec calldata eventSpec) external returns (bytes32 eventId);

    /// @notice Authorized resolvers submit an observation (outcome + evidence
    ///         commitment). Once `quorumThreshold` resolvers agree on the same
    ///         `outcomeData`, the outcome is auto-proposed and the dispute
    ///         window begins.
    function submitObservation(bytes32 eventId, bytes calldata outcomeData, bytes32 evidenceHash)
        external;

    /// @notice Challenges a proposed outcome before the dispute window closes.
    ///         Requires posting `DISPUTE_BOND` wei as a bond.
    function dispute(bytes32 eventId) external payable;

    /// @notice Registry owner arbitrates a filed dispute. If `upholdProposal`
    ///         is true, the event finalizes with the disputed outcome and the
    ///         disputer's bond is forfeited; otherwise the event is voided and
    ///         the bond is refunded.
    function resolveDispute(bytes32 eventId, bool upholdProposal) external;

    /// @notice Finalizes a proposed outcome once its dispute window has
    ///         elapsed with no dispute filed. Callable by anyone.
    function finalize(bytes32 eventId) external;

    /// @notice Registry owner grants/revokes resolver authorization.
    function setResolverAuthorization(address resolver, bool authorized) external;

    function isAuthorizedResolver(address resolver) external view returns (bool);

    function getEventSpec(bytes32 eventId) external view returns (EventSpec memory);

    function getEvent(bytes32 eventId) external view returns (EventStatus status);

    function getOutcome(bytes32 eventId) external view returns (Outcome memory);

    function isFinalized(bytes32 eventId) external view returns (bool);
}
