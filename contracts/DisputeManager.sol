// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IDisputeManager } from "./interfaces/IDisputeManager.sol";
import { IEventRegistry } from "./interfaces/IEventRegistry.sol";

/// @title DisputeManager
/// @notice Bonded, two-tier committee escalation ladder for disagreement
///         about a primitive event's outcome. See IDisputeManager for the
///         full design rationale and docs/protocol-spec.md /
///         docs/threat-model.md for the numbers and their limitations.
/// @dev Every committee member in a given tier bonds the *same* fixed
///      amount (`TIER1_BOND`/`TIER2_BOND`) — this is a deliberate
///      simplification of the "weight = min(bondStaked, cap)" idea from the
///      source design: with no on-chain staking token in the MVP (same
///      deferred-scope decision as base-layer quorum), fixed equal bonds
///      make the weight cap degenerate to one-member-one-vote by
///      construction, which already defeats a single large stake dominating
///      a committee, without inventing a variable-stake mechanism the rest
///      of the protocol doesn't have.
contract DisputeManager is IDisputeManager {
    uint256 public constant DISPUTE_BOND = 0.01 ether;
    uint256 public constant TIER1_BOND = 0.03 ether;
    uint256 public constant TIER2_BOND = 0.08 ether;

    uint256 public constant TIER1_COMMITTEE_SIZE = 7;
    uint256 public constant TIER2_COMMITTEE_SIZE = 15;

    uint64 public constant TIER1_WINDOW = 1 hours;
    uint64 public constant TIER2_WINDOW = 2 hours;

    /// @dev Agreement is measured against the fixed committee size decided
    ///      at selection time, not against however many members bothered to
    ///      vote — so a handful of early votes can never manufacture 66%.
    uint256 public constant AGREEMENT_BPS = 66;

    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    IEventRegistry public immutable registry;
    address public immutable treasury;

    struct DisputeCase {
        bool exists;
        bool resolved;
        bool hasOriginalProposal;
        bool originalOutcome;
        address disputer;
        uint256 disputerBond;
        uint8 tier; // 1 or 2 — the currently (or last) active tier
    }

    struct Tier {
        address[] committee;
        uint256 bondAmount;
        uint64 deadline;
        uint256 trueVotes;
        uint256 falseVotes;
        mapping(address => VoteChoice) votes;
    }

    mapping(bytes32 => DisputeCase) private _cases;
    mapping(bytes32 => mapping(uint8 => Tier)) private _tiers;

    constructor(address registry_, address treasury_) {
        registry = IEventRegistry(registry_);
        treasury = treasury_;
    }

    // --- Entry points ---

    function dispute(bytes32 eventId) external payable {
        require(!_cases[eventId].exists, "DisputeManager: already escalated");
        require(
            registry.getEvent(eventId) == IEventRegistry.EventStatus.ProposedOutcome,
            "DisputeManager: not disputable"
        );

        (, bytes memory outcomeData, uint64 proposedAt) = registry.getProposal(eventId);
        IEventRegistry.EventSpec memory spec = registry.getEventSpec(eventId);
        require(
            block.timestamp < proposedAt + spec.disputeWindowSeconds,
            "DisputeManager: dispute window closed"
        );
        require(msg.value == DISPUTE_BOND, "DisputeManager: incorrect bond");

        DisputeCase storage c = _cases[eventId];
        c.exists = true;
        c.hasOriginalProposal = true;
        c.originalOutcome = abi.decode(outcomeData, (bool));
        c.disputer = msg.sender;
        c.disputerBond = msg.value;
        c.tier = 1;

        registry.escalateToDispute(eventId);
        _openTier(eventId, 1);

        emit DisputeFiled(eventId, msg.sender, msg.value);
    }

    function escalateNonConvergence(bytes32 eventId) external {
        require(!_cases[eventId].exists, "DisputeManager: already escalated");
        require(
            registry.getEvent(eventId) == IEventRegistry.EventStatus.ObservationsSubmitted,
            "DisputeManager: not ambiguous"
        );
        IEventRegistry.EventSpec memory spec = registry.getEventSpec(eventId);
        require(
            block.timestamp > spec.observationDeadline,
            "DisputeManager: observation window still open"
        );

        DisputeCase storage c = _cases[eventId];
        c.exists = true;
        c.hasOriginalProposal = false;
        c.tier = 1;

        registry.escalateNonConvergence(eventId);
        _openTier(eventId, 1);

        emit NonConvergenceEscalated(eventId);
    }

    function submitTier1Vote(bytes32 eventId, bool outcome) external payable {
        _submitTierVote(eventId, 1, outcome);
    }

    function submitTier2Vote(bytes32 eventId, bool outcome) external payable {
        _submitTierVote(eventId, 2, outcome);
    }

    function escalateTier2(bytes32 eventId) external {
        DisputeCase storage c = _cases[eventId];
        require(c.exists && !c.resolved && c.tier == 1, "DisputeManager: not escalatable");

        Tier storage t1 = _tiers[eventId][1];
        require(block.timestamp >= t1.deadline, "DisputeManager: tier1 window still open");
        require(!_hasConverged(t1), "DisputeManager: tier1 already converged");

        // Effects before interactions: flip to tier 2 (and open its
        // committee) BEFORE refunding tier-1 bonds, so a malicious
        // committee-member contract that reenters this function on receipt
        // of its refund immediately fails the `c.tier == 1` check instead
        // of being able to trigger a second refund pass.
        c.tier = 2;
        _openTier(eventId, 2);
        emit TierEscalated(eventId, 2);

        _refundTierBonds(t1);
    }

    function voidAfterTier2Timeout(bytes32 eventId) external {
        DisputeCase storage c = _cases[eventId];
        require(c.exists && !c.resolved && c.tier == 2, "DisputeManager: not voidable");

        Tier storage t2 = _tiers[eventId][2];
        require(block.timestamp >= t2.deadline, "DisputeManager: tier2 window still open");
        require(!_hasConverged(t2), "DisputeManager: tier2 already converged");

        // Effects (incl. the trusted registry call) before interactions
        // (bond refunds to potentially-untrusted committee/disputer
        // addresses) — see the same rationale in `escalateTier2`.
        c.resolved = true;
        registry.voidEvent(eventId);
        emit DisputeVoided(eventId);

        _refundTierBonds(t2);
        if (c.hasOriginalProposal && c.disputerBond > 0) {
            _send(c.disputer, c.disputerBond);
        }
    }

    // --- Internal: tier lifecycle ---

    function _openTier(bytes32 eventId, uint8 tierNum) private {
        Tier storage t = _tiers[eventId][tierNum];
        uint256 size = tierNum == 1 ? TIER1_COMMITTEE_SIZE : TIER2_COMMITTEE_SIZE;
        t.bondAmount = tierNum == 1 ? TIER1_BOND : TIER2_BOND;
        t.deadline = uint64(block.timestamp) + (tierNum == 1 ? TIER1_WINDOW : TIER2_WINDOW);
        t.committee = _selectCommittee(eventId, tierNum, size);

        emit TierOpened(eventId, tierNum, t.committee, t.deadline);
    }

    function _submitTierVote(bytes32 eventId, uint8 tierNum, bool outcome) private {
        DisputeCase storage c = _cases[eventId];
        require(c.exists && !c.resolved && c.tier == tierNum, "DisputeManager: not in this tier");

        Tier storage t = _tiers[eventId][tierNum];
        require(block.timestamp < t.deadline, "DisputeManager: tier window closed");
        require(msg.value == t.bondAmount, "DisputeManager: incorrect bond");
        require(_isCommitteeMember(t.committee, msg.sender), "DisputeManager: not on committee");
        require(t.votes[msg.sender] == VoteChoice.NotVoted, "DisputeManager: already voted");

        t.votes[msg.sender] = outcome ? VoteChoice.VotedTrue : VoteChoice.VotedFalse;
        if (outcome) {
            t.trueVotes++;
        } else {
            t.falseVotes++;
        }

        emit TierVoteSubmitted(eventId, tierNum, msg.sender, outcome);

        uint256 size = t.committee.length;
        if (t.trueVotes * 100 >= size * AGREEMENT_BPS) {
            _resolveTier(eventId, tierNum, true);
        } else if (t.falseVotes * 100 >= size * AGREEMENT_BPS) {
            _resolveTier(eventId, tierNum, false);
        }
    }

    /// @dev Split into small helpers (`_computeResolutionMath`,
    ///      `_payoutCommittee`, `_settleDisputerBond`) purely to keep this
    ///      function's local-variable count low enough for the EVM stack —
    ///      the original single-function version hit "stack too deep" at
    ///      the optimizer settings this repo builds with.
    function _resolveTier(bytes32 eventId, uint8 tierNum, bool decidedOutcome) private {
        DisputeCase storage c = _cases[eventId];
        Tier storage t = _tiers[eventId][tierNum];

        ResolutionMath memory m = _computeResolutionMath(t, decidedOutcome);
        bool hasOriginalProposal = c.hasOriginalProposal;
        bool disputerWasRight = hasOriginalProposal && decidedOutcome != c.originalOutcome;
        address disputer = c.disputer;
        uint256 disputerBond = c.disputerBond;

        // Effects (incl. the trusted registry call) before interactions: a
        // malicious committee-member contract reentering on receipt of its
        // payout below must see `c.resolved == true` and every other guard
        // already tripped, so it can never trigger a second payout pass.
        c.resolved = true;
        registry.finalizeFromDispute(eventId, abi.encode(decidedOutcome));
        emit TierConverged(eventId, tierNum, decidedOutcome);

        _payoutCommittee(t, decidedOutcome, m);
        if (hasOriginalProposal) {
            _settleDisputerBond(disputerWasRight, disputer, disputerBond);
        }
    }

    struct ResolutionMath {
        uint256 perWinner;
        uint256 burnShare;
        uint256 treasuryDust;
    }

    function _computeResolutionMath(Tier storage t, bool decidedOutcome)
        private
        view
        returns (ResolutionMath memory m)
    {
        uint256 winningVotes = decidedOutcome ? t.trueVotes : t.falseVotes;
        uint256 losingVotes = decidedOutcome ? t.falseVotes : t.trueVotes;
        uint256 losingPool = losingVotes * t.bondAmount;

        m.burnShare = losingPool / 3;
        uint256 treasuryShare = losingPool / 3;
        uint256 rewardPool = losingPool - m.burnShare - treasuryShare;
        m.perWinner = winningVotes > 0 ? rewardPool / winningVotes : 0;
        uint256 dust = winningVotes > 0 ? rewardPool - (m.perWinner * winningVotes) : rewardPool;
        m.treasuryDust = treasuryShare + dust;
    }

    function _payoutCommittee(Tier storage t, bool decidedOutcome, ResolutionMath memory m)
        private
    {
        for (uint256 i = 0; i < t.committee.length; i++) {
            address member = t.committee[i];
            VoteChoice v = t.votes[member];
            bool votedWithWinner = (decidedOutcome && v == VoteChoice.VotedTrue)
                || (!decidedOutcome && v == VoteChoice.VotedFalse);
            if (votedWithWinner) {
                _send(member, t.bondAmount + m.perWinner);
            }
        }
        if (m.burnShare > 0) _send(BURN_ADDRESS, m.burnShare);
        if (m.treasuryDust > 0) _send(treasury, m.treasuryDust);
    }

    /// @dev Disputer challenged a proposal the committee upheld: their bond
    ///      is forfeited using the same burn/treasury split, but is not
    ///      further distributed to the committee (that would require a
    ///      second per-member loop) — a documented simplification.
    function _settleDisputerBond(bool disputerWasRight, address disputer, uint256 disputerBond)
        private
    {
        if (disputerWasRight) {
            _send(disputer, disputerBond);
        } else {
            uint256 dBurn = disputerBond / 3;
            uint256 dTreasury = disputerBond - dBurn;
            if (dBurn > 0) _send(BURN_ADDRESS, dBurn);
            if (dTreasury > 0) _send(treasury, dTreasury);
        }
    }

    function _refundTierBonds(Tier storage t) private {
        for (uint256 i = 0; i < t.committee.length; i++) {
            address member = t.committee[i];
            if (t.votes[member] != VoteChoice.NotVoted) {
                _send(member, t.bondAmount);
            }
        }
    }

    function _hasConverged(Tier storage t) private view returns (bool) {
        uint256 size = t.committee.length;
        return
            t.trueVotes * 100 >= size * AGREEMENT_BPS || t.falseVotes * 100 >= size * AGREEMENT_BPS;
    }

    // --- Internal: committee selection ---

    /// @dev Pseudo-random, seeded from block data — sufficient to spread
    ///      selection across the authorized-resolver pool for the MVP, but
    ///      NOT resistant to a miner/validator choosing whether to include
    ///      the triggering transaction in a favorable block. See
    ///      docs/threat-model.md. When the pool is at or below the tier
    ///      size, every authorized resolver is simply on the committee —
    ///      this is what every test in this repo exercises, since none spin
    ///      up 7+ resolver addresses.
    function _selectCommittee(bytes32 eventId, uint8 tierNum, uint256 size)
        private
        view
        returns (address[] memory)
    {
        address[] memory pool = registry.getAuthorizedResolvers();
        if (pool.length <= size) {
            return pool;
        }

        bytes32 seed =
            keccak256(abi.encode(eventId, tierNum, blockhash(block.number - 1), block.timestamp));
        uint256 remaining = pool.length;
        for (uint256 i = 0; i < size; i++) {
            uint256 j = i + (uint256(keccak256(abi.encode(seed, i))) % remaining);
            (pool[i], pool[j]) = (pool[j], pool[i]);
            remaining--;
        }

        address[] memory committee = new address[](size);
        for (uint256 i = 0; i < size; i++) {
            committee[i] = pool[i];
        }
        return committee;
    }

    function _isCommitteeMember(address[] storage committee, address account)
        private
        view
        returns (bool)
    {
        for (uint256 i = 0; i < committee.length; i++) {
            if (committee[i] == account) return true;
        }
        return false;
    }

    function _send(address to, uint256 amount) private {
        (bool sent,) = to.call{ value: amount }("");
        require(sent, "DisputeManager: transfer failed");
    }

    // --- Views ---

    function getCommittee(bytes32 eventId, uint8 tier) external view returns (address[] memory) {
        return _tiers[eventId][tier].committee;
    }

    function getTierTally(bytes32 eventId, uint8 tier)
        external
        view
        returns (uint256 trueVotes, uint256 falseVotes, uint64 deadline, uint256 bondAmount)
    {
        Tier storage t = _tiers[eventId][tier];
        return (t.trueVotes, t.falseVotes, t.deadline, t.bondAmount);
    }
}
