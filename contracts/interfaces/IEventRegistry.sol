// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEventRegistry
/// @notice Canonical source of truth for event definitions and lifecycle state.
/// @dev Lifecycle: CREATE -> OPEN -> OBSERVATIONS SUBMITTED -> PROPOSED OUTCOME
///      -> DISPUTED -> FINALIZED (or VOIDED / EXPIRED) -> AVAILABLE TO
///      CONSUMERS. The Registry owns this state machine. Resolvers write
///      observations into it; consumers only ever read finalized events, and
///      only through the EventBus (see IEventBus) — never directly against
///      the Registry or a resolver.
///
///      FINALIZED MVP PROTOCOL DECISIONS (see docs/protocol-spec.md for the
///      full rationale):
///
///      - Event ID = keccak256(sourceId, specVersion, spec, nonce). Not
///        collision-hardened across chains/deployments; fine for a single MVP
///        deployment.
///      - Outcome payload schema (specVersion 1): `outcomeData` is
///        `abi.encode(bool)` — every MVP event resolves to a single boolean.
///      - Quorum: resolvers are individually authorized by the Registry owner
///        (`setResolverAuthorization`) — no on-chain staking/reputation token
///        in the MVP. Quorum is reached when `EventSpec.quorumThreshold`
///        authorized resolvers submit the exact same `outcomeData` for an
///        event.
///      - Dispute mechanism: arbitration is NOT owner-controlled. Disputes
///        and non-converging quorums are handed off to a dedicated
///        `IDisputeManager` (set once, immutably, via `setDisputeManager`),
///        which runs a bonded, two-tier committee escalation ladder and
///        drives this Registry's state transitions through the
///        `onlyDisputeManager` functions below. See docs/protocol-spec.md
///        and docs/threat-model.md for the full design and its residual
///        (documented) limitations.
///      - Terminal non-outcomes are first-class: `Voided` (a dispute
///        escalation that never converged) and `Expired` (nobody ever
///        observed the event, or observations never reached quorum before
///        the deadline) are both distinct from `Finalized` and are never
///        exposed as a true/false outcome — see `EventComposer` for how
///        these propagate through composition.
interface IEventRegistry {
    enum EventStatus {
        None,
        Open,
        ObservationsSubmitted,
        ProposedOutcome,
        Disputed,
        Finalized,
        Voided,
        Expired
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
    event EventFinalized(bytes32 indexed eventId, bytes32 outcomeHash);
    event ResolverAuthorizationChanged(address indexed resolver, bool authorized);
    event DisputeManagerSet(address indexed disputeManager);

    /// @notice Registers a new primitive event definition. Anyone may create an
    ///         event — permissionless event creation, permissioned resolution.
    function createEvent(EventSpec calldata eventSpec) external returns (bytes32 eventId);

    /// @notice Authorized resolvers submit an observation (outcome + evidence
    ///         commitment). Once `quorumThreshold` resolvers agree on the same
    ///         `outcomeData`, the outcome is auto-proposed and the dispute
    ///         window begins.
    function submitObservation(bytes32 eventId, bytes calldata outcomeData, bytes32 evidenceHash)
        external;

    /// @notice Finalizes a proposed outcome once its dispute window has
    ///         elapsed with no dispute filed. Callable by anyone.
    function finalize(bytes32 eventId) external;

    /// @notice Callable by anyone once `observationDeadline` has passed with
    ///         zero observations ever submitted (status still `Open`) —
    ///         a clean "the network never had an answer" terminal state.
    function expire(bytes32 eventId) external;

    /// @notice Only callable by the configured DisputeManager, which exposes
    ///         its own permissionless `escalateNonConvergence` entry point
    ///         that anyone may call once `observationDeadline` has passed
    ///         while observations exist but none reached `quorumThreshold`
    ///         (a genuine split/ambiguous case). This Registry-side function
    ///         re-checks that same precondition before flipping the event to
    ///         `Disputed`, so the transition is never trusted blindly from
    ///         the caller — it hands off into the same Tier-1 committee path
    ///         a filed dispute uses.
    function escalateNonConvergence(bytes32 eventId) external;

    /// @notice Registry owner grants/revokes resolver authorization.
    function setResolverAuthorization(address resolver, bool authorized) external;

    /// @notice Registry owner wires the (immutable, one-time) DisputeManager.
    ///         Reverts if already set. Nothing about dispute arbitration is
    ///         controlled by `owner` once this is called — see
    ///         `onlyDisputeManager` functions below.
    function setDisputeManager(address disputeManager) external;

    function isAuthorizedResolver(address resolver) external view returns (bool);

    /// @notice Enumerates every currently-authorized resolver, so a
    ///         DisputeManager can draw an escalation committee from the pool.
    function getAuthorizedResolvers() external view returns (address[] memory);

    function getEventSpec(bytes32 eventId) external view returns (EventSpec memory);

    function getEvent(bytes32 eventId) external view returns (EventStatus status);

    function getOutcome(bytes32 eventId) external view returns (Outcome memory);

    function isFinalized(bytes32 eventId) external view returns (bool);

    /// @notice The currently-proposed outcome for an event still awaiting
    ///         finalization or under dispute — `proposedAt == 0` if none.
    ///         Used by `IDisputeManager` to check the dispute window and to
    ///         compare a committee's decision against the original proposal.
    function getProposal(bytes32 eventId)
        external
        view
        returns (bytes32 outcomeHash, bytes memory outcomeData, uint64 proposedAt);

    // --- DisputeManager-only state transitions ---

    /// @notice Moves a `ProposedOutcome` event into `Disputed`. Only callable
    ///         by the configured DisputeManager, which is itself the only
    ///         thing allowed to decide when a dispute has been validly filed.
    function escalateToDispute(bytes32 eventId) external;

    /// @notice Finalizes an event that went through dispute escalation, with
    ///         the outcome the committee(s) converged on. Only callable by
    ///         the configured DisputeManager.
    function finalizeFromDispute(bytes32 eventId, bytes calldata outcomeData) external;

    /// @notice Marks an event permanently `Voided` — the network genuinely
    ///         could not converge on an outcome even after full escalation.
    ///         Only callable by the configured DisputeManager.
    function voidEvent(bytes32 eventId) external;
}
