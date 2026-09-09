// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEventRegistry} from "./interfaces/IEventRegistry.sol";

/// @title EventRegistry
/// @notice Canonical registry of event definitions and lifecycle state:
///         CREATE -> OPEN -> OBSERVATIONS SUBMITTED -> PROPOSED OUTCOME
///         -> DISPUTE WINDOW -> FINALIZED (or VOIDED).
/// @dev Consumers must never call this contract directly — always go through
///      EventBus. See IEventRegistry for the finalized MVP protocol decisions
///      (quorum model, dispute arbitration, outcome payload schema).
contract EventRegistry is IEventRegistry {
    uint256 public constant DISPUTE_BOND = 0.01 ether;

    struct Proposal {
        bytes32 outcomeHash;
        bytes outcomeData;
        uint64 proposedAt;
    }

    struct Dispute {
        address disputer;
        uint256 bond;
        bool resolved;
    }

    address public immutable owner;

    mapping(bytes32 => EventSpec) private _specs;
    mapping(bytes32 => EventStatus) private _status;
    mapping(bytes32 => Outcome) private _outcomes;
    mapping(bytes32 => Proposal) private _proposals;
    mapping(bytes32 => Dispute) private _disputes;

    mapping(bytes32 => mapping(address => bool)) private _hasSubmitted;
    mapping(bytes32 => mapping(bytes32 => uint256)) private _observationCount;
    mapping(address => bool) private _authorizedResolvers;

    uint256 private _nonce;

    modifier onlyOwner() {
        require(msg.sender == owner, "EventRegistry: not owner");
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
            _proposals[eventId] =
                Proposal({outcomeHash: outcomeHash, outcomeData: outcomeData, proposedAt: uint64(block.timestamp)});

            EventStatus previous = _status[eventId];
            _status[eventId] = EventStatus.ProposedOutcome;
            emit EventStatusChanged(eventId, previous, EventStatus.ProposedOutcome);
            emit OutcomeProposed(eventId, outcomeHash, msg.sender);
        }
    }

    // --- Dispute ---

    function dispute(bytes32 eventId) external payable {
        require(_status[eventId] == EventStatus.ProposedOutcome, "EventRegistry: not disputable");
        require(_disputes[eventId].disputer == address(0), "EventRegistry: already disputed");

        Proposal storage p = _proposals[eventId];
        require(
            block.timestamp < p.proposedAt + _specs[eventId].disputeWindowSeconds,
            "EventRegistry: dispute window closed"
        );
        require(msg.value == DISPUTE_BOND, "EventRegistry: incorrect bond");

        _disputes[eventId] = Dispute({disputer: msg.sender, bond: msg.value, resolved: false});

        EventStatus previous = _status[eventId];
        _status[eventId] = EventStatus.DisputeWindow;
        emit EventStatusChanged(eventId, previous, EventStatus.DisputeWindow);
        emit EventDisputed(eventId, msg.sender);
    }

    /// @dev MVP arbitration: the Registry owner decides. See IEventRegistry
    ///      docs and docs/threat-model.md for why full decentralized dispute
    ///      resolution is out of scope for this milestone.
    function resolveDispute(bytes32 eventId, bool upholdProposal) external onlyOwner {
        require(_status[eventId] == EventStatus.DisputeWindow, "EventRegistry: no active dispute");
        Dispute storage d = _disputes[eventId];
        require(!d.resolved, "EventRegistry: dispute already resolved");
        d.resolved = true;

        emit DisputeResolved(eventId, upholdProposal);

        if (upholdProposal) {
            Proposal storage p = _proposals[eventId];
            _finalize(eventId, p.outcomeHash, p.outcomeData);
            (bool sent,) = owner.call{value: d.bond}("");
            require(sent, "EventRegistry: bond forfeiture transfer failed");
        } else {
            EventStatus previous = _status[eventId];
            _status[eventId] = EventStatus.Voided;
            emit EventStatusChanged(eventId, previous, EventStatus.Voided);
            (bool sent,) = d.disputer.call{value: d.bond}("");
            require(sent, "EventRegistry: bond refund failed");
        }
    }

    // --- Finalization ---

    function finalize(bytes32 eventId) external {
        require(_status[eventId] == EventStatus.ProposedOutcome, "EventRegistry: nothing to finalize");
        Proposal storage p = _proposals[eventId];
        require(
            block.timestamp >= p.proposedAt + _specs[eventId].disputeWindowSeconds,
            "EventRegistry: dispute window still open"
        );
        require(_disputes[eventId].disputer == address(0), "EventRegistry: disputed, awaiting arbitration");

        _finalize(eventId, p.outcomeHash, p.outcomeData);
    }

    function _finalize(bytes32 eventId, bytes32 outcomeHash, bytes memory outcomeData) private {
        _outcomes[eventId] =
            Outcome({exists: true, outcomeHash: outcomeHash, outcomeData: outcomeData, finalizedAt: uint64(block.timestamp)});

        EventStatus previous = _status[eventId];
        _status[eventId] = EventStatus.Finalized;
        emit EventStatusChanged(eventId, previous, EventStatus.Finalized);
        emit EventFinalized(eventId, outcomeHash);
    }

    // --- Resolver authorization ---

    function setResolverAuthorization(address resolver, bool authorized) external onlyOwner {
        _authorizedResolvers[resolver] = authorized;
        emit ResolverAuthorizationChanged(resolver, authorized);
    }

    function isAuthorizedResolver(address resolver) external view returns (bool) {
        return _authorizedResolvers[resolver];
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
}
