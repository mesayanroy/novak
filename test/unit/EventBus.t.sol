// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventRegistry} from "../../contracts/EventRegistry.sol";
import {EventComposer} from "../../contracts/EventComposer.sol";
import {EventBus} from "../../contracts/EventBus.sol";
import {IEventRegistry} from "../../contracts/interfaces/IEventRegistry.sol";

contract EventBusTest is Test {
    EventRegistry internal registry;
    EventComposer internal composer;
    EventBus internal bus;

    function setUp() public {
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
        bus = new EventBus(address(registry), address(composer));
    }

    function test_isAvailable_falseForUnfinalizedEvent() public {
        IEventRegistry.EventSpec memory spec = IEventRegistry.EventSpec({
            specVersion: 1,
            sourceId: keccak256("example.price-feed"),
            openTimestamp: uint64(block.timestamp),
            observationDeadline: uint64(block.timestamp + 1 days),
            disputeWindowSeconds: 1 hours,
            spec: abi.encode("placeholder")
        });
        bytes32 eventId = registry.createEvent(spec);

        assertFalse(bus.isAvailable(eventId));
    }

    function test_readOutcome_revertsForUnfinalizedEvent() public {
        bytes32 fakeEventId = keccak256("nonexistent");
        vm.expectRevert(bytes("EventBus: not finalized"));
        bus.readOutcome(fakeEventId);
    }

    // TODO: once EventRegistry exposes a finalize() path, add a test that a
    // finalized event's outcome is readable through the Bus (and that the Bus never
    // requires a resolver reference to do so).
}
