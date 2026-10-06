// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EventRegistry } from "../../contracts/EventRegistry.sol";
import { EventComposer } from "../../contracts/EventComposer.sol";
import { DisputeManager } from "../../contracts/DisputeManager.sol";
import { TreasuryVault } from "../../contracts/TreasuryVault.sol";
import { MockUSDG } from "../../contracts/mocks/MockUSDG.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";
import { IEventComposer } from "../../contracts/interfaces/IEventComposer.sol";

contract TreasuryVaultTest is Test {
    EventRegistry internal registry;
    EventComposer internal composer;
    DisputeManager internal dm;
    TreasuryVault internal vault;
    MockUSDG internal usdg;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);
    address internal resolverC = address(0xC0FFEE);
    address internal attacker = address(0xBAD);
    address internal market = address(0x3A12); // stands in for a fee-paying consumer

    uint256 internal constant USDG = 1e6;
    uint256 internal disputeBond;
    uint256 internal tier1Bond;

    function setUp() public {
        usdg = new MockUSDG();
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
        vault =
            new TreasuryVault(address(usdg), address(registry), address(composer), address(this));
        dm = new DisputeManager(address(registry), address(vault), 0.01 ether);
        registry.setDisputeManager(address(dm));
        vault.setDisputeManager(address(dm));

        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        registry.setResolverAuthorization(resolverC, true);

        disputeBond = dm.DISPUTE_BOND();
        tier1Bond = dm.TIER1_BOND();
        vm.deal(attacker, 1 ether);
        vm.deal(resolverA, 1 ether);
        vm.deal(resolverB, 1 ether);
        vm.deal(resolverC, 1 ether);

        usdg.mint(market, 10_000 * USDG);
        vm.prank(market);
        usdg.approve(address(vault), type(uint256).max);
    }

    function _spec() internal view returns (IEventRegistry.EventSpec memory) {
        return IEventRegistry.EventSpec({
            specVersion: 1,
            sourceId: keccak256("chainlink.price-at.v1"),
            openTimestamp: uint64(block.timestamp),
            observationDeadline: uint64(block.timestamp + 1 days),
            disputeWindowSeconds: 1 hours,
            quorumThreshold: 2,
            spec: ""
        });
    }

    function _observe(address r, bytes32 id, bool outcome) internal {
        vm.prank(r);
        registry.submitObservation(id, abi.encode(outcome), keccak256(abi.encode(r, id)));
    }

    function _deposit(bytes32 id, uint256 amount) internal {
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = id;
        vm.prank(market);
        vault.depositFees(ids, amount);
    }

    /// C says false, A and B say true -> proposed true -> finalized undisputed.
    function _undisputedTrue() internal returns (bytes32 id) {
        id = registry.createEvent(_spec());
        _observe(resolverC, id, false);
        _observe(resolverA, id, true);
        _observe(resolverB, id, true);
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(id);
    }

    // --- Registry views used by the vault ---

    function test_registry_recordsObservedOutcomes() public {
        bytes32 id = _undisputedTrue();
        (bool submitted, bool outcome) = registry.observedOutcome(id, resolverA);
        assertTrue(submitted);
        assertTrue(outcome);
        (submitted, outcome) = registry.observedOutcome(id, resolverC);
        assertTrue(submitted);
        assertFalse(outcome);
        assertEq(registry.observedOutcomeCount(id, true), 2);
        assertEq(registry.observedOutcomeCount(id, false), 1);
    }

    function test_registry_createEventsBatch() public {
        IEventRegistry.EventSpec[] memory specs = new IEventRegistry.EventSpec[](3);
        for (uint256 i = 0; i < 3; i++) {
            specs[i] = _spec();
        }
        bytes32[] memory ids = registry.createEvents(specs);
        assertEq(ids.length, 3);
        for (uint256 i = 0; i < 3; i++) {
            assertEq(uint8(registry.getEvent(ids[i])), uint8(IEventRegistry.EventStatus.Open));
        }
        assertTrue(ids[0] != ids[1] && ids[1] != ids[2]);
    }

    // --- Thirds ---

    function test_undisputed_thirds_resolvers_insurance_treasury() public {
        bytes32 id = _undisputedTrue();
        _deposit(id, 300 * USDG);
        vault.allocate(id);

        assertEq(vault.claimableResolverReward(id, resolverA), 50 * USDG); // 100 / 2 correct
        assertEq(vault.claimableResolverReward(id, resolverB), 50 * USDG);
        assertEq(vault.claimableResolverReward(id, resolverC), 0, "wrong resolver earns nothing");
        assertEq(vault.insuranceReserve(), 100 * USDG, "undisputed: committee third -> insurance");
        assertEq(vault.treasuryBalance(), 100 * USDG);

        vm.prank(resolverA);
        vault.claimResolverReward(id);
        assertEq(usdg.balanceOf(resolverA), 50 * USDG);
        vm.prank(resolverA);
        vm.expectRevert(bytes("TreasuryVault: nothing to claim"));
        vault.claimResolverReward(id);
        vm.prank(resolverC);
        vm.expectRevert(bytes("TreasuryVault: nothing to claim"));
        vault.claimResolverReward(id);
    }

    function test_disputed_committeeThird_withInsuranceTopUp() public {
        // Seed the insurance reserve with 100 USDG from an undisputed event.
        bytes32 seeded = _undisputedTrue();
        _deposit(seeded, 300 * USDG);
        vault.allocate(seeded);
        assertEq(vault.insuranceReserve(), 100 * USDG);

        // A and B propose "true"; the committee overturns to "false" (A, C vs B).
        bytes32 id = registry.createEvent(_spec());
        _observe(resolverA, id, true);
        _observe(resolverB, id, true);
        vm.prank(attacker);
        dm.dispute{ value: disputeBond }(id);
        vm.prank(resolverA);
        dm.submitTier1Vote{ value: tier1Bond }(id, false);
        vm.prank(resolverB);
        dm.submitTier1Vote{ value: tier1Bond }(id, true);
        vm.prank(resolverC);
        dm.submitTier1Vote{ value: tier1Bond }(id, false); // 2/3 false -> converges
        assertTrue(registry.isFinalized(id));

        _deposit(id, 300 * USDG);
        vault.allocate(id);

        // Nobody OBSERVED "false" -> resolver third to treasury.
        assertEq(vault.claimableResolverReward(id, resolverA), 0);
        // Committee third (100) + insurance top-up (100) split between A and C.
        assertEq(vault.claimableCommitteeReward(id, resolverA), 100 * USDG);
        assertEq(vault.claimableCommitteeReward(id, resolverC), 100 * USDG);
        assertEq(vault.claimableCommitteeReward(id, resolverB), 0, "voted against the outcome");
        assertEq(vault.insuranceReserve(), 0);
        assertEq(vault.treasuryBalance(), 100 * USDG + 200 * USDG);

        vm.prank(resolverC);
        vault.claimCommitteeReward(id);
        assertEq(usdg.balanceOf(resolverC), 100 * USDG);
    }

    function test_expiredEvent_allFeesToTreasury() public {
        bytes32 id = registry.createEvent(_spec());
        _deposit(id, 90 * USDG);
        vm.expectRevert(bytes("TreasuryVault: event not decided"));
        vault.allocate(id);

        vm.warp(block.timestamp + 1 days + 1);
        registry.expire(id);
        vault.allocate(id);
        assertEq(vault.treasuryBalance(), 90 * USDG);
        assertEq(vault.insuranceReserve(), 0);
    }

    function test_compositeFees_splitAcrossPrimitiveOperands() public {
        bytes32 a = registry.createEvent(_spec());
        bytes32 b = registry.createEvent(_spec());
        bytes32[] memory ops = new bytes32[](2);
        ops[0] = a;
        ops[1] = b;
        bytes32 c = composer.createComposite(
            IEventComposer.CompositeSpec({ op: IEventComposer.Op.And, operands: ops, window: 0 })
        );
        _deposit(c, 101 * USDG);
        assertEq(vault.pendingFees(a), 50_500_000);
        assertEq(vault.pendingFees(b), 50_500_000);
        assertEq(vault.treasuryBalance(), 0);
    }

    function test_unknownEventId_goesToTreasury() public {
        _deposit(keccak256("nope"), 10 * USDG);
        assertEq(vault.treasuryBalance(), 10 * USDG);
    }

    // --- Dispute-bond ETH third ---

    function test_sweepDisputeProceeds_pullsForfeitedBondThird() public {
        bytes32 id = registry.createEvent(_spec());
        _observe(resolverA, id, true);
        _observe(resolverB, id, true);
        vm.prank(attacker);
        dm.dispute{ value: disputeBond }(id); // frivolous: committee upholds
        vm.prank(resolverA);
        dm.submitTier1Vote{ value: tier1Bond }(id, true);
        vm.prank(resolverB);
        dm.submitTier1Vote{ value: tier1Bond }(id, true);

        uint256 credited = dm.pendingWithdrawals(address(vault));
        assertEq(credited, disputeBond - disputeBond / 3);
        vault.sweepDisputeProceeds();
        assertEq(address(vault).balance, credited);
    }

    // --- Owner ---

    function test_onlyOwnerWithdrawsTreasury() public {
        _deposit(keccak256("nope"), 10 * USDG);
        vm.prank(attacker);
        vm.expectRevert(bytes("TreasuryVault: not owner"));
        vault.withdrawTreasury(attacker, 1);
        vault.withdrawTreasury(address(0xD00D), 10 * USDG);
        assertEq(usdg.balanceOf(address(0xD00D)), 10 * USDG);
        vm.expectRevert(bytes("TreasuryVault: exceeds treasury"));
        vault.withdrawTreasury(address(0xD00D), 1);
    }

    // --- Conservation ---

    /// @dev Every deposited unit ends up claimable by someone, in the
    ///      treasury, or in insurance — never created, never lost.
    function testFuzz_conservation(uint64 amount) public {
        uint256 amt = bound(amount, 1, 5_000 * USDG);
        bytes32 id = _undisputedTrue();
        _deposit(id, amt);
        vault.allocate(id);

        uint256 claimA = vault.claimableResolverReward(id, resolverA);
        uint256 claimB = vault.claimableResolverReward(id, resolverB);
        TreasuryVault.EventRewards memory r = vault.getRewards(id);
        assertLe(claimA + claimB, r.resolverPool);
        assertEq(r.resolverPool + vault.insuranceReserve() + vault.treasuryBalance(), amt);

        if (claimA > 0) {
            vm.prank(resolverA);
            vault.claimResolverReward(id);
        }
        if (claimB > 0) {
            vm.prank(resolverB);
            vault.claimResolverReward(id);
        }
        assertGe(usdg.balanceOf(address(vault)), vault.insuranceReserve() + vault.treasuryBalance());
    }
}
