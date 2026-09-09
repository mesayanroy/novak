// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EventRegistry } from "../../contracts/EventRegistry.sol";
import { EventComposer } from "../../contracts/EventComposer.sol";
import { DisputeManager } from "../../contracts/DisputeManager.sol";
import { IEventComposer } from "../../contracts/interfaces/IEventComposer.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";

contract EventComposerTest is Test {
    EventRegistry internal registry;
    EventComposer internal composer;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);

    function setUp() public {
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
    }

    function _createAndFinalize(bool outcome) internal returns (bytes32 eventId) {
        eventId = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.price-feed"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: abi.encode("placeholder")
            })
        );
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(outcome), keccak256("ev-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(outcome), keccak256("ev-b"));
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(eventId);
    }

    function test_createComposite_and_requiresAtLeastTwoOperands() public {
        bytes32[] memory operands = new bytes32[](1);
        operands[0] = _createAndFinalize(true);

        vm.expectRevert(bytes("EventComposer: AND/OR take >= 2 operands"));
        composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.And, operands: operands, window: 0
            })
        );
    }

    function test_createComposite_revertsOnUnknownOperand() public {
        bytes32[] memory operands = new bytes32[](2);
        operands[0] = keccak256("unregistered-a");
        operands[1] = keccak256("unregistered-b");

        vm.expectRevert(bytes("EventComposer: unknown operand"));
        composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.And, operands: operands, window: 0
            })
        );
    }

    function test_createComposite_not_requiresExactlyOneOperand() public {
        bytes32 a = _createAndFinalize(true);
        bytes32 b = _createAndFinalize(true);
        bytes32[] memory operands = new bytes32[](2);
        operands[0] = a;
        operands[1] = b;

        vm.expectRevert(bytes("EventComposer: NOT takes 1 operand"));
        composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Not, operands: operands, window: 0
            })
        );
    }

    function test_tryResolve_and_bothTrue_resolvesTrue() public {
        bytes32 a = _createAndFinalize(true);
        bytes32 b = _createAndFinalize(true);
        bytes32[] memory operands = new bytes32[](2);
        operands[0] = a;
        operands[1] = b;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.And, operands: operands, window: 0
            })
        );

        (bool resolved, bool outcome) = composer.tryResolve(compositeId);
        assertTrue(resolved);
        assertTrue(outcome);
    }

    function test_tryResolve_and_oneFalse_resolvesFalse() public {
        bytes32 a = _createAndFinalize(true);
        bytes32 b = _createAndFinalize(false);
        bytes32[] memory operands = new bytes32[](2);
        operands[0] = a;
        operands[1] = b;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.And, operands: operands, window: 0
            })
        );

        (bool resolved, bool outcome) = composer.tryResolve(compositeId);
        assertTrue(resolved);
        assertFalse(outcome);
    }

    function test_tryResolve_or_oneTrue_resolvesTrue() public {
        bytes32 a = _createAndFinalize(false);
        bytes32 b = _createAndFinalize(true);
        bytes32[] memory operands = new bytes32[](2);
        operands[0] = a;
        operands[1] = b;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Or, operands: operands, window: 0
            })
        );

        (bool resolved, bool outcome) = composer.tryResolve(compositeId);
        assertTrue(resolved);
        assertTrue(outcome);
    }

    function test_tryResolve_not_negatesOperand() public {
        bytes32 a = _createAndFinalize(true);
        bytes32[] memory operands = new bytes32[](1);
        operands[0] = a;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Not, operands: operands, window: 0
            })
        );

        (bool resolved, bool outcome) = composer.tryResolve(compositeId);
        assertTrue(resolved);
        assertFalse(outcome);
    }

    function test_tryResolve_unresolvedUntilAllOperandsFinalized() public {
        bytes32 a = _createAndFinalize(true);
        bytes32 b = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.price-feed"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: abi.encode("still open")
            })
        );

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = a;
        operands[1] = b;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.And, operands: operands, window: 0
            })
        );

        (bool resolved, bool outcome) = composer.tryResolve(compositeId);
        assertFalse(resolved);
        assertFalse(outcome);
        assertFalse(composer.isResolved(compositeId));
    }

    function test_tryResolve_within_trueWhenWithinWindow() public {
        bytes32 a = _createAndFinalize(true);
        // finalize b 1 hour after a
        vm.warp(block.timestamp + 1 hours);
        bytes32 b = _createAndFinalize(true);

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = a;
        operands[1] = b;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Within, operands: operands, window: 48 hours
            })
        );

        (bool resolved, bool outcome) = composer.tryResolve(compositeId);
        assertTrue(resolved);
        assertTrue(outcome);
    }

    function test_tryResolve_within_falseWhenOutsideWindow() public {
        bytes32 a = _createAndFinalize(true);
        vm.warp(block.timestamp + 72 hours);
        bytes32 b = _createAndFinalize(true);

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = a;
        operands[1] = b;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Within, operands: operands, window: 48 hours
            })
        );

        (bool resolved, bool outcome) = composer.tryResolve(compositeId);
        assertTrue(resolved);
        assertFalse(outcome);
    }

    function test_tryResolve_before_trueWhenStrictlyOrdered() public {
        bytes32 a = _createAndFinalize(true);
        vm.warp(block.timestamp + 1 hours);
        bytes32 b = _createAndFinalize(true);

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = a;
        operands[1] = b;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Before, operands: operands, window: 0
            })
        );

        (bool resolved, bool outcome) = composer.tryResolve(compositeId);
        assertTrue(resolved);
        assertTrue(outcome);
    }

    function test_tryResolve_cachesResultOnSubsequentCalls() public {
        bytes32 a = _createAndFinalize(true);
        bytes32 b = _createAndFinalize(true);
        bytes32[] memory operands = new bytes32[](2);
        operands[0] = a;
        operands[1] = b;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.And, operands: operands, window: 0
            })
        );

        composer.tryResolve(compositeId);
        (bool resolved, bool outcome) = composer.getResolvedOutcome(compositeId);
        assertTrue(resolved);
        assertTrue(outcome);

        // Calling again returns the same cached result even if underlying
        // registry state could theoretically change (it can't post-finalization,
        // but the cache guarantees it regardless).
        (bool resolvedAgain, bool outcomeAgain) = composer.tryResolve(compositeId);
        assertTrue(resolvedAgain);
        assertTrue(outcomeAgain);
    }

    // --- Gap 1: canonicalization / dedup for order-independent operators ---

    function test_createComposite_and_dedupesRegardlessOfOperandOrder() public {
        bytes32 a = _createAndFinalize(true);
        bytes32 b = _createAndFinalize(true);

        bytes32[] memory forward = new bytes32[](2);
        forward[0] = a;
        forward[1] = b;
        bytes32[] memory reversed = new bytes32[](2);
        reversed[0] = b;
        reversed[1] = a;

        bytes32 idForward = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.And, operands: forward, window: 0
            })
        );

        EventComposer composer2 = new EventComposer(address(registry));
        bytes32 idReversed = composer2.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.And, operands: reversed, window: 0
            })
        );

        assertEq(idForward, idReversed, "AND(a,b) and AND(b,a) must be the same composite");
    }

    function test_createComposite_before_doesNotDedupe_operandOrderIsSemantic() public {
        bytes32 a = _createAndFinalize(true);
        bytes32 b = _createAndFinalize(true);

        bytes32[] memory forward = new bytes32[](2);
        forward[0] = a;
        forward[1] = b;
        bytes32[] memory reversed = new bytes32[](2);
        reversed[0] = b;
        reversed[1] = a;

        bytes32 idForward = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Before, operands: forward, window: 0
            })
        );
        bytes32 idReversed = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Before, operands: reversed, window: 0
            })
        );

        assertTrue(idForward != idReversed, "BEFORE(a,b) and BEFORE(b,a) are different claims");
    }

    // --- Gap 3: structural DAG bounds ---

    function test_createComposite_revertsWhenExceedingMaxChildrenPerNode() public {
        uint256 tooMany = composer.MAX_CHILDREN_PER_NODE() + 1;
        bytes32[] memory operands = new bytes32[](tooMany);
        for (uint256 i = 0; i < tooMany; i++) {
            operands[i] = _createAndFinalize(true);
        }

        vm.expectRevert(bytes("EventComposer: too many operands"));
        composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.And, operands: operands, window: 0
            })
        );
    }

    function test_createComposite_revertsWhenExceedingMaxDagDepth() public {
        bytes32 current = _createAndFinalize(true);
        uint32 maxDepth = composer.MAX_DAG_DEPTH();

        // Chain NOT(NOT(...)) up to the depth cap, which must succeed...
        for (uint32 d = 1; d <= maxDepth; d++) {
            bytes32[] memory operands = new bytes32[](1);
            operands[0] = current;
            current = composer.createComposite(
                IEventComposer.CompositeSpec({
                    op: IEventComposer.Op.Not, operands: operands, window: 0
                })
            );
        }
        assertEq(composer.getDepth(current), maxDepth);

        // ...and one level deeper must revert.
        bytes32[] memory oneMore = new bytes32[](1);
        oneMore[0] = current;
        vm.expectRevert(bytes("EventComposer: composition too deep"));
        composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Not, operands: oneMore, window: 0
            })
        );
    }

    function test_getDepth_isZeroForAnyPrimitive() public {
        bytes32 a = _createAndFinalize(true);
        assertEq(composer.getDepth(a), 0);
    }

    // --- Gap 4: terminal-state propagation ---

    function test_tryResolve_and_voidedSibling_propagatesVoidedOnceOthersAreDecided() public {
        bytes32 voided = _createVoidedPrimitive();
        bytes32 trueEvent = _createAndFinalize(true);

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = voided;
        operands[1] = trueEvent;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.And, operands: operands, window: 0
            })
        );

        (bool resolved, bool outcome) = composer.tryResolve(compositeId);
        assertFalse(resolved);
        assertFalse(outcome);
        assertEq(uint8(composer.getStatus(compositeId)), uint8(IEventComposer.Status.Voided));
    }

    function test_tryResolve_and_falseShortCircuitsEvenWithVoidedSibling() public {
        bytes32 voided = _createVoidedPrimitive();
        bytes32 falseEvent = _createAndFinalize(false);

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = voided;
        operands[1] = falseEvent;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.And, operands: operands, window: 0
            })
        );

        // False dominates Voided: the AND can never be true regardless of
        // the voided sibling, so it resolves False, not Voided.
        (bool resolved, bool outcome) = composer.tryResolve(compositeId);
        assertTrue(resolved);
        assertFalse(outcome);
    }

    function test_tryResolve_and_pendingSiblingIsNotTreatedAsAStall() public {
        bytes32 voided = _createVoidedPrimitive();
        bytes32 stillOpen = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.price-feed"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: abi.encode("still pending")
            })
        );

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = voided;
        operands[1] = stillOpen;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.And, operands: operands, window: 0
            })
        );

        // A genuinely-pending sibling must NOT be short-circuited to Voided —
        // it might still resolve False, which would dominate Voided.
        (bool resolved,) = composer.tryResolve(compositeId);
        assertFalse(resolved);
        assertEq(uint8(composer.getStatus(compositeId)), uint8(IEventComposer.Status.Unresolved));
    }

    function test_tryResolve_or_voidedSibling_propagatesVoidedWhenOthersFalse() public {
        bytes32 voided = _createVoidedPrimitive();
        bytes32 falseEvent = _createAndFinalize(false);

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = voided;
        operands[1] = falseEvent;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Or, operands: operands, window: 0
            })
        );

        (bool resolved,) = composer.tryResolve(compositeId);
        assertFalse(resolved);
        assertEq(uint8(composer.getStatus(compositeId)), uint8(IEventComposer.Status.Voided));
    }

    function test_tryResolve_not_voidedOperand_propagatesVoided() public {
        bytes32 voided = _createVoidedPrimitive();
        bytes32[] memory operands = new bytes32[](1);
        operands[0] = voided;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Not, operands: operands, window: 0
            })
        );

        (bool resolved,) = composer.tryResolve(compositeId);
        assertFalse(resolved);
        assertEq(uint8(composer.getStatus(compositeId)), uint8(IEventComposer.Status.Voided));
    }

    function test_tryResolve_within_voidedOperand_propagatesVoided() public {
        bytes32 voided = _createVoidedPrimitive();
        bytes32 trueEvent = _createAndFinalize(true);

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = voided;
        operands[1] = trueEvent;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Within, operands: operands, window: 48 hours
            })
        );

        (bool resolved,) = composer.tryResolve(compositeId);
        assertFalse(resolved);
        assertEq(uint8(composer.getStatus(compositeId)), uint8(IEventComposer.Status.Voided));
    }

    /// @dev Creates a primitive event and drives it to `Voided` via the
    ///      DisputeManager's Tier-2-timeout path (the only way a primitive
    ///      reaches `Voided` in this protocol).
    function _createVoidedPrimitive() internal returns (bytes32 eventId) {
        DisputeManager disputeManager = new DisputeManager(address(registry), address(0xC0DE));
        // A fresh registry has no dispute manager wired yet in most tests,
        // but this contract's `registry` is shared across tests in this
        // file — guard against double-set.
        if (registry.disputeManager() == address(0)) {
            registry.setDisputeManager(address(disputeManager));
        } else {
            disputeManager = DisputeManager(registry.disputeManager());
        }

        eventId = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.price-feed"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: abi.encode("will be voided")
            })
        );
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-a-void"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-b-void"));

        address disputer = address(0xD15C0);
        vm.deal(disputer, 1 ether);
        // Hoist the value expression before the prank: `disputeManager
        // .DISPUTE_BOND()` is itself an external call, and evaluating it
        // inline as part of `dispute{value: ...}(...)` would consume the
        // prank before `dispute()` actually runs (see CLAUDE.md's
        // documented vm.prank + inline-value-expression gotcha).
        uint256 bond = disputeManager.DISPUTE_BOND();
        vm.prank(disputer);
        disputeManager.dispute{ value: bond }(eventId);

        uint64 tier1Window = disputeManager.TIER1_WINDOW();
        vm.warp(block.timestamp + tier1Window + 1);
        disputeManager.escalateTier2(eventId);
        uint64 tier2Window = disputeManager.TIER2_WINDOW();
        vm.warp(block.timestamp + tier2Window + 1);
        disputeManager.voidAfterTier2Timeout(eventId);

        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.Voided));
    }
}
