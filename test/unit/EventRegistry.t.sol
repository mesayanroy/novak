// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventRegistry} from "../../contracts/EventRegistry.sol";
import {IEventRegistry} from "../../contracts/interfaces/IEventRegistry.sol";

contract EventRegistryTest is Test {
    EventRegistry internal registry;

    function setUp() public {
        registry = new EventRegistry();
    }

    function test_createEvent_opensEvent() public {
        IEventRegistry.EventSpec memory spec = IEventRegistry.EventSpec({
            specVersion: 1,
            sourceId: keccak256("example.price-feed"),
            openTimestamp: uint64(block.timestamp),
            observationDeadline: uint64(block.timestamp + 1 days),
            disputeWindowSeconds: 1 hours,
            spec: abi.encode("ETH/USD > 5000 on 2026-12-31")
        });

        bytes32 eventId = registry.createEvent(spec);

        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.Open));
        assertFalse(registry.isFinalized(eventId));
    }

    function test_getOutcome_unfinalizedEvent_returnsEmptyOutcome() public {
        IEventRegistry.EventSpec memory spec = IEventRegistry.EventSpec({
            specVersion: 1,
            sourceId: keccak256("example.price-feed"),
            openTimestamp: uint64(block.timestamp),
            observationDeadline: uint64(block.timestamp + 1 days),
            disputeWindowSeconds: 1 hours,
            spec: abi.encode("placeholder")
        });
        bytes32 eventId = registry.createEvent(spec);

        IEventRegistry.Outcome memory outcome = registry.getOutcome(eventId);
        assertFalse(outcome.exists);
    }

    // TODO: once submitObservation/proposeOutcome/finalize are implemented, add tests
    // for the full lifecycle transition sequence and for rejecting out-of-order calls.
}
