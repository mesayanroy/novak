// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EventRegistry } from "../../contracts/EventRegistry.sol";
import { EventComposer } from "../../contracts/EventComposer.sol";
import { EventBus } from "../../contracts/EventBus.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";
import { StockLendingGuard } from "../../consumers/StockLendingGuard.sol";

contract StockLendingGuardTest is Test {
    EventRegistry internal registry;
    EventComposer internal composer;
    EventBus internal bus;
    StockLendingGuard internal guard;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);
    address internal riskAdmin = address(0xAD);
    // Canonical Robinhood Chain mainnet NVDA stock token (docs/ROBINHOOD_CHAIN_PLAN.md §0).
    address internal constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;

    function setUp() public {
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
        bus = new EventBus(address(registry), address(composer));
        guard = new StockLendingGuard(address(bus), riskAdmin);
        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
    }

    function _splitEvent() internal returns (bytes32) {
        return registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("rh.corporate-action.v1"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: abi.encode(NVDA, "multiplier change effective within window")
            })
        );
    }

    function _finalize(bytes32 eventId, bool outcome) internal {
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(outcome), keccak256("a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(outcome), keccak256("b"));
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(eventId);
    }

    function _addRule(bytes32 eventId, bool failClosed) internal {
        vm.prank(riskAdmin);
        guard.addRiskRule(
            NVDA, eventId, uint64(block.timestamp), uint64(block.timestamp + 2 days), failClosed
        );
    }

    // Architectural regression guard (CLAUDE.md: every consumer gets one):
    // the guard only ever talks to the Event Bus.
    function test_guard_onlyHoldsEventBusReference() public view {
        assertEq(address(guard.eventBus()), address(bus));
    }

    function test_noRules_allowsLiquidation() public view {
        (bool allowed, bytes32 blocking) = guard.canLiquidate(NVDA);
        assertTrue(allowed);
        assertEq(blocking, bytes32(0));
    }

    function test_finalizedTrueRiskEvent_pausesInsideWindow() public {
        bytes32 eventId = _splitEvent();
        _addRule(eventId, false);
        _finalize(eventId, true);

        (bool allowed, bytes32 blocking) = guard.canLiquidate(NVDA);
        assertFalse(allowed);
        assertEq(blocking, eventId);
    }

    function test_finalizedFalseRiskEvent_allows() public {
        bytes32 eventId = _splitEvent();
        _addRule(eventId, true);
        _finalize(eventId, false);

        (bool allowed,) = guard.canLiquidate(NVDA);
        assertTrue(allowed);
    }

    function test_pendingEvent_failClosedPauses_failOpenAllows() public {
        bytes32 eventId = _splitEvent();
        _addRule(eventId, false);
        (bool allowed,) = guard.canLiquidate(NVDA);
        assertTrue(allowed, "fail-open rule ignores unresolved event");

        _addRule(eventId, true);
        (allowed,) = guard.canLiquidate(NVDA);
        assertFalse(allowed, "fail-closed rule pauses while unresolved");
    }

    function test_outsideWindow_allows() public {
        bytes32 eventId = _splitEvent();
        _addRule(eventId, true);
        _finalize(eventId, true);
        vm.warp(block.timestamp + 3 days);

        (bool allowed,) = guard.canLiquidate(NVDA);
        assertTrue(allowed);
    }

    function test_voidedEvent_neverPauses() public {
        bytes32 eventId = _splitEvent();
        _addRule(eventId, true);
        vm.warp(block.timestamp + 1 days + 1);
        registry.expire(eventId);

        (bool allowed,) = guard.canLiquidate(NVDA);
        assertTrue(allowed);
    }

    function test_onlyRiskAdminCanAddRules() public {
        vm.expectRevert(bytes("StockLendingGuard: not risk admin"));
        guard.addRiskRule(NVDA, bytes32("e"), 1, 2, false);
    }
}
