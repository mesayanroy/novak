// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventRegistry} from "../../contracts/EventRegistry.sol";
import {EventComposer} from "../../contracts/EventComposer.sol";
import {EventBus} from "../../contracts/EventBus.sol";
import {Market} from "../../derivatives/Market.sol";
import {IEventRegistry} from "../../contracts/interfaces/IEventRegistry.sol";

contract MarketTest is Test {
    EventRegistry internal registry;
    EventComposer internal composer;
    EventBus internal bus;
    Market internal market;

    function setUp() public {
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
        bus = new EventBus(address(registry), address(composer));
        market = new Market(address(bus));
    }

    function test_createMarket_recordsEventId() public {
        bytes32 eventId = keccak256("some-composite-event");
        bytes32 marketId = market.createMarket(eventId);

        (bytes32 storedEventId,,,) = market.markets(marketId);
        assertEq(storedEventId, eventId);
    }

    function test_settle_revertsIfEventNotFinalized() public {
        bytes32 eventId = keccak256("some-composite-event");
        bytes32 marketId = market.createMarket(eventId);

        vm.expectRevert(bytes("Market: event not finalized"));
        market.settle(marketId);
    }

    // Architectural regression guard: Market must only reference the EventBus
    // address, never a Registry/Composer/resolver address directly.
    function test_market_onlyHoldsEventBusReference() public {
        assertEq(address(market.eventBus()), address(bus));
    }
}
