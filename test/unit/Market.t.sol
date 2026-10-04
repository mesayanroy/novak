// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EventRegistry } from "../../contracts/EventRegistry.sol";
import { EventComposer } from "../../contracts/EventComposer.sol";
import { EventBus } from "../../contracts/EventBus.sol";
import { MockUSDG } from "../../contracts/mocks/MockUSDG.sol";
import { TreasuryVault } from "../../contracts/TreasuryVault.sol";
import { Settlement } from "../../derivatives/Settlement.sol";
import { PositionManager } from "../../derivatives/PositionManager.sol";
import { Market } from "../../derivatives/Market.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";

contract MarketTest is Test {
    EventRegistry internal registry;
    EventComposer internal composer;
    EventBus internal bus;
    Settlement internal settlement;
    PositionManager internal positionManager;
    Market internal market;
    MockUSDG internal usdg;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);
    address internal alice = address(0x1);
    address internal bob = address(0x2);
    address internal carol = address(0x3);
    TreasuryVault internal vault;
    address internal treasury; // = address(vault)

    uint256 internal constant FEE_BPS = 100; // 1%
    uint256 internal constant ONE = 1e6; // 1 USDG

    function setUp() public {
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
        bus = new EventBus(address(registry), address(composer));
        settlement = new Settlement(address(bus));
        positionManager = new PositionManager();
        usdg = new MockUSDG();
        vault =
            new TreasuryVault(address(usdg), address(registry), address(composer), address(this));
        treasury = address(vault);
        market = new Market(
            address(settlement), address(positionManager), address(usdg), treasury, FEE_BPS
        );
        positionManager.setMarket(address(market));

        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);

        address[3] memory traders = [alice, bob, carol];
        for (uint256 i = 0; i < traders.length; i++) {
            usdg.mint(traders[i], 10_000 * ONE);
            vm.prank(traders[i]);
            usdg.approve(address(market), type(uint256).max);
        }
    }

    function _createEvent() internal returns (bytes32 eventId) {
        eventId = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("chainlink.price-at.v1"),
                openTimestamp: uint64(block.timestamp + 1 hours),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: abi.encode("NVDA >= 250 at close")
            })
        );
    }

    function _createMarket(bytes32 eventId) internal returns (bytes32) {
        // Trading closes exactly when the event's observation window opens.
        return market.createMarket(eventId, uint64(block.timestamp + 1 hours), "NVDA >= $250?");
    }

    function _finalize(bytes32 eventId, bool outcome) internal {
        IEventRegistry.EventSpec memory spec = registry.getEventSpec(eventId);
        if (block.timestamp < spec.openTimestamp) vm.warp(spec.openTimestamp);
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(outcome), keccak256("ev-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(outcome), keccak256("ev-b"));
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(eventId);
    }

    function _deposit(address trader, bytes32 marketId, bool yes, uint256 amount) internal {
        vm.prank(trader);
        market.depositCollateral(marketId, yes, amount);
    }

    // --- Creation ---

    function test_createMarket_recordsFields() public {
        bytes32 eventId = _createEvent();
        bytes32 marketId = _createMarket(eventId);

        Market.MarketDef memory m = market.getMarket(marketId);
        assertEq(m.eventId, eventId);
        assertEq(m.creator, address(this));
        assertEq(m.tradingClosesAt, uint64(block.timestamp + 1 hours));
        assertEq(m.question, "NVDA >= $250?");
        assertEq(uint8(m.status), uint8(Market.MarketStatus.Open));
    }

    function test_createMarket_revertsForPastCloseTime() public {
        bytes32 eventId = _createEvent();
        vm.expectRevert(bytes("Market: close time in past"));
        market.createMarket(eventId, uint64(block.timestamp), "q");
    }

    function test_createMarket_revertsForAlreadyDecidedEvent() public {
        bytes32 eventId = _createEvent();
        _finalize(eventId, true);
        vm.expectRevert(bytes("Market: event already decided"));
        market.createMarket(eventId, uint64(block.timestamp + 1 days), "q");
    }

    function test_enumeration_listsMarketsInCreationOrder() public {
        bytes32 eventId = _createEvent();
        bytes32 m1 = _createMarket(eventId);
        bytes32 m2 = _createMarket(eventId); // same event, same block: still distinct
        assertTrue(m1 != m2);
        assertEq(market.marketCount(), 2);

        bytes32[] memory ids = market.getMarketIds(0, 10);
        assertEq(ids.length, 2);
        assertEq(ids[0], m1);
        assertEq(ids[1], m2);
        assertEq(market.getMarketIds(1, 10).length, 1);
        assertEq(market.getMarketIds(5, 10).length, 0);
    }

    // Architectural regression guard: Market must only reference Settlement (which
    // itself only holds an IEventBus reference), never the Registry/Composer/a
    // resolver directly.
    function test_market_onlyHoldsSettlementReference() public view {
        assertEq(address(market.settlement()), address(settlement));
        assertEq(address(settlement.eventBus()), address(bus));
    }

    // --- Settlement ---

    function test_settle_revertsIfEventNotFinalized() public {
        bytes32 marketId = _createMarket(_createEvent());
        vm.expectRevert(bytes("Market: event not finalized"));
        market.settle(marketId);
    }

    function test_fullFlow_winnerTakesLoserPoolMinusFee() public {
        bytes32 eventId = _createEvent();
        bytes32 marketId = _createMarket(eventId);

        _deposit(alice, marketId, true, 100 * ONE); // YES
        _deposit(bob, marketId, false, 100 * ONE); // NO

        _finalize(eventId, true); // YES wins
        market.settle(marketId);

        uint256 fee = (100 * ONE * FEE_BPS) / 10_000;
        assertEq(usdg.balanceOf(treasury), fee);
        assertEq(vault.pendingFees(eventId), fee, "fee attributed to the market's event");

        uint256 before = usdg.balanceOf(alice);
        assertEq(market.payoutOf(marketId, alice), 200 * ONE - fee);
        vm.prank(alice);
        market.claim(marketId);
        assertEq(usdg.balanceOf(alice), before + 200 * ONE - fee);
        assertEq(usdg.balanceOf(address(market)), 0);

        vm.prank(bob);
        vm.expectRevert(bytes("Market: nothing to claim"));
        market.claim(marketId);
    }

    function test_fullFlow_refundsEveryoneWhenNoWinningSideStaked_noFee() public {
        bytes32 eventId = _createEvent();
        bytes32 marketId = _createMarket(eventId);

        _deposit(alice, marketId, false, 100 * ONE);
        _deposit(bob, marketId, false, 200 * ONE);

        _finalize(eventId, true); // YES wins, but nobody backed YES
        market.settle(marketId);
        assertEq(usdg.balanceOf(treasury), 0);

        uint256 aliceBefore = usdg.balanceOf(alice);
        vm.prank(alice);
        market.claim(marketId);
        assertEq(usdg.balanceOf(alice), aliceBefore + 100 * ONE);

        uint256 bobBefore = usdg.balanceOf(bob);
        vm.prank(bob);
        market.claim(marketId);
        assertEq(usdg.balanceOf(bob), bobBefore + 200 * ONE);
    }

    function test_voidedEvent_marketRefundsEveryone() public {
        bytes32 eventId = _createEvent();
        bytes32 marketId = _createMarket(eventId);
        _deposit(alice, marketId, true, 100 * ONE);
        _deposit(bob, marketId, false, 50 * ONE);

        // Nobody ever observes the event -> it expires -> Bus reports Voided.
        vm.warp(block.timestamp + 1 days + 1);
        registry.expire(eventId);

        market.settle(marketId);
        assertEq(uint8(market.getMarket(marketId).status), uint8(Market.MarketStatus.Refunding));
        assertEq(usdg.balanceOf(treasury), 0);

        uint256 aliceBefore = usdg.balanceOf(alice);
        vm.prank(alice);
        market.claim(marketId);
        assertEq(usdg.balanceOf(alice), aliceBefore + 100 * ONE);

        uint256 bobBefore = usdg.balanceOf(bob);
        vm.prank(bob);
        market.claim(marketId);
        assertEq(usdg.balanceOf(bob), bobBefore + 50 * ONE);
        assertEq(usdg.balanceOf(address(market)), 0);
    }

    function test_claim_revertsWithoutSettlement() public {
        bytes32 marketId = _createMarket(_createEvent());
        _deposit(alice, marketId, true, ONE);

        vm.expectRevert(bytes("Market: not settled"));
        vm.prank(alice);
        market.claim(marketId);
    }

    function test_claim_revertsOnDoubleClaim() public {
        bytes32 eventId = _createEvent();
        bytes32 marketId = _createMarket(eventId);
        _deposit(alice, marketId, true, ONE);
        _finalize(eventId, true);
        market.settle(marketId);

        vm.startPrank(alice);
        market.claim(marketId);
        vm.expectRevert(bytes("Market: already claimed"));
        market.claim(marketId);
        vm.stopPrank();
    }

    // --- Trading window ---

    function test_closePosition_whileTradingOpen_refundsStake() public {
        bytes32 marketId = _createMarket(_createEvent());
        _deposit(alice, marketId, true, 5 * ONE);

        uint256 before = usdg.balanceOf(alice);
        vm.prank(alice);
        market.closePosition(marketId, true, 5 * ONE);
        assertEq(usdg.balanceOf(alice), before + 5 * ONE);
        assertEq(market.yesBalance(marketId, alice), 0);
    }

    /// @dev REGRESSION (fund-loss exploit in the previous version): once the
    ///      outcome was public but before anyone called `settle`, the losing
    ///      side could withdraw its full stake, leaving winners nothing.
    function test_regression_loserCannotWithdrawAfterOutcomeKnown() public {
        bytes32 eventId = _createEvent();
        bytes32 marketId = _createMarket(eventId);
        _deposit(alice, marketId, true, 100 * ONE);
        _deposit(bob, marketId, false, 100 * ONE);

        _finalize(eventId, true); // YES is now public; market not yet settled

        vm.prank(bob);
        vm.expectRevert(bytes("Market: trading closed"));
        market.closePosition(marketId, false, 100 * ONE);

        market.settle(marketId);
        uint256 before = usdg.balanceOf(alice);
        vm.prank(alice);
        market.claim(marketId);
        assertEq(usdg.balanceOf(alice) - before, 200 * ONE - (100 * ONE * FEE_BPS) / 10_000);
    }

    /// @dev REGRESSION (same root cause): late deposits on the known winner.
    function test_regression_cannotDepositAfterTradingCloses() public {
        bytes32 marketId = _createMarket(_createEvent());
        vm.warp(block.timestamp + 1 hours);
        vm.prank(carol);
        vm.expectRevert(bytes("Market: trading closed"));
        market.depositCollateral(marketId, true, ONE);
    }

    /// @dev Backstop: even if a creator set `tradingClosesAt` too late, deposits
    ///      stop the moment the Bus reports the event decided.
    function test_regression_cannotDepositOnceOutcomeAvailable_evenBeforeClose() public {
        bytes32 eventId = _createEvent();
        bytes32 marketId = market.createMarket(eventId, uint64(block.timestamp + 30 days), "late");
        _finalize(eventId, true);

        vm.prank(carol);
        vm.expectRevert(bytes("Market: outcome known"));
        market.depositCollateral(marketId, true, ONE);
    }

    // --- PositionManager access control ---

    function test_positionManager_onlyMarketCanRecord() public {
        vm.expectRevert(bytes("PositionManager: only market"));
        positionManager.recordPosition(alice, bytes32("m"), PositionManager.Side.Long, 1);
    }

    function test_positionManager_marketCanOnlyBeSetOnce() public {
        vm.expectRevert(bytes("PositionManager: market already set"));
        positionManager.setMarket(address(0xBEEF));
    }

    // --- Solvency ---

    /// @dev Payouts + fee never exceed deposits, whatever the stakes/outcome.
    function testFuzz_solvency(uint96 a, uint96 b, uint96 c, bool outcome) public {
        uint256 amtA = bound(a, 1, 3_000 * ONE);
        uint256 amtB = bound(b, 1, 3_000 * ONE);
        uint256 amtC = bound(c, 1, 3_000 * ONE);

        bytes32 eventId = _createEvent();
        bytes32 marketId = _createMarket(eventId);
        _deposit(alice, marketId, true, amtA);
        _deposit(bob, marketId, false, amtB);
        _deposit(carol, marketId, outcome, amtC);

        _finalize(eventId, outcome);
        market.settle(marketId);

        address[3] memory traders = [alice, bob, carol];
        for (uint256 i = 0; i < traders.length; i++) {
            if (market.payoutOf(marketId, traders[i]) > 0) {
                vm.prank(traders[i]);
                market.claim(marketId);
            }
        }
        // Only rounding dust (< number of winners) may remain.
        assertLe(usdg.balanceOf(address(market)), 2);
    }
}
