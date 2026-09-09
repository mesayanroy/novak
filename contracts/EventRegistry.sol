// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IEventRegistry } from "./interfaces/IEventRegistry.sol";

/// @title EventRegistry
/// @notice Canonical registry of event definitions and lifecycle state:
///         CREATE -> OPEN -> OBSERVATIONS SUBMITTED -> PROPOSED OUTCOME
///         -> DISPUTED -> FINALIZED (or VOIDED / EXPIRED).
/// @dev Consumers must never call this contract directly — always go through
///      EventBus. This contract deliberately knows nothing about committees,
///      tiers, or bonding economics — all of that lives in the configured
///      `IDisputeManager`, which is the only address allowed to drive the
///      `Disputed -> Finalized|Voided` transitions (`onlyDisputeManager`).
///      See IEventRegistry for the finalized MVP protocol decisions.
contract EventRegistry is IEventRegistry {
    struct Proposal {
        bytes32 outcomeHash;
        bytes outcomeData;
        uint64 proposedAt;
    }

    address public immutable owner;
    address public disputeManager;

    mapping(bytes32 => EventSpec) private _specs;
    mapping(bytes32 => EventStatus) private _status;
    mapping(bytes32 => Outcome) private _outcomes;
    mapping(bytes32 => Proposal) private _proposals;

    mapping(bytes32 => mapping(address => bool)) private _hasSubmitted;
    mapping(bytes32 => mapping(bytes32 => uint256)) private _observationCount;
    mapping(address => bool) private _authorizedResolvers;

    address[] private _authorizedResolverList;
    mapping(address => uint256) private _resolverListIndex; // 1-based; 0 = absent

    uint256 private _nonce;

    modifier onlyOwner() {
        require(msg.sender == owner, "EventRegistry: not owner");
        _;
    }

    modifier onlyDisputeManager() {
        require(msg.sender == disputeManager, "EventRegistry: not dispute manager");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // --- Event creation ---

    function createEvent(EventSpec calldata eventSpec) external returns (bytes32 eventId) {
        require(eventSpec.quorumThreshold > 0, "EventRegistry: quorumThreshold must be > 0");
        require(
            eventSpec.observationDeadline > eventSpec.openTimestamp,
            "EventRegistry: bad observation window"
        );

        eventId = keccak256(
            abi.encode(eventSpec.sourceId, eventSpec.specVersion, eventSpec.spec, _nonce++)
        );

        require(_status[eventId] == EventStatus.None, "EventRegistry: exists");

        _specs[eventId] = eventSpec;
        _status[eventId] = EventStatus.Open;

        emit EventCreated(eventId, eventSpec.sourceId, eventSpec.specVersion);
        emit EventStatusChanged(eventId, EventStatus.None, EventStatus.Open);
    }

    // --- Resolver submission / quorum ---

    function submitObservation(bytes32 eventId, bytes calldata outcomeData, bytes32 evidenceHash)
        external
    {
        require(_authorizedResolvers[msg.sender], "EventRegistry: not an authorized resolver");

        EventStatus status = _status[eventId];
        require(
            status == EventStatus.Open || status == EventStatus.ObservationsSubmitted,
            "EventRegistry: not accepting observations"
        );
        require(
            block.timestamp <= _specs[eventId].observationDeadline,
            "EventRegistry: observation deadline passed"
        );
        require(!_hasSubmitted[eventId][msg.sender], "EventRegistry: already submitted");

        _hasSubmitted[eventId][msg.sender] = true;
        bytes32 outcomeHash = keccak256(outcomeData);
        uint256 count = ++_observationCount[eventId][outcomeHash];

        emit ObservationSubmitted(eventId, msg.sender, outcomeHash, evidenceHash);

        if (status == EventStatus.Open) {
            _status[eventId] = EventStatus.ObservationsSubmitted;
            emit EventStatusChanged(eventId, EventStatus.Open, EventStatus.ObservationsSubmitted);
        }

        if (count >= _specs[eventId].quorumThreshold && _proposals[eventId].proposedAt == 0) {
            _proposals[eventId] = Proposal({
                outcomeHash: outcomeHash,
                outcomeData: outcomeData,
                proposedAt: uint64(block.timestamp)
            });

            EventStatus previous = _status[eventId];
            _status[eventId] = EventStatus.ProposedOutcome;
            emit EventStatusChanged(eventId, previous, EventStatus.ProposedOutcome);
            emit OutcomeProposed(eventId, outcomeHash, msg.sender);
        }
    }

    // --- Finalization (undisputed path) ---

    function finalize(bytes32 eventId) external {
        require(
            _status[eventId] == EventStatus.ProposedOutcome, "EventRegistry: nothing to finalize"
        );
        Proposal storage p = _proposals[eventId];
        require(
            block.timestamp >= p.proposedAt + _specs[eventId].disputeWindowSeconds,
            "EventRegistry: dispute window still open"
        );

        _finalize(eventId, p.outcomeHash, p.outcomeData);
    }

    function _finalize(bytes32 eventId, bytes32 outcomeHash, bytes memory outcomeData) private {
        _outcomes[eventId] = Outcome({
            exists: true,
            outcomeHash: outcomeHash,
            outcomeData: outcomeData,
            finalizedAt: uint64(block.timestamp)
        });

        EventStatus previous = _status[eventId];
        _status[eventId] = EventStatus.Finalized;
        emit EventStatusChanged(eventId, previous, EventStatus.Finalized);
        emit EventFinalized(eventId, outcomeHash);
    }

    // --- Terminal non-outcomes ---

    function expire(bytes32 eventId) external {
        require(_status[eventId] == EventStatus.Open, "EventRegistry: not expirable");
        require(
            block.timestamp > _specs[eventId].observationDeadline,
            "EventRegistry: observation window still open"
        );

        EventStatus previous = _status[eventId];
        _status[eventId] = EventStatus.Expired;
        emit EventStatusChanged(eventId, previous, EventStatus.Expired);
    }

    function escalateNonConvergence(bytes32 eventId) external onlyDisputeManager {
        // Kept as a thin, registry-owned status guard: the DisputeManager is
        // the one deciding *when* to call this (see IDisputeManager), but the
        // Registry still enforces its own precondition rather than trusting
        // the caller blindly. Delegates the actual transition to the same
        // path a filed dispute uses.
        require(
            _status[eventId] == EventStatus.ObservationsSubmitted, "EventRegistry: not ambiguous"
        );
        require(
            block.timestamp > _specs[eventId].observationDeadline,
            "EventRegistry: observation window still open"
        );
        _setDisputed(eventId);
    }

    // --- DisputeManager-only state transitions ---

    function escalateToDispute(bytes32 eventId) external onlyDisputeManager {
        EventStatus status = _status[eventId];
        require(
            status == EventStatus.ProposedOutcome || status == EventStatus.ObservationsSubmitted,
            "EventRegistry: not escalatable"
        );
        _setDisputed(eventId);
    }

    function _setDisputed(bytes32 eventId) private {
        EventStatus previous = _status[eventId];
        _status[eventId] = EventStatus.Disputed;
        emit EventStatusChanged(eventId, previous, EventStatus.Disputed);
    }

    function finalizeFromDispute(bytes32 eventId, bytes calldata outcomeData)
        external
        onlyDisputeManager
    {
        require(_status[eventId] == EventStatus.Disputed, "EventRegistry: not disputed");
        _finalize(eventId, keccak256(outcomeData), outcomeData);
    }

    function voidEvent(bytes32 eventId) external onlyDisputeManager {
        require(_status[eventId] == EventStatus.Disputed, "EventRegistry: not disputed");
        EventStatus previous = _status[eventId];
        _status[eventId] = EventStatus.Voided;
        emit EventStatusChanged(eventId, previous, EventStatus.Voided);
    }

    // --- Resolver authorization ---

    function setResolverAuthorization(address resolver, bool authorized) external onlyOwner {
        bool currentlyAuthorized = _authorizedResolvers[resolver];
        _authorizedResolvers[resolver] = authorized;

        if (authorized && !currentlyAuthorized) {
            _authorizedResolverList.push(resolver);
            _resolverListIndex[resolver] = _authorizedResolverList.length;
        } else if (!authorized && currentlyAuthorized) {
            uint256 idx = _resolverListIndex[resolver]; // 1-based
            uint256 lastIdx = _authorizedResolverList.length;
            address lastAddr = _authorizedResolverList[lastIdx - 1];
            _authorizedResolverList[idx - 1] = lastAddr;
            _resolverListIndex[lastAddr] = idx;
            _authorizedResolverList.pop();
            delete _resolverListIndex[resolver];
        }

        emit ResolverAuthorizationChanged(resolver, authorized);
    }

    function setDisputeManager(address disputeManager_) external onlyOwner {
        require(disputeManager == address(0), "EventRegistry: dispute manager already set");
        require(disputeManager_ != address(0), "EventRegistry: zero address");
        disputeManager = disputeManager_;
        emit DisputeManagerSet(disputeManager_);
    }

    function isAuthorizedResolver(address resolver) external view returns (bool) {
        return _authorizedResolvers[resolver];
    }

    function getAuthorizedResolvers() external view returns (address[] memory) {
        return _authorizedResolverList;
    }

    // --- Views ---

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

    function getProposal(bytes32 eventId)
        external
        view
        returns (bytes32 outcomeHash, bytes memory outcomeData, uint64 proposedAt)
    {
        Proposal storage p = _proposals[eventId];
        return (p.outcomeHash, p.outcomeData, p.proposedAt);
    }
}
