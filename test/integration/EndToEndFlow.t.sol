// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventRegistry} from "../../contracts/EventRegistry.sol";
import {EventComposer} from "../../contracts/EventComposer.sol";
import {EventBus} from "../../contracts/EventBus.sol";
import {Market} from "../../derivatives/Market.sol";
import {IEventRegistry} from "../../contracts/interfaces/IEventRegistry.sol";
import {IEventComposer} from "../../contracts/interfaces/IEventComposer.sol";

/// @notice Mirrors the canonical flow from examples/end-to-end-flow.ts:
///   create two primitive events -> (resolvers submit observations, out of scope
///   for this contract-only test) -> compose AND/WITHIN(48h) -> Market references
///   the composite -> settle.
///
/// Currently only the parts implementable without resolver/quorum logic are
/// exercised; the rest is marked TODO pending resolver <-> Registry wiring.
contract EndToEndFlowTest is Test {
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

    function test_createTwoPrimitives_composeAnd_createMarket() public {
        bytes32 eventA = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.rate-decision"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                spec: abi.encode("Fed holds rates in Dec 2026")
            })
        );

        bytes32 eventB = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.price-feed"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                spec: abi.encode("ETH/USD > 5000 by Dec 2026")
            })
        );

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = eventA;
        operands[1] = eventB;

        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Within,
                operands: operands,
                window: 48 hours
            })
        );

        bytes32 marketId = market.createMarket(compositeId);
        (bytes32 storedEventId,,,) = market.markets(marketId);
        assertEq(storedEventId, compositeId);

        // TODO: once resolver observation submission + quorum + finalize are
        // implemented, extend this test to actually finalize eventA and eventB,
        // call composer.tryResolve(compositeId), and settle the market end-to-end.
    }
}
