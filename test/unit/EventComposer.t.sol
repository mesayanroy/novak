// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventRegistry} from "../../contracts/EventRegistry.sol";
import {EventComposer} from "../../contracts/EventComposer.sol";
import {IEventComposer} from "../../contracts/interfaces/IEventComposer.sol";
import {IEventRegistry} from "../../contracts/interfaces/IEventRegistry.sol";

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
            IEventComposer.CompositeSpec({op: IEventComposer.Op.And, operands: operands, window: 0})
        );
    }

    function test_createComposite_revertsOnUnknownOperand() public {
        bytes32[] memory operands = new bytes32[](2);
        operands[0] = keccak256("unregistered-a");
        operands[1] = keccak256("unregistered-b");

        vm.expectRevert(bytes("EventComposer: unknown operand"));
        composer.createComposite(
            IEventComposer.CompositeSpec({op: IEventComposer.Op.And, operands: operands, window: 0})
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
            IEventComposer.CompositeSpec({op: IEventComposer.Op.Not, operands: operands, window: 0})
        );
    }

    function test_tryResolve_and_bothTrue_resolvesTrue() public {
        bytes32 a = _createAndFinalize(true);
        bytes32 b = _createAndFinalize(true);
        bytes32[] memory operands = new bytes32[](2);
        operands[0] = a;
        operands[1] = b;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({op: IEventComposer.Op.And, operands: operands, window: 0})
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
            IEventComposer.CompositeSpec({op: IEventComposer.Op.And, operands: operands, window: 0})
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
            IEventComposer.CompositeSpec({op: IEventComposer.Op.Or, operands: operands, window: 0})
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
            IEventComposer.CompositeSpec({op: IEventComposer.Op.Not, operands: operands, window: 0})
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
            IEventComposer.CompositeSpec({op: IEventComposer.Op.And, operands: operands, window: 0})
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
            IEventComposer.CompositeSpec({op: IEventComposer.Op.Within, operands: operands, window: 48 hours})
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
            IEventComposer.CompositeSpec({op: IEventComposer.Op.Within, operands: operands, window: 48 hours})
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
            IEventComposer.CompositeSpec({op: IEventComposer.Op.Before, operands: operands, window: 0})
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
            IEventComposer.CompositeSpec({op: IEventComposer.Op.And, operands: operands, window: 0})
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
}
