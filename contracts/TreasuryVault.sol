// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ITreasuryVault } from "./interfaces/ITreasuryVault.sol";
import { IEventRegistry } from "./interfaces/IEventRegistry.sol";
import { IEventComposer } from "./interfaces/IEventComposer.sol";
import { IDisputeManager } from "./interfaces/IDisputeManager.sol";

interface IVaultToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title TreasuryVault
/// @notice The value layer behind Novak's dispute layer. Two inflows:
///
///   1. Market fees (USDG), pushed by consumer markets via `depositFees`,
///      tagged with the event IDs they settled on. Once an event is decided,
///      `allocate` splits its fees into thirds:
///        - 1/3 resolver pool  — split equally among resolvers whose observed
///          outcome equals the final outcome (Registry.observedOutcome);
///        - 1/3 committee pool — split equally among the deciding tier's
///          committee members who voted the final outcome; if the event was
///          never disputed this third goes to the INSURANCE RESERVE, which
///          then tops up the committee pool of the next disputed events
///          (by up to one extra third each), so honest committee work is paid
///          even when market volume on a disputed event is thin;
///        - 1/3 treasury.
///      Voided/expired events, or a third nobody qualifies for, go to the
///      treasury. Claims are pull-based (`claimResolverReward`,
///      `claimCommitteeReward`).
///
///   2. Dispute bonds (ETH). The vault is the DisputeManager's `treasury`, so
///      the treasury third of every forfeited bond (the other thirds are
///      burned / paid to winning voters inside DisputeManager) is credited to
///      the vault; `sweepDisputeProceeds` pulls it in.
///
/// @dev Protocol infrastructure, not a consumer: it reads the Registry,
///      Composer and DisputeManager to decide who is paid. Consumers only push
///      fees into ITreasuryVault and still read outcomes only via the Bus.
contract TreasuryVault is ITreasuryVault {
    struct EventRewards {
        bool decided; // outcome + winner counts snapshotted
        bool outcome;
        uint8 committeeTier;
        uint256 resolverWinners;
        uint256 committeeWinners;
        uint256 resolverPool; // cumulative
        uint256 committeePool; // cumulative
    }

    uint256 public constant MAX_EVENTS_PER_DEPOSIT = 16;

    IVaultToken public immutable collateral;
    IEventRegistry public immutable registry;
    IEventComposer public immutable composer;
    IDisputeManager public disputeManager;
    address public owner;

    mapping(bytes32 => uint256) public pendingFees;
    mapping(bytes32 => EventRewards) private _rewards;
    mapping(bytes32 => mapping(address => uint256)) public resolverClaimed;
    mapping(bytes32 => mapping(address => uint256)) public committeeClaimed;

    uint256 public treasuryBalance;
    uint256 public insuranceReserve;

    event DisputeManagerSet(address indexed disputeManager);
    event OwnershipTransferred(address indexed from, address indexed to);
    event FeesDeposited(address indexed from, bytes32 indexed eventId, uint256 amount);
    event FeesToTreasury(uint256 amount);
    event FeesAllocated(
        bytes32 indexed eventId,
        uint256 resolverShare,
        uint256 committeeShare,
        uint256 insuranceShare,
        uint256 treasuryShare
    );
    event ResolverRewardClaimed(bytes32 indexed eventId, address indexed resolver, uint256 amount);
    event CommitteeRewardClaimed(bytes32 indexed eventId, address indexed member, uint256 amount);
    event DisputeProceedsSwept(uint256 amountWei);
    event TreasuryWithdrawn(address indexed to, uint256 amount);
    event InsuranceWithdrawn(address indexed to, uint256 amount);
    event EthWithdrawn(address indexed to, uint256 amountWei);

    modifier onlyOwner() {
        require(msg.sender == owner, "TreasuryVault: not owner");
        _;
    }

    constructor(address collateral_, address registry_, address composer_, address owner_) {
        require(owner_ != address(0), "TreasuryVault: zero owner");
        collateral = IVaultToken(collateral_);
        registry = IEventRegistry(registry_);
        composer = IEventComposer(composer_);
        owner = owner_;
    }

    /// @notice One-time wiring (DisputeManager takes the vault as its
    ///         immutable treasury, so it's deployed after the vault).
    function setDisputeManager(address disputeManager_) external onlyOwner {
        require(address(disputeManager) == address(0), "TreasuryVault: dispute manager set");
        require(disputeManager_ != address(0), "TreasuryVault: zero address");
        disputeManager = IDisputeManager(disputeManager_);
        emit DisputeManagerSet(disputeManager_);
    }

    // --- Inflow 1: market fees ---

    function depositFees(bytes32[] calldata eventIds, uint256 amount) external {
        uint256 n = eventIds.length;
        require(n > 0 && n <= MAX_EVENTS_PER_DEPOSIT, "TreasuryVault: bad event count");
        require(amount > 0, "TreasuryVault: zero amount");
        _pull(msg.sender, amount);

        uint256 perId = amount / n;
        uint256 toTreasury = amount - perId * n;
        for (uint256 i = 0; i < n; i++) {
            toTreasury += _attribute(eventIds[i], perId);
        }
        if (toTreasury > 0) {
            treasuryBalance += toTreasury;
            emit FeesToTreasury(toTreasury);
        }
    }

    /// @dev Primitive -> its pending fees. Composite -> split across its
    ///      operands, primitive operands only (deeper nesting and unknown IDs
    ///      go to the treasury). Returns the treasury remainder.
    function _attribute(bytes32 id, uint256 amount) private returns (uint256 toTreasury) {
        if (amount == 0) return 0;
        if (registry.getEvent(id) != IEventRegistry.EventStatus.None) {
            pendingFees[id] += amount;
            emit FeesDeposited(msg.sender, id, amount);
            return 0;
        }
        bytes32[] memory operands = composer.getCompositeSpec(id).operands;
        if (operands.length == 0) return amount;
        uint256 perOp = amount / operands.length;
        toTreasury = amount - perOp * operands.length;
        for (uint256 j = 0; j < operands.length; j++) {
            if (registry.getEvent(operands[j]) != IEventRegistry.EventStatus.None) {
                pendingFees[operands[j]] += perOp;
                emit FeesDeposited(msg.sender, operands[j], perOp);
            } else {
                toTreasury += perOp;
            }
        }
    }

    /// @notice Splits `eventId`'s pending fees into thirds once the event is
    ///         decided. Permissionless; also run automatically by the claims.
    function allocate(bytes32 eventId) public {
        uint256 amount = pendingFees[eventId];
        if (amount == 0) return;
        IEventRegistry.EventStatus status = registry.getEvent(eventId);
        require(
            status == IEventRegistry.EventStatus.Finalized
                || status == IEventRegistry.EventStatus.Voided
                || status == IEventRegistry.EventStatus.Expired,
            "TreasuryVault: event not decided"
        );
        pendingFees[eventId] = 0;

        if (status != IEventRegistry.EventStatus.Finalized) {
            treasuryBalance += amount;
            emit FeesAllocated(eventId, 0, 0, 0, amount);
            return;
        }

        EventRewards storage r = _rewards[eventId];
        if (!r.decided) _snapshot(eventId, r);

        uint256 third = amount / 3;
        uint256 treasuryShare = amount - 2 * third; // its third + dust
        uint256 resolverShare;
        uint256 committeeShare;
        uint256 insuranceShare;

        if (r.resolverWinners > 0) resolverShare = third;
        else treasuryShare += third;

        if (r.committeeWinners > 0) {
            uint256 bonus = insuranceReserve < third ? insuranceReserve : third;
            insuranceReserve -= bonus;
            committeeShare = third + bonus;
        } else {
            insuranceShare = third;
            insuranceReserve += third;
        }

        r.resolverPool += resolverShare;
        r.committeePool += committeeShare;
        treasuryBalance += treasuryShare;
        emit FeesAllocated(eventId, resolverShare, committeeShare, insuranceShare, treasuryShare);
    }

    function _snapshot(bytes32 eventId, EventRewards storage r) private {
        r.decided = true;
        r.outcome = abi.decode(registry.getOutcome(eventId).outcomeData, (bool));
        r.resolverWinners = registry.observedOutcomeCount(eventId, r.outcome);
        if (address(disputeManager) == address(0)) return;
        (bool exists, bool resolved, uint8 tier,) = disputeManager.getCaseSummary(eventId);
        if (exists && resolved) {
            (uint256 trueVotes, uint256 falseVotes,,) = disputeManager.getTierTally(eventId, tier);
            r.committeeTier = tier;
            r.committeeWinners = r.outcome ? trueVotes : falseVotes;
        }
    }

    // --- Claims (pull) ---

    function claimResolverReward(bytes32 eventId) external returns (uint256 amount) {
        allocate(eventId);
        amount = claimableResolverReward(eventId, msg.sender);
        require(amount > 0, "TreasuryVault: nothing to claim");
        resolverClaimed[eventId][msg.sender] += amount;
        _push(msg.sender, amount);
        emit ResolverRewardClaimed(eventId, msg.sender, amount);
    }

    function claimCommitteeReward(bytes32 eventId) external returns (uint256 amount) {
        allocate(eventId);
        amount = claimableCommitteeReward(eventId, msg.sender);
        require(amount > 0, "TreasuryVault: nothing to claim");
        committeeClaimed[eventId][msg.sender] += amount;
        _push(msg.sender, amount);
        emit CommitteeRewardClaimed(eventId, msg.sender, amount);
    }

    function claimableResolverReward(bytes32 eventId, address resolver)
        public
        view
        returns (uint256)
    {
        EventRewards storage r = _rewards[eventId];
        if (!r.decided || r.resolverWinners == 0) return 0;
        (bool submitted, bool observed) = registry.observedOutcome(eventId, resolver);
        if (!submitted || observed != r.outcome) return 0;
        return r.resolverPool / r.resolverWinners - resolverClaimed[eventId][resolver];
    }

    function claimableCommitteeReward(bytes32 eventId, address member)
        public
        view
        returns (uint256)
    {
        EventRewards storage r = _rewards[eventId];
        if (!r.decided || r.committeeWinners == 0) return 0;
        IDisputeManager.VoteChoice v = disputeManager.getVote(eventId, r.committeeTier, member);
        IDisputeManager.VoteChoice winning = r.outcome
            ? IDisputeManager.VoteChoice.VotedTrue
            : IDisputeManager.VoteChoice.VotedFalse;
        if (v != winning) return 0;
        return r.committeePool / r.committeeWinners - committeeClaimed[eventId][member];
    }

    function getRewards(bytes32 eventId) external view returns (EventRewards memory) {
        return _rewards[eventId];
    }

    // --- Inflow 2: dispute-bond treasury third (ETH) ---

    /// @notice Pulls the ETH the DisputeManager credited to this vault.
    function sweepDisputeProceeds() external {
        uint256 before = address(this).balance;
        disputeManager.withdraw();
        emit DisputeProceedsSwept(address(this).balance - before);
    }

    receive() external payable { }

    // --- Owner (team multisig later) ---

    function withdrawTreasury(address to, uint256 amount) external onlyOwner {
        require(amount <= treasuryBalance, "TreasuryVault: exceeds treasury");
        treasuryBalance -= amount;
        _push(to, amount);
        emit TreasuryWithdrawn(to, amount);
    }

    function withdrawInsurance(address to, uint256 amount) external onlyOwner {
        require(amount <= insuranceReserve, "TreasuryVault: exceeds insurance");
        insuranceReserve -= amount;
        _push(to, amount);
        emit InsuranceWithdrawn(to, amount);
    }

    function withdrawEth(address to, uint256 amountWei) external onlyOwner {
        (bool sent,) = to.call{ value: amountWei }("");
        require(sent, "TreasuryVault: eth transfer failed");
        emit EthWithdrawn(to, amountWei);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "TreasuryVault: zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // --- Token plumbing ---

    function _pull(address from, uint256 amount) private {
        (bool ok, bytes memory data) = address(collateral)
            .call(abi.encodeCall(IVaultToken.transferFrom, (from, address(this), amount)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "TreasuryVault: pull failed");
    }

    function _push(address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            address(collateral).call(abi.encodeCall(IVaultToken.transfer, (to, amount)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "TreasuryVault: push failed");
    }
}
