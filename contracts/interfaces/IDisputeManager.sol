// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IDisputeManager
/// @notice Resolves disagreement about a primitive event's outcome through a
///         bonded, two-tier committee escalation ladder — never a
///         token-weighted governance vote. This is the concrete mechanism
///         behind the "Novak resolves on a protocol rule, not a DVM vote"
///         claim in docs/architecture.md.
/// @dev Two independent entry points feed the same ladder:
///      - `dispute`: someone actively challenges a `ProposedOutcome` inside
///        its dispute window, posting `DISPUTE_BOND`.
///      - `escalateNonConvergence`: anyone can call this once an event's
///        `observationDeadline` has passed with observations on file but no
///        outcome ever reached quorum — a genuine split, not a challenge.
///
///      Every fixed number here (committee sizes, bonds, windows, the 66%
///      agreement bar, the burn/reward/treasury split) is a stated MVP
///      constant, not a final economic design — see docs/protocol-spec.md.
///      Committee selection is pseudo-random (seeded from block data), which
///      is NOT resistant to a miner/validator choosing when to include the
///      selecting transaction — a documented limitation, see
///      docs/threat-model.md.
interface IDisputeManager {
    enum VoteChoice {
        NotVoted,
        VotedTrue,
        VotedFalse
    }

    event DisputeFiled(bytes32 indexed eventId, address indexed disputer, uint256 bond);
    event NonConvergenceEscalated(bytes32 indexed eventId);
    event TierOpened(
        bytes32 indexed eventId, uint8 indexed tier, address[] committee, uint64 deadline
    );
    event TierVoteSubmitted(
        bytes32 indexed eventId, uint8 indexed tier, address indexed member, bool outcome
    );
    event TierConverged(bytes32 indexed eventId, uint8 indexed tier, bool outcome);
    event TierEscalated(bytes32 indexed eventId, uint8 indexed toTier);
    event DisputeVoided(bytes32 indexed eventId);

    /// @notice Challenges a `ProposedOutcome` within its dispute window.
    ///         Requires posting exactly `DISPUTE_BOND` wei. Opens Tier-1.
    function dispute(bytes32 eventId) external payable;

    /// @notice Permissionless: escalates a non-converging quorum (no dispute
    ///         bond required, since nobody is challenging a proposal that
    ///         never existed) directly into Tier-1.
    function escalateNonConvergence(bytes32 eventId) external;

    /// @notice A selected Tier-1 committee member casts one bonded
    ///         re-resolution vote. Requires posting exactly `TIER1_BOND` wei.
    ///         Auto-finalizes the event the instant 66% of the committee
    ///         agrees on the same outcome.
    function submitTier1Vote(bytes32 eventId, bool outcome) external payable;

    /// @notice Callable by anyone once the Tier-1 window has elapsed without
    ///         66% agreement. Refunds all Tier-1 bonds (no decision was
    ///         reached, so nobody is "wrong") and opens Tier-2.
    function escalateTier2(bytes32 eventId) external;

    /// @notice A selected Tier-2 committee member casts one bonded
    ///         re-resolution vote. Requires posting exactly `TIER2_BOND` wei.
    ///         Auto-finalizes the event the instant 66% of the committee
    ///         agrees on the same outcome.
    function submitTier2Vote(bytes32 eventId, bool outcome) external payable;

    /// @notice Callable by anyone once the Tier-2 window has elapsed without
    ///         66% agreement. Refunds all Tier-2 bonds and the original
    ///         disputer's bond (if any), and marks the event permanently
    ///         `Voided` via `IEventRegistry.voidEvent` — the hard floor of
    ///         the ladder. Never escalates to a vote of any other kind.
    function voidAfterTier2Timeout(bytes32 eventId) external;

    function getCommittee(bytes32 eventId, uint8 tier) external view returns (address[] memory);

    function getTierTally(bytes32 eventId, uint8 tier)
        external
        view
        returns (uint256 trueVotes, uint256 falseVotes, uint64 deadline, uint256 bondAmount);
}
