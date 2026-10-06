// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EventRegistry } from "../../contracts/EventRegistry.sol";
import { DisputeManager } from "../../contracts/DisputeManager.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";
import { IDisputeManager } from "../../contracts/interfaces/IDisputeManager.sol";

/// @notice Covers Gap 2 (bonded tiered escalation) and the escalation half of
///         Gap 5 (concrete quorum numbers) from docs/protocol-spec.md: Tier-1
///         convergence, Tier-1 -> Tier-2 escalation, Tier-2 -> Void, the
///         burn/reward/treasury bond math, the small-pool committee
///         fallback, and the non-convergence escalation path.
/// @dev A disputer contract that rejects ETH. Under push payments its
///      refund made every resolution path revert, leaving the event stuck
///      in `Disputed` forever.
contract RevertingDisputer {
    function fileDispute(DisputeManager dm, bytes32 eventId) external payable {
        dm.dispute{ value: msg.value }(eventId);
    }

    receive() external payable {
        revert("RevertingDisputer: no ETH");
    }
}

contract DisputeManagerTest is Test {
    /// @dev Wallet balance + ETH credited by DisputeManager but not yet
    ///      withdrawn (payouts are pull-based).
    function _owed(address a) internal view returns (uint256) {
        return a.balance + disputeManager.pendingWithdrawals(a);
    }

    EventRegistry internal registry;
    DisputeManager internal disputeManager;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);
    address internal resolverC = address(0xC0FFEE);
    address internal attacker = address(0xBAD);
    address internal treasury = address(0x7EA5);

    uint256 internal disputeBond;
    uint256 internal tier1Bond;
    uint256 internal tier2Bond;

    function setUp() public {
        registry = new EventRegistry();
        disputeManager = new DisputeManager(address(registry), treasury, 0.01 ether);
        registry.setDisputeManager(address(disputeManager));

        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        registry.setResolverAuthorization(resolverC, true);

        disputeBond = disputeManager.DISPUTE_BOND();
        tier1Bond = disputeManager.TIER1_BOND();
        tier2Bond = disputeManager.TIER2_BOND();

        vm.deal(attacker, 1 ether);
        vm.deal(resolverA, 1 ether);
        vm.deal(resolverB, 1 ether);
        vm.deal(resolverC, 1 ether);
    }

    function _proposedTrueEvent() internal returns (bytes32 eventId) {
        eventId = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.price-feed"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: abi.encode("dispute-manager-placeholder")
            })
        );
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-b"));
    }

    // --- dispute() entry point ---

    function test_dispute_revertsIfNotProposedOutcome() public {
        bytes32 eventId = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.price-feed"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: abi.encode("still open")
            })
        );

        vm.prank(attacker);
        vm.expectRevert(bytes("DisputeManager: not disputable"));
        disputeManager.dispute{ value: disputeBond }(eventId);
    }

    function test_dispute_revertsAfterWindowCloses() public {
        bytes32 eventId = _proposedTrueEvent();
        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(attacker);
        vm.expectRevert(bytes("DisputeManager: dispute window closed"));
        disputeManager.dispute{ value: disputeBond }(eventId);
    }

    function test_dispute_revertsOnIncorrectBond() public {
        bytes32 eventId = _proposedTrueEvent();

        vm.prank(attacker);
        vm.expectRevert(bytes("DisputeManager: incorrect bond"));
        disputeManager.dispute{ value: disputeBond - 1 }(eventId);
    }

    // --- Tier-1 convergence + bond math ---

    /// @dev Small pool (3 resolvers) means the Tier-1 committee is the whole
    ///      pool. Original proposal was "true"; the committee OVERTURNS it
    ///      to "false" (2 of 3 = 66.67% >= 66%), so the disputer was right
    ///      and is refunded in full. The one losing voter's bond splits
    ///      cleanly into burn/treasury/reward-to-winners with zero dust.
    function test_tier1_converges_overturnsProposal_refundsDisputerAndRewardsWinners() public {
        bytes32 eventId = _proposedTrueEvent();

        vm.prank(attacker);
        disputeManager.dispute{ value: disputeBond }(eventId);

        address[] memory committee = disputeManager.getCommittee(eventId, 1);
        assertEq(committee.length, 3, "small pool -> committee is the whole pool");

        uint256 attackerBalanceBefore = _owed(attacker);
        uint256 treasuryBalanceBefore = _owed(treasury);
        uint256 burnBalanceBefore = disputeManager.BURN_ADDRESS().balance;
        // Captured before either A or B has paid their tier-1 bond, so the
        // expected final balance is simply "before + net effect of the
        // whole round" (pay bond, get bond + reward back).
        uint256 aBalanceBefore = _owed(resolverA);
        uint256 bBalanceBefore = _owed(resolverB);

        // C votes with the (losing) original outcome first, then A and B
        // vote to overturn it — B's vote is the one that crosses 66%.
        vm.prank(resolverC);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);
        vm.prank(resolverA);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, false);
        vm.prank(resolverB);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, false);

        assertTrue(registry.isFinalized(eventId));
        IEventRegistry.Outcome memory outcome = registry.getOutcome(eventId);
        assertFalse(abi.decode(outcome.outcomeData, (bool)));

        // Losing pool = 1 * tier1Bond, split into thirds with zero dust.
        uint256 losingPool = tier1Bond;
        uint256 burnShare = losingPool / 3;
        uint256 treasuryShare = losingPool / 3;
        uint256 rewardPool = losingPool - burnShare - treasuryShare;
        uint256 perWinner = rewardPool / 2;

        assertEq(disputeManager.BURN_ADDRESS().balance, burnBalanceBefore + burnShare);
        assertEq(_owed(treasury), treasuryBalanceBefore + treasuryShare);
        assertEq(_owed(resolverA), aBalanceBefore + perWinner);
        assertEq(_owed(resolverB), bBalanceBefore + perWinner);

        // Disputer was right (committee overturned the proposal) -> full refund.
        assertEq(_owed(attacker), attackerBalanceBefore + disputeBond);
    }

    /// @dev Same small pool, but the committee UPHOLDS the original "true"
    ///      proposal (no losing voter this time) — the disputer's bond is
    ///      forfeited via the burn/treasury split since they challenged a
    ///      correct outcome.
    function test_tier1_converges_upholdsProposal_forfeitsDisputerBond() public {
        bytes32 eventId = _proposedTrueEvent();

        vm.prank(attacker);
        disputeManager.dispute{ value: disputeBond }(eventId);

        uint256 treasuryBalanceBefore = _owed(treasury);
        uint256 burnBalanceBefore = disputeManager.BURN_ADDRESS().balance;

        vm.prank(resolverA);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);
        vm.prank(resolverB);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);

        assertTrue(registry.isFinalized(eventId));
        IEventRegistry.Outcome memory outcome = registry.getOutcome(eventId);
        assertTrue(abi.decode(outcome.outcomeData, (bool)));

        uint256 dBurn = disputeBond / 3;
        uint256 dTreasury = disputeBond - dBurn;
        assertEq(disputeManager.BURN_ADDRESS().balance, burnBalanceBefore + dBurn);
        assertEq(_owed(treasury), treasuryBalanceBefore + dTreasury);
    }

    // --- Tier-1 non-convergence -> Tier-2 ---

    function test_tier1_nonConvergence_escalatesToTier2_refundsTier1BondsInFull() public {
        bytes32 eventId = _proposedTrueEvent();
        vm.prank(attacker);
        disputeManager.dispute{ value: disputeBond }(eventId);

        // 1/3 agreement on each side never reaches 66% of the 3-member committee.
        vm.prank(resolverA);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);
        vm.prank(resolverB);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, false);

        vm.warp(block.timestamp + disputeManager.TIER1_WINDOW() + 1);

        uint256 aBalanceBefore = _owed(resolverA);
        uint256 bBalanceBefore = _owed(resolverB);
        disputeManager.escalateTier2(eventId);

        // Full refund, no slashing — Tier-1 never reached a decision.
        assertEq(_owed(resolverA), aBalanceBefore + tier1Bond);
        assertEq(_owed(resolverB), bBalanceBefore + tier1Bond);

        address[] memory tier2Committee = disputeManager.getCommittee(eventId, 2);
        assertEq(tier2Committee.length, 3);

        // Event is still Disputed, not finalized/voided, mid-escalation.
        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.Disputed));
    }

    function test_escalateTier2_revertsIfWindowStillOpen() public {
        bytes32 eventId = _proposedTrueEvent();
        vm.prank(attacker);
        disputeManager.dispute{ value: disputeBond }(eventId);

        vm.expectRevert(bytes("DisputeManager: tier1 window still open"));
        disputeManager.escalateTier2(eventId);
    }

    function test_escalateTier2_revertsIfTier1AlreadyConverged() public {
        bytes32 eventId = _proposedTrueEvent();
        vm.prank(attacker);
        disputeManager.dispute{ value: disputeBond }(eventId);

        vm.prank(resolverA);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);
        vm.prank(resolverB);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);

        vm.warp(block.timestamp + disputeManager.TIER1_WINDOW() + 1);
        vm.expectRevert(bytes("DisputeManager: not escalatable"));
        disputeManager.escalateTier2(eventId);
    }

    function test_tier2_convergesAfterTier1Failure() public {
        bytes32 eventId = _proposedTrueEvent();
        vm.prank(attacker);
        disputeManager.dispute{ value: disputeBond }(eventId);

        vm.prank(resolverA);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);
        vm.prank(resolverB);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, false);
        vm.warp(block.timestamp + disputeManager.TIER1_WINDOW() + 1);
        disputeManager.escalateTier2(eventId);

        vm.prank(resolverA);
        disputeManager.submitTier2Vote{ value: tier2Bond }(eventId, true);
        vm.prank(resolverB);
        disputeManager.submitTier2Vote{ value: tier2Bond }(eventId, true);

        assertTrue(registry.isFinalized(eventId));
    }

    // --- Tier-2 non-convergence -> Void ---

    function test_tier2_nonConvergence_voidsEventAndRefundsEveryBond() public {
        bytes32 eventId = _proposedTrueEvent();
        vm.prank(attacker);
        disputeManager.dispute{ value: disputeBond }(eventId);

        vm.prank(resolverA);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);
        vm.prank(resolverB);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, false);
        vm.warp(block.timestamp + disputeManager.TIER1_WINDOW() + 1);
        disputeManager.escalateTier2(eventId);

        vm.prank(resolverA);
        disputeManager.submitTier2Vote{ value: tier2Bond }(eventId, true);
        vm.prank(resolverC);
        disputeManager.submitTier2Vote{ value: tier2Bond }(eventId, false);
        // Only 2 of 3 vote; 1/3 each side never reaches 66% of the committee.

        vm.warp(block.timestamp + disputeManager.TIER2_WINDOW() + 1);

        uint256 aBalanceBefore = _owed(resolverA);
        uint256 cBalanceBefore = _owed(resolverC);
        uint256 attackerBalanceBefore = _owed(attacker);

        disputeManager.voidAfterTier2Timeout(eventId);

        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.Voided));
        assertFalse(registry.isFinalized(eventId));
        assertEq(_owed(resolverA), aBalanceBefore + tier2Bond);
        assertEq(_owed(resolverC), cBalanceBefore + tier2Bond);
        assertEq(_owed(attacker), attackerBalanceBefore + disputeBond);
    }

    function test_voidAfterTier2Timeout_revertsIfWindowStillOpen() public {
        bytes32 eventId = _proposedTrueEvent();
        vm.prank(attacker);
        disputeManager.dispute{ value: disputeBond }(eventId);
        vm.warp(block.timestamp + disputeManager.TIER1_WINDOW() + 1);
        disputeManager.escalateTier2(eventId);

        vm.expectRevert(bytes("DisputeManager: tier2 window still open"));
        disputeManager.voidAfterTier2Timeout(eventId);
    }

    // --- escalateNonConvergence() entry point (Gap 4/5: ambiguous base quorum) ---

    function test_escalateNonConvergence_opensTier1ForAmbiguousSplit() public {
        bytes32 eventId = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.price-feed"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 3,
                spec: abi.encode("ambiguous")
            })
        );
        // Only 2 of 3 resolvers ever submit, split 1/1 -> quorum of 3 never reached.
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(false), keccak256("ev-b"));

        vm.warp(block.timestamp + 1 days + 1);

        disputeManager.escalateNonConvergence(eventId);
        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.Disputed));

        address[] memory committee = disputeManager.getCommittee(eventId, 1);
        assertEq(committee.length, 3);

        vm.prank(resolverA);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);
        vm.prank(resolverB);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);

        assertTrue(registry.isFinalized(eventId));
        IEventRegistry.Outcome memory outcome = registry.getOutcome(eventId);
        assertTrue(abi.decode(outcome.outcomeData, (bool)));
    }

    function test_escalateNonConvergence_revertsBeforeObservationDeadline() public {
        bytes32 eventId = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.price-feed"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 3,
                spec: abi.encode("ambiguous")
            })
        );
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-a"));

        vm.expectRevert(bytes("DisputeManager: observation window still open"));
        disputeManager.escalateNonConvergence(eventId);
    }

    // --- Committee voting guards ---

    function test_submitTier1Vote_revertsForNonCommitteeMember() public {
        bytes32 eventId = _proposedTrueEvent();
        vm.prank(attacker);
        disputeManager.dispute{ value: disputeBond }(eventId);

        address outsider = address(0xF00D);
        vm.deal(outsider, 1 ether);
        vm.prank(outsider);
        vm.expectRevert(bytes("DisputeManager: not on committee"));
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);
    }

    function test_submitTier1Vote_revertsOnWrongBondAmount() public {
        bytes32 eventId = _proposedTrueEvent();
        vm.prank(attacker);
        disputeManager.dispute{ value: disputeBond }(eventId);

        vm.prank(resolverA);
        vm.expectRevert(bytes("DisputeManager: incorrect bond"));
        disputeManager.submitTier1Vote{ value: tier1Bond - 1 }(eventId, true);
    }

    function test_submitTier1Vote_revertsOnDoubleVote() public {
        bytes32 eventId = _proposedTrueEvent();
        vm.prank(attacker);
        disputeManager.dispute{ value: disputeBond }(eventId);

        vm.startPrank(resolverA);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);
        vm.expectRevert(bytes("DisputeManager: already voted"));
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);
        vm.stopPrank();
    }

    function test_submitTier1Vote_revertsAfterWindowCloses() public {
        bytes32 eventId = _proposedTrueEvent();
        vm.prank(attacker);
        disputeManager.dispute{ value: disputeBond }(eventId);

        vm.warp(block.timestamp + disputeManager.TIER1_WINDOW() + 1);
        vm.prank(resolverA);
        vm.expectRevert(bytes("DisputeManager: tier window closed"));
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);
    }

    // --- Pull payments ---

    /// @dev REGRESSION: a reverting disputer must not be able to block a
    ///      committee from finalizing the event.
    function test_revertingDisputer_cannotBlockConvergence() public {
        bytes32 eventId = _proposedTrueEvent();
        RevertingDisputer griefer = new RevertingDisputer();
        griefer.fileDispute{ value: disputeBond }(disputeManager, eventId);

        // Committee overturns -> disputer was "right" -> refund owed to a
        // contract that rejects ETH. Must still finalize.
        vm.prank(resolverA);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, false);
        vm.prank(resolverB);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, false);

        assertTrue(registry.isFinalized(eventId));
        assertEq(disputeManager.pendingWithdrawals(address(griefer)), disputeBond);
    }

    /// @dev REGRESSION: same griefer on the Tier-2 timeout path, which always
    ///      refunds the disputer — voiding must still go through.
    function test_revertingDisputer_cannotBlockVoid() public {
        bytes32 eventId = _proposedTrueEvent();
        RevertingDisputer griefer = new RevertingDisputer();
        griefer.fileDispute{ value: disputeBond }(disputeManager, eventId);

        uint64 tier1Window = disputeManager.TIER1_WINDOW();
        vm.warp(block.timestamp + tier1Window + 1);
        disputeManager.escalateTier2(eventId);
        uint64 tier2Window = disputeManager.TIER2_WINDOW();
        vm.warp(block.timestamp + tier2Window + 1);
        disputeManager.voidAfterTier2Timeout(eventId);

        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.Voided));
        assertEq(disputeManager.pendingWithdrawals(address(griefer)), disputeBond);
    }

    function test_withdraw_paysOutCreditsOnce() public {
        bytes32 eventId = _proposedTrueEvent();
        vm.prank(attacker);
        disputeManager.dispute{ value: disputeBond }(eventId);
        vm.prank(resolverA);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);
        vm.prank(resolverB);
        disputeManager.submitTier1Vote{ value: tier1Bond }(eventId, true);

        uint256 owed = disputeManager.pendingWithdrawals(resolverA);
        assertEq(owed, tier1Bond); // upheld, no losing voter -> bond back, no reward
        uint256 before = resolverA.balance;
        vm.prank(resolverA);
        disputeManager.withdraw();
        assertEq(resolverA.balance, before + owed);

        vm.prank(resolverA);
        vm.expectRevert(bytes("DisputeManager: nothing to withdraw"));
        disputeManager.withdraw();
    }
}
