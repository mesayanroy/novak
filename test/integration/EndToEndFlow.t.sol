// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventRegistry} from "../../contracts/EventRegistry.sol";
import {DisputeManager} from "../../contracts/DisputeManager.sol";
import {EventComposer} from "../../contracts/EventComposer.sol";
import {EventBus} from "../../contracts/EventBus.sol";
import {Settlement} from "../../derivatives/Settlement.sol";
import {PositionManager} from "../../derivatives/PositionManager.sol";
import {Market} from "../../derivatives/Market.sol";
import {IEventRegistry} from "../../contracts/interfaces/IEventRegistry.sol";
import {IEventComposer} from "../../contracts/interfaces/IEventComposer.sol";

/// @notice The canonical Novak flow, fully wired end-to-end (see
///         examples/end-to-end-flow.ts for the off-chain/SDK narration of the
///         same scenario): two primitive events are resolved by independent
///         resolvers reaching quorum, finalized after their dispute windows,
///         composed with AND + WITHIN(48h), and a derivatives market settles
///         against the resulting composite event.
contract EndToEndFlowTest is Test {
    EventRegistry internal registry;
    DisputeManager internal disputeManager;
    EventComposer internal composer;
    EventBus internal bus;
    Settlement internal settlement;
    PositionManager internal positionManager;
    Market internal market;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);
    address internal resolverC = address(0xC0FFEE);

    address internal alice = address(0x1);
    address internal bob = address(0x2);

    function setUp() public {
        registry = new EventRegistry();
        disputeManager = new DisputeManager(address(registry), address(this));
        registry.setDisputeManager(address(disputeManager));
        composer = new EventComposer(address(registry));
        bus = new EventBus(address(registry), address(composer));
        settlement = new Settlement(address(bus));
        positionManager = new PositionManager();
        market = new Market(address(settlement), address(positionManager));

        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        registry.setResolverAuthorization(resolverC, true);

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function test_createResolveComposeSettleClaim_fullCanonicalFlow() public {
        // 1. Create two primitive events.
        bytes32 eventA = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.rate-decision"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
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
                quorumThreshold: 3,
                spec: abi.encode("ETH/USD > 5000 by Dec 2026")
            })
        );

        // 2. Three independent resolvers submit observations for eventB;
        //    two suffice for eventA's lower quorum threshold.
        vm.prank(resolverA);
        registry.submitObservation(eventA, abi.encode(true), keccak256("evidence-a1"));
        vm.prank(resolverB);
        registry.submitObservation(eventA, abi.encode(true), keccak256("evidence-a2"));

        vm.prank(resolverA);
        registry.submitObservation(eventB, abi.encode(true), keccak256("evidence-b1"));
        vm.prank(resolverB);
        registry.submitObservation(eventB, abi.encode(true), keccak256("evidence-b2"));
        vm.prank(resolverC);
        registry.submitObservation(eventB, abi.encode(true), keccak256("evidence-b3"));

        assertEq(uint8(registry.getEvent(eventA)), uint8(IEventRegistry.EventStatus.ProposedOutcome));
        assertEq(uint8(registry.getEvent(eventB)), uint8(IEventRegistry.EventStatus.ProposedOutcome));

        // 3. Undisputed -> finalize once each event's dispute window elapses.
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(eventA);
        registry.finalize(eventB);
        assertTrue(registry.isFinalized(eventA));
        assertTrue(registry.isFinalized(eventB));

        // 4. Compose AND / WITHIN(48h) over the two primitives.
        bytes32[] memory operands = new bytes32[](2);
        operands[0] = eventA;
        operands[1] = eventB;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({op: IEventComposer.Op.Within, operands: operands, window: 48 hours})
        );

        (bool resolved, bool outcome) = composer.tryResolve(compositeId);
        assertTrue(resolved);
        assertTrue(outcome); // both true, finalized in the same block => within window

        assertTrue(bus.isAvailable(compositeId));

        // 5. A derivatives Market references the composite event; two users
        //    take opposing positions.
        bytes32 marketId = market.createMarket(compositeId);
        vm.prank(alice);
        market.depositCollateral{value: 1 ether}(marketId, true); // backs YES
        vm.prank(bob);
        market.depositCollateral{value: 1 ether}(marketId, false); // backs NO

        // 6. Settle against the finalized composite outcome and claim.
        market.settle(marketId);

        uint256 aliceBalanceBefore = alice.balance;
        vm.prank(alice);
        market.claim(marketId);
        assertEq(alice.balance, aliceBalanceBefore + 2 ether);
    }
}
