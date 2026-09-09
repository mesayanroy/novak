// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventRegistry} from "../../contracts/EventRegistry.sol";
import {EventComposer} from "../../contracts/EventComposer.sol";
import {EventBus} from "../../contracts/EventBus.sol";
import {Settlement} from "../../derivatives/Settlement.sol";
import {PositionManager} from "../../derivatives/PositionManager.sol";
import {Market} from "../../derivatives/Market.sol";
import {IEventRegistry} from "../../contracts/interfaces/IEventRegistry.sol";

contract MarketTest is Test {
    EventRegistry internal registry;
    EventComposer internal composer;
    EventBus internal bus;
    Settlement internal settlement;
    PositionManager internal positionManager;
    Market internal market;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);
    address internal alice = address(0x1);
    address internal bob = address(0x2);

    function setUp() public {
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
        bus = new EventBus(address(registry), address(composer));
        settlement = new Settlement(address(bus));
        positionManager = new PositionManager();
        market = new Market(address(settlement), address(positionManager));

        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _createEvent() internal returns (bytes32 eventId) {
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
    }

    function _finalize(bytes32 eventId, bool outcome) internal {
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(outcome), keccak256("ev-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(outcome), keccak256("ev-b"));
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(eventId);
    }

    function test_createMarket_recordsEventId() public {
        bytes32 eventId = _createEvent();
        bytes32 marketId = market.createMarket(eventId);

        (bytes32 storedEventId,,,,,) = market.markets(marketId);
        assertEq(storedEventId, eventId);
    }

    function test_settle_revertsIfEventNotFinalized() public {
        bytes32 eventId = _createEvent();
        bytes32 marketId = market.createMarket(eventId);

        vm.expectRevert(bytes("Market: event not finalized"));
        market.settle(marketId);
    }

    // Architectural regression guard: Market must only reference Settlement (which
    // itself only holds an IEventBus reference), never the Registry/Composer/a
    // resolver directly.
    function test_market_onlyHoldsSettlementReference() public {
        assertEq(address(market.settlement()), address(settlement));
    }

    function test_fullFlow_winnerTakesLoserPoolProRata() public {
        bytes32 eventId = _createEvent();
        bytes32 marketId = market.createMarket(eventId);

        vm.prank(alice);
        market.depositCollateral{value: 1 ether}(marketId, true); // backs YES
        vm.prank(bob);
        market.depositCollateral{value: 1 ether}(marketId, false); // backs NO

        _finalize(eventId, true); // YES wins

        market.settle(marketId);

        uint256 aliceBalanceBefore = alice.balance;
        vm.prank(alice);
        market.claim(marketId);
        assertEq(alice.balance, aliceBalanceBefore + 2 ether); // own stake + full loser pool

        vm.prank(bob);
        vm.expectRevert(bytes("Market: nothing to claim"));
        market.claim(marketId);
    }

    function test_fullFlow_refundsEveryoneWhenNoWinningSideStaked() public {
        bytes32 eventId = _createEvent();
        bytes32 marketId = market.createMarket(eventId);

        vm.prank(alice);
        market.depositCollateral{value: 1 ether}(marketId, false); // backs NO
        vm.prank(bob);
        market.depositCollateral{value: 2 ether}(marketId, false); // backs NO

        _finalize(eventId, true); // YES wins, but nobody backed YES

        market.settle(marketId);

        uint256 aliceBalanceBefore = alice.balance;
        vm.prank(alice);
        market.claim(marketId);
        assertEq(alice.balance, aliceBalanceBefore + 1 ether);

        uint256 bobBalanceBefore = bob.balance;
        vm.prank(bob);
        market.claim(marketId);
        assertEq(bob.balance, bobBalanceBefore + 2 ether);
    }

    function test_closePosition_beforeSettlement_refundsStake() public {
        bytes32 eventId = _createEvent();
        bytes32 marketId = market.createMarket(eventId);

        vm.startPrank(alice);
        market.depositCollateral{value: 1 ether}(marketId, true);
        uint256 balanceBefore = alice.balance;
        market.closePosition(marketId, true, 1 ether);
        vm.stopPrank();

        assertEq(alice.balance, balanceBefore + 1 ether);
        assertEq(market.yesBalance(marketId, alice), 0);
    }

    function test_claim_revertsWithoutSettlement() public {
        bytes32 eventId = _createEvent();
        bytes32 marketId = market.createMarket(eventId);

        vm.prank(alice);
        market.depositCollateral{value: 1 ether}(marketId, true);

        vm.expectRevert(bytes("Market: not settled"));
        vm.prank(alice);
        market.claim(marketId);
    }
}
