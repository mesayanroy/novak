// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventRegistry} from "../../contracts/EventRegistry.sol";
import {IEventRegistry} from "../../contracts/interfaces/IEventRegistry.sol";

contract EventRegistryTest is Test {
    EventRegistry internal registry;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);
    address internal resolverC = address(0xC0FFEE);

    function setUp() public {
        registry = new EventRegistry();
    }

    // Registry.owner() is this test contract (the deployer) — needs to accept
    // forfeited dispute bonds sent via a low-level call.
    receive() external payable {}

    function _defaultSpec(uint8 quorumThreshold) internal view returns (IEventRegistry.EventSpec memory) {
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
        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.ObservationsSubmitted));

        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-a"));
        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.ObservationsSubmitted));

        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-b"));
        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.ProposedOutcome));

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

    function test_dispute_thenUpheldProposal_finalizesAndForfeitsBond() public {
        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        bytes32 eventId = registry.createEvent(_defaultSpec(2));

        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-b"));

        address disputer = address(0xD15C);
        uint256 bond = registry.DISPUTE_BOND();
        vm.deal(disputer, 1 ether);
        uint256 ownerBalanceBefore = registry.owner().balance;

        vm.prank(disputer);
        registry.dispute{value: bond}(eventId);

        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.DisputeWindow));

        registry.resolveDispute(eventId, true);

        assertTrue(registry.isFinalized(eventId));
        assertEq(registry.owner().balance, ownerBalanceBefore + bond);
        assertEq(disputer.balance, 1 ether - bond);
    }

    function test_dispute_thenRejectedProposal_voidsAndRefundsBond() public {
        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        bytes32 eventId = registry.createEvent(_defaultSpec(2));

        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(true), keccak256("evidence-b"));

        address disputer = address(0xD15C);
        uint256 bond = registry.DISPUTE_BOND();
        vm.deal(disputer, 1 ether);
        uint256 balanceBefore = disputer.balance;

        vm.prank(disputer);
        registry.dispute{value: bond}(eventId);

        registry.resolveDispute(eventId, false);

        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.Voided));
        assertFalse(registry.isFinalized(eventId));
        assertEq(disputer.balance, balanceBefore);
    }
}
