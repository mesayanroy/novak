// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EventRegistry } from "../../contracts/EventRegistry.sol";
import { EventComposer } from "../../contracts/EventComposer.sol";
import { EventBus } from "../../contracts/EventBus.sol";
import { Settlement } from "../../derivatives/Settlement.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";
import { IEventComposer } from "../../contracts/interfaces/IEventComposer.sol";
import { IEventBus } from "../../contracts/interfaces/IEventBus.sol";

/// @notice specVersion 2 outcome payload: abi.encode(bool outcome, uint64 occurredAt).
contract OutcomeV2Test is Test {
    EventRegistry internal registry;
    EventComposer internal composer;
    EventBus internal bus;
    Settlement internal settlement;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);

    function setUp() public {
        vm.warp(30 days); // leave room for occurredAt values in the past
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
        bus = new EventBus(address(registry), address(composer));
        settlement = new Settlement(address(bus));
        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
    }

    function _event(uint16 specVersion) internal returns (bytes32) {
        return registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: specVersion,
                sourceId: keccak256("sec.earnings.v1"),
                openTimestamp: uint64(block.timestamp - 10 days),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: ""
            })
        );
    }

    function _observeBoth(bytes32 eventId, bytes memory payload) internal {
        vm.prank(resolverA);
        registry.submitObservation(eventId, payload, keccak256("a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, payload, keccak256("b"));
    }

    function _within48h(bytes32 a, bytes32 b) internal returns (bytes32 id) {
        bytes32[] memory ops = new bytes32[](2);
        ops[0] = a;
        ops[1] = b;
        id = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Within, operands: ops, window: 48 hours
            })
        );
    }

    /// @dev The motivating case: two facts that happened 5 days apart, but
    ///      were finalized in the same block. v1 semantics (finalizedAt) would
    ///      wrongly say WITHIN(48h) = true.
    function test_within_usesOccurredAt_notFinalizationTime() public {
        bytes32 earnings = _event(2);
        bytes32 priceMove = _event(2);
        _observeBoth(earnings, abi.encode(true, uint64(block.timestamp - 7 days)));
        _observeBoth(priceMove, abi.encode(true, uint64(block.timestamp - 2 days)));
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(earnings);
        registry.finalize(priceMove);

        bytes32 composite = _within48h(earnings, priceMove);
        (bool resolved, bool outcome) = composer.tryResolve(composite);
        assertTrue(resolved);
        assertFalse(outcome, "5 days apart is not within 48h");
    }

    function test_within_occurredAtInsideWindow_true() public {
        bytes32 a = _event(2);
        bytes32 b = _event(2);
        _observeBoth(a, abi.encode(true, uint64(block.timestamp - 3 days)));
        _observeBoth(b, abi.encode(true, uint64(block.timestamp - 2 days)));
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(a);
        registry.finalize(b);

        (, bool outcome) = composer.tryResolve(_within48h(a, b));
        assertTrue(outcome);
    }

    function test_submit_rejectsFutureOccurredAt() public {
        bytes32 eventId = _event(2);
        vm.prank(resolverA);
        vm.expectRevert(bytes("EventRegistry: occurredAt in future"));
        registry.submitObservation(
            eventId, abi.encode(true, uint64(block.timestamp + 1)), keccak256("a")
        );
    }

    function test_submit_rejectsV1PayloadOnV2Event() public {
        bytes32 eventId = _event(2);
        vm.prank(resolverA);
        vm.expectRevert(bytes("EventRegistry: bad v2 payload"));
        registry.submitObservation(eventId, abi.encode(true), keccak256("a"));
    }

    /// @dev Consumers that decode `(bool)` (Settlement, StockLendingGuard)
    ///      keep working on v2 payloads — the bool is the first word.
    function test_settlement_decodesV2Payload() public {
        bytes32 eventId = _event(2);
        _observeBoth(eventId, abi.encode(true, uint64(block.timestamp - 1 days)));
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(eventId);

        (IEventBus.Availability status, bool outcome) = settlement.getSettlement(eventId);
        assertEq(uint8(status), uint8(IEventBus.Availability.Available));
        assertTrue(outcome);
    }
}
