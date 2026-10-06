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
///      amount (`TIER1_BOND`/`TIER2_BOND`, set once at deployment) — this is a deliberate
///      simplification of the "weight = min(bondStaked, cap)" idea from the
///      source design: with no on-chain staking token in the MVP (same
///      deferred-scope decision as base-layer quorum), fixed equal bonds
///      make the weight cap degenerate to one-member-one-vote by
///      construction, which already defeats a single large stake dominating
///      a committee, without inventing a variable-stake mechanism the rest
///      of the protocol doesn't have.
contract DisputeManager is IDisputeManager {
    /// @notice Bonds scale from one deploy-time unit in a FIXED 1 : 3 : 8 ratio
    ///         (dispute : Tier-1 vote : Tier-2 vote), so every deployment keeps
    ///         the same escalation economics — each tier costs more to sway than
    ///         the last. Mainnet default unit: 0.01 ETH (0.01 / 0.03 / 0.08).
    ///         A testnet can use a smaller unit so faucet-funded resolvers can
    ///         actually post committee bonds.
    uint256 public constant DEFAULT_BOND_UNIT = 0.01 ether;
    uint256 public constant TIER1_BOND_MULTIPLE = 3;
    uint256 public constant TIER2_BOND_MULTIPLE = 8;
    /// @dev Floor so a misconfigured deploy can't make disputes free.
    uint256 public constant MIN_BOND_UNIT = 1e12; // 0.000001 ETH

    uint256 public immutable DISPUTE_BOND;
    uint256 public immutable TIER1_BOND;
    uint256 public immutable TIER2_BOND;

    uint256 public constant TIER1_COMMITTEE_SIZE = 7;
    uint256 public constant TIER2_COMMITTEE_SIZE = 15;

    uint64 public constant TIER1_WINDOW = 1 hours;
    uint64 public constant TIER2_WINDOW = 2 hours;

    /// @notice Commit-reveal seeding windows, used only when the authorized
    ///         pool is larger than the tier's committee (otherwise the
    ///         committee is the whole pool and there is nothing to draw).
    uint64 public constant SEED_COMMIT_WINDOW = 10 minutes;
    uint64 public constant SEED_REVEAL_WINDOW = 10 minutes;

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
        uint64 deadline; // voting deadline; 0 until the committee is drawn
        uint256 trueVotes;
        uint256 falseVotes;
        mapping(address => VoteChoice) votes;
        // --- commit-reveal seeding (large pools only) ---
        bool seeding;
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint32 commits;
        uint32 reveals;
        bytes32 seedAcc; // XOR of revealed salts
        mapping(address => bytes32) commitments;
        mapping(address => bool) revealedSeed;
    }

    mapping(bytes32 => DisputeCase) private _cases;
    mapping(bytes32 => mapping(uint8 => Tier)) private _tiers;

    /// @notice ETH owed to each committee member / disputer / the treasury,
    ///         claimable via `withdraw`. Pull payments: a recipient whose
    ///         receive() reverts can only block its OWN withdrawal — with push
    ///         payments, a permissionless disputer contract that reverts on
    ///         receipt could make every resolution path revert and leave the
    ///         event (and every composite/market depending on it) stuck in
    ///         `Disputed` forever.
    mapping(address => uint256) public pendingWithdrawals;

    event PaymentCredited(address indexed to, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    /// @param bondUnit_ DISPUTE_BOND; Tier-1/Tier-2 vote bonds are 3x / 8x it.
    constructor(address registry_, address treasury_, uint256 bondUnit_) {
        require(bondUnit_ >= MIN_BOND_UNIT, "DisputeManager: bond unit too small");
        registry = IEventRegistry(registry_);
        treasury = treasury_;
        DISPUTE_BOND = bondUnit_;
        TIER1_BOND = bondUnit_ * TIER1_BOND_MULTIPLE;
        TIER2_BOND = bondUnit_ * TIER2_BOND_MULTIPLE;
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
        require(t1.deadline != 0, "DisputeManager: committee not drawn yet");
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
        require(t2.deadline != 0, "DisputeManager: committee not drawn yet");
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
            _credit(c.disputer, c.disputerBond);
        }
    }

    // --- Commit-reveal committee seeding (large pools only) ---

    /// @dev Commitment = keccak256(abi.encode(eventId, tier, resolver, salt)).
    ///      Binding the resolver's address stops anyone copying another's
    ///      commitment and replaying its reveal.
    function commitSeed(bytes32 eventId, bytes32 commitment) external {
        Tier storage t = _activeSeedingTier(eventId);
        require(block.timestamp < t.commitDeadline, "DisputeManager: commit window closed");
        require(registry.isAuthorizedResolver(msg.sender), "DisputeManager: not an authorized resolver");
        require(t.commitments[msg.sender] == bytes32(0), "DisputeManager: already committed");
        require(commitment != bytes32(0), "DisputeManager: empty commitment");
        t.commitments[msg.sender] = commitment;
        t.commits++;
        emit SeedCommitted(eventId, _cases[eventId].tier, msg.sender);
    }

    function revealSeed(bytes32 eventId, bytes32 salt) external {
        Tier storage t = _activeSeedingTier(eventId);
        uint8 tierNum = _cases[eventId].tier;
        require(block.timestamp >= t.commitDeadline, "DisputeManager: commit window still open");
        require(block.timestamp < t.revealDeadline, "DisputeManager: reveal window closed");
        require(!t.revealedSeed[msg.sender], "DisputeManager: already revealed");
        require(
            t.commitments[msg.sender] != bytes32(0)
                && t.commitments[msg.sender] == keccak256(abi.encode(eventId, tierNum, msg.sender, salt)),
            "DisputeManager: reveal does not match commitment"
        );
        t.revealedSeed[msg.sender] = true;
        t.reveals++;
        t.seedAcc ^= salt; // order-independent: no advantage to revealing last
        emit SeedRevealed(eventId, tierNum, msg.sender);
    }

    /// @notice Draws once the reveal window ends — or as soon as the commit
    ///         window has ended and every committer has revealed.
    function drawCommittee(bytes32 eventId) external {
        Tier storage t = _activeSeedingTier(eventId);
        uint8 tierNum = _cases[eventId].tier;
        bool everyoneRevealed = t.commits > 0 && t.reveals == t.commits && block.timestamp >= t.commitDeadline;
        require(block.timestamp >= t.revealDeadline || everyoneRevealed, "DisputeManager: seeding still in progress");

        // Committers that withheld their reveal are excluded from the draw, so
        // withholding can only remove yourself — never steer who is chosen.
        address[] memory pool = registry.getAuthorizedResolvers();
        address[] memory candidates = new address[](pool.length);
        uint256 n = 0;
        for (uint256 i = 0; i < pool.length; i++) {
            address r = pool[i];
            if (t.commitments[r] != bytes32(0) && !t.revealedSeed[r]) continue;
            candidates[n++] = r;
        }
        assembly {
            mstore(candidates, n)
        }

        // With no reveals at all, fall back to block data so a dispute can't
        // stall forever (weaker, but liveness beats a stuck event).
        bytes32 seed = t.reveals > 0
            ? keccak256(abi.encode(eventId, tierNum, t.seedAcc, t.reveals))
            : keccak256(abi.encode(eventId, tierNum, blockhash(block.number - 1), block.timestamp));

        t.seeding = false;
        t.committee = _draw(candidates, seed, tierNum == 1 ? TIER1_COMMITTEE_SIZE : TIER2_COMMITTEE_SIZE);
        t.deadline = uint64(block.timestamp) + (tierNum == 1 ? TIER1_WINDOW : TIER2_WINDOW);
        emit TierOpened(eventId, tierNum, t.committee, t.deadline);
    }

    function _activeSeedingTier(bytes32 eventId) private view returns (Tier storage t) {
        DisputeCase storage c = _cases[eventId];
        require(c.exists && !c.resolved, "DisputeManager: no open dispute");
        t = _tiers[eventId][c.tier];
        require(t.seeding, "DisputeManager: committee not seeding");
    }

    /// @notice Withdraws everything owed to the caller.
    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "DisputeManager: nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool sent,) = msg.sender.call{ value: amount }("");
        require(sent, "DisputeManager: transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    // --- Internal: tier lifecycle ---

    function _openTier(bytes32 eventId, uint8 tierNum) private {
        Tier storage t = _tiers[eventId][tierNum];
        uint256 size = tierNum == 1 ? TIER1_COMMITTEE_SIZE : TIER2_COMMITTEE_SIZE;
        t.bondAmount = tierNum == 1 ? TIER1_BOND : TIER2_BOND;
        address[] memory pool = registry.getAuthorizedResolvers();

        if (pool.length <= size) {
            // Everyone is on the committee — nothing to draw, nothing to steer.
            t.committee = pool;
            t.deadline = uint64(block.timestamp) + (tierNum == 1 ? TIER1_WINDOW : TIER2_WINDOW);
            emit TierOpened(eventId, tierNum, t.committee, t.deadline);
            return;
        }

        // Larger pool: draw from commit-reveal salts, not from block data the
        // sequencer can predict or order around (prevrandao is 1 on Arbitrum).
        t.seeding = true;
        t.commitDeadline = uint64(block.timestamp) + SEED_COMMIT_WINDOW;
        t.revealDeadline = t.commitDeadline + SEED_REVEAL_WINDOW;
        emit SeedingStarted(eventId, tierNum, t.commitDeadline, t.revealDeadline);
    }

    function _submitTierVote(bytes32 eventId, uint8 tierNum, bool outcome) private {
        DisputeCase storage c = _cases[eventId];
        require(c.exists && !c.resolved && c.tier == tierNum, "DisputeManager: not in this tier");

        Tier storage t = _tiers[eventId][tierNum];
        require(t.deadline != 0, "DisputeManager: committee not drawn yet");
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
                _credit(member, t.bondAmount + m.perWinner);
            }
        }
        if (m.burnShare > 0) _send(BURN_ADDRESS, m.burnShare);
        if (m.treasuryDust > 0) _credit(treasury, m.treasuryDust);
    }

    /// @dev Disputer challenged a proposal the committee upheld: their bond
    ///      is forfeited using the same burn/treasury split, but is not
    ///      further distributed to the committee (that would require a
    ///      second per-member loop) — a documented simplification.
    function _settleDisputerBond(bool disputerWasRight, address disputer, uint256 disputerBond)
        private
    {
        if (disputerWasRight) {
            _credit(disputer, disputerBond);
        } else {
            uint256 dBurn = disputerBond / 3;
            uint256 dTreasury = disputerBond - dBurn;
            if (dBurn > 0) _send(BURN_ADDRESS, dBurn);
            if (dTreasury > 0) _credit(treasury, dTreasury);
        }
    }

    function _refundTierBonds(Tier storage t) private {
        for (uint256 i = 0; i < t.committee.length; i++) {
            address member = t.committee[i];
            if (t.votes[member] != VoteChoice.NotVoted) {
                _credit(member, t.bondAmount);
            }
        }
    }

    function _hasConverged(Tier storage t) private view returns (bool) {
        uint256 size = t.committee.length;
        return
            t.trueVotes * 100 >= size * AGREEMENT_BPS || t.falseVotes * 100 >= size * AGREEMENT_BPS;
    }

    // --- Internal: committee selection ---

    /// @dev Partial Fisher-Yates over `candidates` with `seed`; returns the
    ///      whole list when it already fits.
    function _draw(address[] memory candidates, bytes32 seed, uint256 size)
        private
        pure
        returns (address[] memory)
    {
        if (candidates.length <= size) return candidates;
        uint256 remaining = candidates.length;
        for (uint256 i = 0; i < size; i++) {
            uint256 j = i + (uint256(keccak256(abi.encode(seed, i))) % remaining);
            (candidates[i], candidates[j]) = (candidates[j], candidates[i]);
            remaining--;
        }
        address[] memory committee = new address[](size);
        for (uint256 i = 0; i < size; i++) {
            committee[i] = candidates[i];
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

    function _credit(address to, uint256 amount) private {
        pendingWithdrawals[to] += amount;
        emit PaymentCredited(to, amount);
    }

    /// @dev Only used for the burn share: BURN_ADDRESS has no code, so this
    ///      can never revert and never needs the pull path.
    function _send(address to, uint256 amount) private {
        (bool sent,) = to.call{ value: amount }("");
        require(sent, "DisputeManager: transfer failed");
    }

    // --- Views ---

    function getCommittee(bytes32 eventId, uint8 tier) external view returns (address[] memory) {
        return _tiers[eventId][tier].committee;
    }

    function getVote(bytes32 eventId, uint8 tier, address member)
        external
        view
        returns (VoteChoice)
    {
        return _tiers[eventId][tier].votes[member];
    }

    function getCaseSummary(bytes32 eventId)
        external
        view
        returns (bool exists, bool resolved, uint8 tier, bool hasOriginalProposal)
    {
        DisputeCase storage c = _cases[eventId];
        return (c.exists, c.resolved, c.tier, c.hasOriginalProposal);
    }

    function getSeedState(bytes32 eventId, uint8 tier)
        external
        view
        returns (bool seeding, uint64 commitDeadline, uint64 revealDeadline, uint32 commits, uint32 reveals, bool drawn)
    {
        Tier storage t = _tiers[eventId][tier];
        return (t.seeding, t.commitDeadline, t.revealDeadline, t.commits, t.reveals, t.deadline != 0);
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
