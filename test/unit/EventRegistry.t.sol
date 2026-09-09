// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EventRegistry } from "../../contracts/EventRegistry.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";

contract EventRegistryTest is Test {
    EventRegistry internal registry;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);
    address internal resolverC = address(0xC0FFEE);

    function setUp() public {
        registry = new EventRegistry();
    }

    function _defaultSpec(uint8 quorumThreshold)
        internal
        view
        returns (IEventRegistry.EventSpec memory)
    {
        return IEventRegistry.EventSpec({
            specVersion: 1,
            sourceId: keccak256("example.price-feed"),
            openTimestamp: uint64(block.timestamp),
            observationDeadline: uint64(block.timestamp + 1 days),
            disputeWindowSeconds: 1 hours,
            quorumThreshold: quorumThreshold,
            spec: abi.encode("ETH/USD > 5000 on 2026-12-31")
        });
    }

    function test_createEvent_opensEvent() public {
        bytes32 eventId = registry.createEvent(_defaultSpec(2));

        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.Open));
        assertFalse(registry.isFinalized(eventId));
    }

    function test_getOutcome_unfinalizedEvent_returnsEmptyOutcome() public {
        bytes32 eventId = registry.createEvent(_defaultSpec(2));
        IEventRegistry.Outcome memory outcome = registry.getOutcome(eventId);
        assertFalse(outcome.exists);
    }

    function test_submitObservation_revertsForUnauthorizedResolver() public {
        bytes32 eventId = registry.createEvent(_defaultSpec(2));
        vm.prank(resolverA);
        vm.expectRevert(bytes("EventRegistry: not an authorized resolver"));
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence"));
    }

    function test_quorum_reachedAfterThresholdMatchingObservations() public {
        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        registry.setResolverAuthorization(resolverC, true);

        bytes32 eventId = registry.createEvent(_defaultSpec(2));

        // A third, disagreeing resolver submits first — quorum is on exact
        // outcome agreement, so a lone dissenting vote doesn't block later
        // agreement from reaching threshold.
        vm.prank(resolverC);
        registry.submitObservation(eventId, abi.encode(false), keccak256("evidence-c"));
        assertEq(
            uint8(registry.getEvent(eventId)),
            uint8(IEventRegistry.EventStatus.ObservationsSubmitted)
        );

        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-a"));
        assertEq(
            uint8(registry.getEvent(eventId)),
            uint8(IEventRegistry.EventStatus.ObservationsSubmitted)
        );

        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-b"));
        assertEq(
            uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.ProposedOutcome)
        );

        // Once quorum has proposed an outcome, the Registry stops accepting
        // further submissions for this event — a later resolver can't reopen
        // the vote.
        address resolverD = address(0xD00D);
        registry.setResolverAuthorization(resolverD, true);
        vm.prank(resolverD);
        vm.expectRevert(bytes("EventRegistry: not accepting observations"));
        registry.submitObservation(eventId, abi.encode(false), keccak256("evidence-d"));
    }

    function test_submitObservation_revertsOnDoubleSubmission() public {
        registry.setResolverAuthorization(resolverA, true);
        bytes32 eventId = registry.createEvent(_defaultSpec(2));

        vm.startPrank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-a"));
        vm.expectRevert(bytes("EventRegistry: already submitted"));
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-a-again"));
        vm.stopPrank();
    }

    function test_submitObservation_revertsAfterDeadline() public {
        registry.setResolverAuthorization(resolverA, true);
        bytes32 eventId = registry.createEvent(_defaultSpec(2));

        vm.warp(block.timestamp + 2 days);
        vm.prank(resolverA);
        vm.expectRevert(bytes("EventRegistry: observation deadline passed"));
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-a"));
    }

    function test_finalize_revertsBeforeDisputeWindowElapses() public {
        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        bytes32 eventId = registry.createEvent(_defaultSpec(2));

        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-b"));

        vm.expectRevert(bytes("EventRegistry: dispute window still open"));
        registry.finalize(eventId);
    }

    function test_finalize_succeedsAfterDisputeWindowElapsesUndisputed() public {
        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        bytes32 eventId = registry.createEvent(_defaultSpec(2));

        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-b"));

        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(eventId);

        assertTrue(registry.isFinalized(eventId));
        IEventRegistry.Outcome memory outcome = registry.getOutcome(eventId);
        assertTrue(abi.decode(outcome.outcomeData, (bool)));
    }

    // Dispute-flow tests (filing a dispute, tiered committee escalation,
    // bond slashing/refunds) now live in test/unit/DisputeManager.t.sol —
    // arbitration is no longer an EventRegistry concern at all; the Registry
    // only exposes the onlyDisputeManager transitions those tests exercise.

    function test_expire_marksExpiredWhenNoObservationsEverSubmitted() public {
        bytes32 eventId = registry.createEvent(_defaultSpec(2));

        vm.warp(block.timestamp + 2 days);
        registry.expire(eventId);

        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.Expired));
        assertFalse(registry.isFinalized(eventId));
    }

    function test_expire_revertsBeforeObservationDeadline() public {
        bytes32 eventId = registry.createEvent(_defaultSpec(2));

        vm.expectRevert(bytes("EventRegistry: observation window still open"));
        registry.expire(eventId);
    }

    function test_expire_revertsIfObservationsAlreadySubmitted() public {
        registry.setResolverAuthorization(resolverA, true);
        bytes32 eventId = registry.createEvent(_defaultSpec(2));

        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-a"));

        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(bytes("EventRegistry: not expirable"));
        registry.expire(eventId);
    }

    function test_setDisputeManager_canOnlyBeSetOnce() public {
        registry.setDisputeManager(address(0xD15C));

        vm.expectRevert(bytes("EventRegistry: dispute manager already set"));
        registry.setDisputeManager(address(0xBEEF));
    }

    function test_onlyDisputeManager_rejectsDirectCallsToPrivilegedTransitions() public {
        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        bytes32 eventId = registry.createEvent(_defaultSpec(2));
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-b"));

        // No DisputeManager configured at all yet -> disputeManager == address(0),
        // so even a call that happens to originate from address(0) semantics
        // (impossible in practice) is still rejected; here we just confirm an
        // arbitrary caller can't drive dispute-only transitions directly.
        vm.expectRevert(bytes("EventRegistry: not dispute manager"));
        registry.escalateToDispute(eventId);
    }

    function test_getAuthorizedResolvers_reflectsAuthorizeAndDeauthorize() public {
        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        registry.setResolverAuthorization(resolverC, true);

        address[] memory all = registry.getAuthorizedResolvers();
        assertEq(all.length, 3);

        registry.setResolverAuthorization(resolverB, false);
        address[] memory afterRemoval = registry.getAuthorizedResolvers();
        assertEq(afterRemoval.length, 2);
        for (uint256 i = 0; i < afterRemoval.length; i++) {
            assertTrue(afterRemoval[i] != resolverB);
        }
    }
}
