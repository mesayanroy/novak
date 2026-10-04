// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EventRegistry } from "../../contracts/EventRegistry.sol";
import { EventComposer } from "../../contracts/EventComposer.sol";
import { EventBus } from "../../contracts/EventBus.sol";
import { TreasuryVault } from "../../contracts/TreasuryVault.sol";
import { MockUSDG } from "../../contracts/mocks/MockUSDG.sol";
import { Settlement } from "../../derivatives/Settlement.sol";
import { DistributionMarket } from "../../derivatives/DistributionMarket.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";

contract DistributionMarketTest is Test {
    EventRegistry internal registry;
    EventComposer internal composer;
    EventBus internal bus;
    Settlement internal settlement;
    TreasuryVault internal vault;
    MockUSDG internal usdg;
    DistributionMarket internal dist;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);
    address internal creator = address(0xC4EA);
    address internal alice = address(0x1);
    address internal bob = address(0x2);

    uint256 internal constant USDG = 1e6;
    uint256 internal constant B = 1_000 * USDG; // LMSR liquidity
    uint256 internal constant FEE_BPS = 100;

    bytes32[] internal ladder; // 3 boundaries -> 4 buckets
    uint64 internal opensAt;

    function setUp() public {
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
        bus = new EventBus(address(registry), address(composer));
        settlement = new Settlement(address(bus));
        usdg = new MockUSDG();
        vault =
            new TreasuryVault(address(usdg), address(registry), address(composer), address(this));
        dist = new DistributionMarket(address(settlement), address(usdg), address(vault), FEE_BPS);

        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);

        address[3] memory users = [creator, alice, bob];
        for (uint256 i = 0; i < users.length; i++) {
            for (uint256 k = 0; k < 5; k++) {
                usdg.mint(users[i], 10_000 * USDG);
            }
            vm.prank(users[i]);
            usdg.approve(address(dist), type(uint256).max);
        }

        opensAt = uint64(block.timestamp + 1 hours);
        IEventRegistry.EventSpec[] memory specs = new IEventRegistry.EventSpec[](3);
        for (uint256 i = 0; i < 3; i++) {
            specs[i] = IEventRegistry.EventSpec({
                specVersion: 2,
                sourceId: keccak256("chainlink.price-at.v1"),
                openTimestamp: opensAt,
                observationDeadline: opensAt + 1 days,
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: abi.encode(i) // stands in for "NVDA >= threshold_i at T"
            });
        }
        ladder = registry.createEvents(specs);
    }

    function _create() internal returns (bytes32 id) {
        vm.prank(creator);
        id = dist.createMarket("Where will NVDA be at T?", ladder, opensAt, B);
    }

    function _resolve(bool[3] memory outcomes) internal {
        if (block.timestamp < opensAt) vm.warp(opensAt);
        for (uint256 i = 0; i < 3; i++) {
            bytes memory payload = abi.encode(outcomes[i], uint64(opensAt));
            vm.prank(resolverA);
            registry.submitObservation(ladder[i], payload, keccak256("a"));
            vm.prank(resolverB);
            registry.submitObservation(ladder[i], payload, keccak256("b"));
        }
        vm.warp(block.timestamp + 1 hours + 1);
        for (uint256 i = 0; i < 3; i++) {
            registry.finalize(ladder[i]);
        }
    }

    function _buy(address who, bytes32 id, uint8 bucket, uint256 amount)
        internal
        returns (uint256)
    {
        vm.prank(who);
        return dist.buy(id, bucket, amount, 0);
    }

    function _sumPrices(bytes32 id) internal view returns (uint256 s) {
        uint256[] memory p = dist.prices(id);
        for (uint256 i = 0; i < p.length; i++) {
            s += p[i];
        }
    }

    // --- Architecture ---

    function test_holdsOnlySettlementReference() public view {
        assertEq(address(dist.settlement()), address(settlement));
        assertEq(address(settlement.eventBus()), address(bus));
    }

    // --- Create & price ---

    function test_create_pullsLmsrSubsidy_uniformPrices() public {
        uint256 before = usdg.balanceOf(creator);
        bytes32 id = _create();
        uint256 subsidy = before - usdg.balanceOf(creator);
        // b·ln(4) ≈ 1386.294361 USDG, rounded up + 1 unit margin
        assertApproxEqAbs(subsidy, 1_386_294_363, 2);
        uint256[] memory p = dist.prices(id);
        assertEq(p.length, 4);
        for (uint256 i = 0; i < 4; i++) {
            assertApproxEqAbs(p[i], 0.25e18, 1);
        }
        assertEq(dist.marketCount(), 1);
    }

    function test_create_rejectsDecidedBoundary() public {
        _resolve([true, true, false]);
        vm.prank(creator);
        vm.expectRevert(bytes("DistributionMarket: outcome known"));
        dist.createMarket("q", ladder, uint64(block.timestamp + 1 days), B);
    }

    function test_buy_movesPrice_pricesSumToOne() public {
        bytes32 id = _create();
        uint256 shares = _buy(alice, id, 2, 200 * USDG);
        assertGt(shares, 200 * USDG, "bought below 1 USDG/share");
        uint256[] memory p = dist.prices(id);
        assertGt(p[2], 0.25e18);
        assertLt(p[0], 0.25e18);
        assertApproxEqAbs(_sumPrices(id), 1e18, 4);
        assertEq(dist.sharesOf(id, alice)[2], shares);
    }

    function test_roundTrip_losesOnlyFeesAndRounding() public {
        bytes32 id = _create();
        uint256 spent = 300 * USDG;
        uint256 shares = _buy(alice, id, 1, spent);
        vm.prank(alice);
        uint256 back = dist.sell(id, 1, shares, 0);
        uint256 netIn = spent - (spent * FEE_BPS) / 10_000;
        uint256 expectedBack = netIn - (netIn * FEE_BPS) / 10_000;
        assertApproxEqAbs(back, expectedBack, 3);
        assertLe(back, expectedBack);
    }

    function test_slippageGuard() public {
        bytes32 id = _create();
        (uint256 quoted,) = dist.quoteBuy(id, 0, 100 * USDG);
        vm.prank(alice);
        vm.expectRevert(bytes("DistributionMarket: slippage"));
        dist.buy(id, 0, 100 * USDG, quoted + 1);
    }

    // --- Trading window ---

    function test_noTradingAfterClose() public {
        bytes32 id = _create();
        vm.warp(opensAt);
        vm.prank(alice);
        vm.expectRevert(bytes("DistributionMarket: trading closed"));
        dist.buy(id, 0, 10 * USDG, 0);
    }

    function test_noTradingOnceAnyBoundaryDecided_evenBeforeClose() public {
        vm.prank(creator);
        bytes32 id = dist.createMarket("late close", ladder, opensAt + 30 days, B);
        _resolve([true, false, false]);
        vm.prank(alice);
        vm.expectRevert(bytes("DistributionMarket: outcome known"));
        dist.buy(id, 1, 10 * USDG, 0);
    }

    // --- Settlement ---

    function test_settle_winningBucket_redeem_feesToVault_leftoverToCreator() public {
        bytes32 id = _create();
        uint256 aShares = _buy(alice, id, 2, 400 * USDG); // NVDA in bucket 2
        uint256 bShares = _buy(bob, id, 0, 300 * USDG);
        assertGt(bShares, 0);

        _resolve([true, true, false]); // >= t0, >= t1, < t2 -> bucket 2
        uint256 creatorBefore = usdg.balanceOf(creator);
        dist.settle(id);

        DistributionMarket.MarketInfo memory m = dist.getMarket(id);
        assertEq(uint8(m.status), uint8(DistributionMarket.Status.Settled));
        assertEq(m.winningBucket, 2);
        assertEq(m.liability, aShares);
        assertGt(usdg.balanceOf(creator), creatorBefore, "creator gets leftover");

        uint256 fees = (400 * USDG * FEE_BPS) / 10_000 + (300 * USDG * FEE_BPS) / 10_000;
        assertEq(usdg.balanceOf(address(vault)), fees);
        assertEq(
            vault.pendingFees(ladder[0]) + vault.pendingFees(ladder[1])
                + vault.pendingFees(ladder[2]) + vault.treasuryBalance(),
            fees
        );

        uint256 aliceBefore = usdg.balanceOf(alice);
        vm.prank(alice);
        dist.redeem(id);
        assertEq(usdg.balanceOf(alice) - aliceBefore, aShares, "1 USDG per winning share");
        vm.prank(bob);
        vm.expectRevert(bytes("DistributionMarket: nothing to redeem"));
        dist.redeem(id);
        assertEq(usdg.balanceOf(address(dist)), 0, "fully paid out");
    }

    function test_inconsistentLadder_voids_paysOneOverN() public {
        bytes32 id = _create();
        uint256 aShares = _buy(alice, id, 3, 200 * USDG);
        _resolve([true, false, true]); // TRUE above a FALSE
        dist.settle(id);
        assertEq(uint8(dist.getMarket(id).status), uint8(DistributionMarket.Status.Voided));
        assertEq(dist.payoutOf(id, alice), aShares / 4);
        vm.prank(alice);
        dist.redeem(id);
    }

    function test_voidedBoundary_voidsMarket() public {
        bytes32 id = _create();
        _buy(alice, id, 1, 50 * USDG);
        vm.warp(opensAt + 1 days + 1);
        for (uint256 i = 0; i < 3; i++) {
            registry.expire(ladder[i]); // nobody observed
        }
        dist.settle(id);
        assertEq(uint8(dist.getMarket(id).status), uint8(DistributionMarket.Status.Voided));
    }

    function test_settle_revertsWhilePending() public {
        bytes32 id = _create();
        vm.expectRevert(bytes("DistributionMarket: not finalized"));
        dist.settle(id);
    }

    // --- Solvency ---

    /// @dev Random trades by two traders, any outcome: every redemption is
    ///      paid in full and the market never ends owing more than it holds.
    function testFuzz_solvency(uint256 seed, uint8 outcomeSeed) public {
        bytes32 id = _create();
        address[2] memory traders = [alice, bob];
        for (uint256 step = 0; step < 12; step++) {
            uint256 r = uint256(keccak256(abi.encode(seed, step)));
            address who = traders[r % 2];
            uint8 bucket = uint8((r >> 8) % 4);
            uint256[] memory held = dist.sharesOf(id, who);
            if ((r >> 16) % 3 == 0 && held[bucket] > 0) {
                uint256 amt = (held[bucket] * (((r >> 24) % 100) + 1)) / 100;
                vm.prank(who);
                dist.sell(id, bucket, amt, 0);
            } else {
                _buy(who, id, bucket, (((r >> 32) % 2_000) + 1) * USDG);
            }
        }

        bool[3] memory outcomes;
        uint8 k = outcomeSeed % 5; // 0-3 consistent buckets, 4 = inconsistent ladder
        if (k == 4) {
            outcomes = [true, false, true];
        } else {
            for (uint256 i = 0; i < 3; i++) {
                outcomes[i] = i < k;
            }
        }
        _resolve(outcomes);
        dist.settle(id);

        for (uint256 i = 0; i < 2; i++) {
            if (dist.payoutOf(id, traders[i]) > 0) {
                vm.prank(traders[i]);
                dist.redeem(id);
            }
        }
        assertLe(dist.getMarket(id).reserve, usdg.balanceOf(address(dist)));
        assertLe(usdg.balanceOf(address(dist)), 4, "only rounding dust remains");
    }
}
