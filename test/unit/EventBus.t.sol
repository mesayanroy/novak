// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EventRegistry } from "../../contracts/EventRegistry.sol";
import { EventComposer } from "../../contracts/EventComposer.sol";
import { EventBus } from "../../contracts/EventBus.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";
import { IEventComposer } from "../../contracts/interfaces/IEventComposer.sol";
import { IEventBus } from "../../contracts/interfaces/IEventBus.sol";

contract EventBusTest is Test {
    EventRegistry internal registry;
    EventComposer internal composer;
    EventBus internal bus;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);

    function setUp() public {
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
        bus = new EventBus(address(registry), address(composer));
    }

    function _defaultSpec() internal view returns (IEventRegistry.EventSpec memory) {
        return IEventRegistry.EventSpec({
            specVersion: 1,
            sourceId: keccak256("example.price-feed"),
            openTimestamp: uint64(block.timestamp),
            observationDeadline: uint64(block.timestamp + 1 days),
            disputeWindowSeconds: 1 hours,
            quorumThreshold: 2,
            spec: abi.encode("placeholder")
        });
    }

    function _finalize(bytes32 eventId, bool outcome) internal {
        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(outcome), keccak256("ev-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(outcome), keccak256("ev-b"));
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(eventId);
    }

    function test_isAvailable_falseForUnfinalizedEvent() public {
        bytes32 eventId = registry.createEvent(_defaultSpec());
        assertFalse(bus.isAvailable(eventId));
    }

    function test_readOutcome_revertsForUnfinalizedEvent() public {
        bytes32 fakeEventId = keccak256("nonexistent");
        vm.expectRevert(bytes("EventBus: not finalized"));
        bus.readOutcome(fakeEventId);
    }

    function test_readOutcome_returnsFinalizedPrimitiveOutcome() public {
        bytes32 eventId = registry.createEvent(_defaultSpec());
        _finalize(eventId, true);

        assertTrue(bus.isAvailable(eventId));
        IEventRegistry.Outcome memory outcome = bus.readOutcome(eventId);
        assertTrue(abi.decode(outcome.outcomeData, (bool)));
    }

    function test_getAvailability_pendingThenAvailable() public {
        bytes32 eventId = registry.createEvent(_defaultSpec());
        assertEq(uint8(bus.getAvailability(eventId)), uint8(IEventBus.Availability.Pending));
        _finalize(eventId, false);
        assertEq(uint8(bus.getAvailability(eventId)), uint8(IEventBus.Availability.Available));
    }

    function test_getAvailability_unknownIdIsPending() public view {
        assertEq(
            uint8(bus.getAvailability(keccak256("nope"))), uint8(IEventBus.Availability.Pending)
        );
    }

    function test_getAvailability_expiredPrimitiveIsVoided() public {
        bytes32 eventId = registry.createEvent(_defaultSpec());
        vm.warp(block.timestamp + 1 days + 1);
        registry.expire(eventId);
        assertEq(uint8(bus.getAvailability(eventId)), uint8(IEventBus.Availability.Voided));
    }

    function test_getAvailability_compositeOverExpiredOperandIsVoidedAfterTryResolve() public {
        bytes32 eventA = registry.createEvent(_defaultSpec());
        bytes32 eventB = registry.createEvent(_defaultSpec());
        _finalize(eventA, true);

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = eventA;
        operands[1] = eventB;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.And, operands: operands, window: 0
            })
        );

        vm.warp(block.timestamp + 1 days + 1);
        registry.expire(eventB);
        // Still Pending until someone pokes the Composer.
        assertEq(uint8(bus.getAvailability(compositeId)), uint8(IEventBus.Availability.Pending));
        composer.tryResolve(compositeId);
        assertEq(uint8(bus.getAvailability(compositeId)), uint8(IEventBus.Availability.Voided));
        assertFalse(bus.isAvailable(compositeId));
    }

    function test_readOutcome_returnsResolvedCompositeOutcome() public {
        bytes32 eventA = registry.createEvent(_defaultSpec());
        bytes32 eventB = registry.createEvent(_defaultSpec());
        _finalize(eventA, true);
        _finalize(eventB, true);

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = eventA;
        operands[1] = eventB;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.And, operands: operands, window: 0
            })
        );

        assertFalse(bus.isAvailable(compositeId));
        composer.tryResolve(compositeId);
        assertTrue(bus.isAvailable(compositeId));

        IEventRegistry.Outcome memory outcome = bus.readOutcome(compositeId);
        assertTrue(abi.decode(outcome.outcomeData, (bool)));
    }
}
