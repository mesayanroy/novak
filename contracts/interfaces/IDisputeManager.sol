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
///      Committee selection: when the authorized pool fits in the tier
///      (≤ committee size) the committee is the whole pool. When it doesn't,
///      the tier opens with a commit-reveal seeding phase — resolvers commit
///      to secret salts, reveal them, and the committee is drawn from their
///      XOR, so no single party (sequencer included) can predict or steer the
///      draw; committers that don't reveal are excluded from it. See
///      docs/protocol-spec.md and docs/threat-model.md.
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
    event SeedingStarted(
        bytes32 indexed eventId, uint8 indexed tier, uint64 commitDeadline, uint64 revealDeadline
    );
    event SeedCommitted(bytes32 indexed eventId, uint8 indexed tier, address indexed resolver);
    event SeedRevealed(bytes32 indexed eventId, uint8 indexed tier, address indexed resolver);

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

    /// @notice Seeding phase (large pools only): an authorized resolver commits
    ///         to `keccak256(abi.encode(eventId, tier, msg.sender, salt))`
    ///         before the commit deadline.
    function commitSeed(bytes32 eventId, bytes32 commitment) external;

    /// @notice Seeding phase: reveals the committed salt between the commit and
    ///         reveal deadlines. The salts are XOR-combined into the draw seed.
    function revealSeed(bytes32 eventId, bytes32 salt) external;

    /// @notice Permissionless: draws the active tier's committee once the reveal
    ///         window has ended (or every committer has revealed), excluding
    ///         committers that never revealed; then the voting window starts.
    function drawCommittee(bytes32 eventId) external;

    /// @notice Withdraws all ETH (bond refunds, rewards, treasury share)
    ///         credited to the caller. Payouts are pull-based so no
    ///         recipient can block a resolution by rejecting ETH.
    function withdraw() external;

    function pendingWithdrawals(address account) external view returns (uint256);

    function getCommittee(bytes32 eventId, uint8 tier) external view returns (address[] memory);

    /// @notice How `member` voted in `tier` of `eventId`'s dispute.
    function getVote(bytes32 eventId, uint8 tier, address member) external view returns (VoteChoice);

    /// @notice `tier` is the currently (or last) active tier; when `resolved`
    ///         and the Registry shows the event Finalized, that tier converged
    ///         and decided it (a Voided event never converged).
    function getCaseSummary(bytes32 eventId)
        external
        view
        returns (bool exists, bool resolved, uint8 tier, bool hasOriginalProposal);

    /// @notice Seeding state of `tier` (all zero / `drawn` true for a tier that
    ///         never needed seeding).
    function getSeedState(bytes32 eventId, uint8 tier)
        external
        view
        returns (
            bool seeding,
            uint64 commitDeadline,
            uint64 revealDeadline,
            uint32 commits,
            uint32 reveals,
            bool drawn
        );

    function getTierTally(bytes32 eventId, uint8 tier)
        external
        view
        returns (uint256 trueVotes, uint256 falseVotes, uint64 deadline, uint256 bondAmount);
}
