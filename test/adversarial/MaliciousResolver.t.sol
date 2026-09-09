// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventRegistry} from "../../contracts/EventRegistry.sol";
import {DisputeManager} from "../../contracts/DisputeManager.sol";
import {IEventRegistry} from "../../contracts/interfaces/IEventRegistry.sol";

/// @notice Adversarial scenarios against the resolver <-> Registry submission
///         and dispute flow. See docs/threat-model.md for the full adversary
///         list this suite tracks; items not yet covered here (colluding
///         resolver majority beating committee bonds economically at scale,
///         dispute spam pricing beyond the flat MVP bonds) require real
///         staking economics that are explicitly out of MVP scope (see
///         docs/protocol-spec.md).
contract MaliciousResolverTest is Test {
    EventRegistry internal registry;
    DisputeManager internal disputeManager;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);
    address internal resolverC = address(0xC0FFEE);
    address internal attacker = address(0xBAD);
    address internal treasury = address(0x7EA5);

    function setUp() public {
        registry = new EventRegistry();
        disputeManager = new DisputeManager(address(registry), treasury);
        registry.setDisputeManager(address(disputeManager));

        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        registry.setResolverAuthorization(resolverC, true);
    }

    function _createEvent(uint8 quorumThreshold) internal returns (bytes32 eventId) {
        eventId = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.price-feed"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: quorumThreshold,
                spec: abi.encode("adversarial-placeholder")
            })
        );
    }

    /// @dev A single malicious resolver cannot finalize a false outcome alone —
    ///      quorum requires `quorumThreshold` independent agreeing submissions.
    function test_singleMaliciousResolver_cannotReachQuorumAlone() public {
        bytes32 eventId = _createEvent(2);

        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("malicious"));

        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.ObservationsSubmitted));
        assertFalse(registry.isFinalized(eventId));
    }

    /// @dev Conflicting observations: two resolvers disagree. Neither outcome
    ///      reaches quorum with threshold 2 from three resolvers split 1/1/1,
    ///      or split 2/1 lets the majority-agreeing outcome propose — but the
    ///      minority submission never overrides it.
    function test_conflictingResolvers_majorityOutcomeProposedMinorityIgnored() public {
        bytes32 eventId = _createEvent(2);

        // C disagrees first — a lone dissent doesn't block later agreement,
        // and once A+B agree, quorum locks in "true" regardless of C's vote.
        vm.prank(resolverC);
        registry.submitObservation(eventId, abi.encode(false), keccak256("ev-c"));
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-b"));

        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.ProposedOutcome));

        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(eventId);

        IEventRegistry.Outcome memory outcome = registry.getOutcome(eventId);
        assertTrue(abi.decode(outcome.outcomeData, (bool)));
    }

    /// @dev Unavailable/unauthorized source: an unauthorized address (e.g. a
    ///      deauthorized or never-authorized resolver) cannot submit at all.
    function test_unauthorizedResolver_cannotSubmit() public {
        bytes32 eventId = _createEvent(2);

        vm.prank(attacker);
        vm.expectRevert(bytes("EventRegistry: not an authorized resolver"));
        registry.submitObservation(eventId, abi.encode(true), keccak256("attack"));
    }

    /// @dev Duplicate submission: a resolver cannot vote twice to manufacture
    ///      artificial quorum.
    function test_duplicateSubmission_cannotInflateQuorum() public {
        bytes32 eventId = _createEvent(2);

        vm.startPrank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-a"));
        vm.expectRevert(bytes("EventRegistry: already submitted"));
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-a-replay"));
        vm.stopPrank();

        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.ObservationsSubmitted));
    }

    /// @dev Stale/late evidence: a resolver submitting after the observation
    ///      deadline is rejected outright, even if otherwise authorized and
    ///      even if quorum was never reached.
    function test_lateSubmission_afterDeadline_rejected() public {
        bytes32 eventId = _createEvent(2);
        vm.warp(block.timestamp + 2 days);

        vm.prank(resolverA);
        vm.expectRevert(bytes("EventRegistry: observation deadline passed"));
        registry.submitObservation(eventId, abi.encode(true), keccak256("stale"));
    }

    /// @dev Dispute griefing: a griefer disputes a correct proposed outcome.
    ///      With only 3 authorized resolvers, the Tier-1 committee is the
    ///      entire pool (committee = min(N1, poolSize)); once 2 of the 3
    ///      re-affirm the original "true" outcome (>= 66% of a 3-member
    ///      committee), the event finalizes and the griefer's DISPUTE_BOND is
    ///      forfeited (burn/treasury split — see DisputeManager) since the
    ///      committee upheld the proposal the attacker challenged.
    function test_disputeGriefing_frivolousDisputeCostsBond() public {
        bytes32 eventId = _createEvent(2);
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-b"));

        uint256 bond = disputeManager.DISPUTE_BOND();
        vm.deal(attacker, 1 ether);
        uint256 balanceBefore = attacker.balance;

        vm.prank(attacker);
        disputeManager.dispute{value: bond}(eventId);

        uint256 tier1Bond = disputeManager.TIER1_BOND();
        vm.deal(resolverA, 1 ether);
        vm.deal(resolverB, 1 ether);
        vm.prank(resolverA);
        disputeManager.submitTier1Vote{value: tier1Bond}(eventId, true);
        vm.prank(resolverB);
        disputeManager.submitTier1Vote{value: tier1Bond}(eventId, true); // 2/3 >= 66% -> converges, upholds "true"

        assertTrue(registry.isFinalized(eventId));
        assertEq(attacker.balance, balanceBefore - bond);
    }

    /// @dev Replay: attempting to dispute an event twice (e.g. to keep
    ///      re-extending uncertainty) is rejected once a dispute is already
    ///      on file, regardless of who files the second one.
    function test_disputeReplay_secondDisputeRejected() public {
        bytes32 eventId = _createEvent(2);
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-b"));

        uint256 bond = disputeManager.DISPUTE_BOND();
        vm.deal(attacker, 1 ether);
        vm.prank(attacker);
        disputeManager.dispute{value: bond}(eventId);

        address secondDisputer = address(0xDEAD);
        vm.deal(secondDisputer, 1 ether);
        vm.prank(secondDisputer);
        // A dispute case already exists for this event (opened by the first
        // disputer above), so a second attempt — from anyone — is rejected
        // up front, before even checking the Registry's status.
        vm.expectRevert(bytes("DisputeManager: already escalated"));
        disputeManager.dispute{value: bond}(eventId);
    }

    /// @dev Finalizing a disputed event before arbitration must be blocked,
    ///      even after the nominal dispute window has elapsed — otherwise a
    ///      dispute could be silently bypassed by just waiting it out.
    function test_finalize_blockedWhileDisputePending() public {
        bytes32 eventId = _createEvent(2);
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-b"));

        uint256 bond = disputeManager.DISPUTE_BOND();
        vm.deal(attacker, 1 ether);
        vm.prank(attacker);
        disputeManager.dispute{value: bond}(eventId);

        vm.warp(block.timestamp + 1 hours + 1);
        vm.expectRevert(bytes("EventRegistry: nothing to finalize"));
        registry.finalize(eventId);
    }
}
