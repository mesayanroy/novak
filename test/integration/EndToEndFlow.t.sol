// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EventRegistry } from "../../contracts/EventRegistry.sol";
import { DisputeManager } from "../../contracts/DisputeManager.sol";
import { EventComposer } from "../../contracts/EventComposer.sol";
import { EventBus } from "../../contracts/EventBus.sol";
import { Settlement } from "../../derivatives/Settlement.sol";
import { PositionManager } from "../../derivatives/PositionManager.sol";
import { Market } from "../../derivatives/Market.sol";
import { MockUSDG } from "../../contracts/mocks/MockUSDG.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";
import { IEventComposer } from "../../contracts/interfaces/IEventComposer.sol";

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
    MockUSDG internal usdg;

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
        usdg = new MockUSDG();
        market = new Market(
            address(settlement), address(positionManager), address(usdg), address(this), 100
        );
        positionManager.setMarket(address(market));

        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        registry.setResolverAuthorization(resolverC, true);

        usdg.mint(alice, 1_000e6);
        usdg.mint(bob, 1_000e6);
        vm.prank(alice);
        usdg.approve(address(market), type(uint256).max);
        vm.prank(bob);
        usdg.approve(address(market), type(uint256).max);
    }

    function test_createResolveComposeSettleClaim_fullCanonicalFlow() public {
        uint64 opensAt = uint64(block.timestamp + 1 hours);

        // 1. Create two primitive events whose observation windows open in 1h.
        bytes32 eventA = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("macro.fomc.v1"),
                openTimestamp: opensAt,
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: abi.encode("Fed holds rates in Dec 2026")
            })
        );
        bytes32 eventB = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("chainlink.price-at.v1"),
                openTimestamp: opensAt,
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 3,
                spec: abi.encode("NVDA >= 250 at close")
            })
        );

        // 2. Compose WITHIN(48h) over the two primitives — composites can be
        //    defined before their operands resolve.
        bytes32[] memory operands = new bytes32[](2);
        operands[0] = eventA;
        operands[1] = eventB;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Within, operands: operands, window: 48 hours
            })
        );

        // 3. A Market references the composite; trading closes when the
        //    observation windows open. Two users take opposing positions.
        bytes32 marketId =
            market.createMarket(compositeId, opensAt, "Fed holds WITHIN 48h of NVDA >= 250?");
        vm.prank(alice);
        market.depositCollateral(marketId, true, 100e6); // backs YES
        vm.prank(bob);
        market.depositCollateral(marketId, false, 100e6); // backs NO

        // 4. Window opens. Three resolvers observe eventB; two suffice for eventA.
        vm.warp(opensAt);
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

        assertEq(
            uint8(registry.getEvent(eventA)), uint8(IEventRegistry.EventStatus.ProposedOutcome)
        );
        assertEq(
            uint8(registry.getEvent(eventB)), uint8(IEventRegistry.EventStatus.ProposedOutcome)
        );

        // 5. Undisputed -> finalize once each event's dispute window elapses.
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(eventA);
        registry.finalize(eventB);
        assertTrue(registry.isFinalized(eventA));
        assertTrue(registry.isFinalized(eventB));

        // 6. Resolve the composite (anyone may poke it).
        (bool resolved, bool outcome) = composer.tryResolve(compositeId);
        assertTrue(resolved);
        assertTrue(outcome); // both true, finalized in the same block => within window
        assertTrue(bus.isAvailable(compositeId));

        // 7. Settle against the finalized composite outcome and claim.
        market.settle(marketId);

        uint256 fee = (100e6 * 100) / 10_000;
        uint256 aliceBalanceBefore = usdg.balanceOf(alice);
        vm.prank(alice);
        market.claim(marketId);
        assertEq(usdg.balanceOf(alice), aliceBalanceBefore + 200e6 - fee);
        assertEq(usdg.balanceOf(address(this)), fee); // this test contract is the treasury
    }
}
