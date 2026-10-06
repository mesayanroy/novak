// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EventRegistry } from "../../contracts/EventRegistry.sol";
import { DisputeManager } from "../../contracts/DisputeManager.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";

/// @notice Commit-reveal committee selection (threat-model item 10). With the
///         authorized pool at or below the tier size the committee is the whole
///         pool, drawn instantly (unchanged). Above it, a tier opens in a
///         seeding phase: resolvers commit to salts, reveal them, and the draw
///         uses their XOR — committers that withhold are excluded, and nobody
///         can vote or escalate until the committee is drawn.
contract CommitteeSeedTest is Test {
    EventRegistry internal registry;
    DisputeManager internal dm;
    address[] internal pool;
    address internal disputer = address(0xD15);
    uint256 internal disputeBond;
    uint256 internal tier1Bond;

    function _setUp(uint256 n) internal {
        registry = new EventRegistry();
        dm = new DisputeManager(address(registry), address(0x7EA5), 0.01 ether);
        registry.setDisputeManager(address(dm));
        delete pool;
        for (uint256 i = 0; i < n; i++) {
            address r = address(uint160(0x1000 + i));
            pool.push(r);
            registry.setResolverAuthorization(r, true);
            vm.deal(r, 1 ether);
        }
        vm.deal(disputer, 1 ether);
        disputeBond = dm.DISPUTE_BOND();
        tier1Bond = dm.TIER1_BOND();
    }

    function _disputedEvent() internal returns (bytes32 id) {
        id = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("chainlink.price-at.v1"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: abi.encode("seed")
            })
        );
        vm.prank(pool[0]);
        registry.submitObservation(id, abi.encode(true), keccak256("a"));
        vm.prank(pool[1]);
        registry.submitObservation(id, abi.encode(true), keccak256("b"));
        uint256 bond = disputeBond;
        vm.prank(disputer);
        dm.dispute{ value: bond }(id);
    }

    function _salt(uint256 i) internal pure returns (bytes32) {
        return keccak256(abi.encode("salt", i));
    }

    function _commit(bytes32 id, uint256 i) internal {
        vm.prank(pool[i]);
        dm.commitSeed(id, keccak256(abi.encode(id, uint8(1), pool[i], _salt(i))));
    }

    function _reveal(bytes32 id, uint256 i) internal {
        vm.prank(pool[i]);
        dm.revealSeed(id, _salt(i));
    }

    function _seed(bytes32 id) internal view returns (bool seeding, uint64 c, uint64 r, uint32 commits, uint32 reveals, bool drawn) {
        return dm.getSeedState(id, 1);
    }

    // --- small pools: unchanged behaviour ---

    function test_poolAtTierSize_committeeIsWholePool_immediately() public {
        _setUp(7);
        bytes32 id = _disputedEvent();
        (bool seeding,,,,, bool drawn) = _seed(id);
        assertFalse(seeding);
        assertTrue(drawn);
        assertEq(dm.getCommittee(id, 1).length, 7);
    }

    // --- large pools: seeding gates everything ---

    function test_largePool_opensSeeding_andBlocksVotesAndEscalation() public {
        _setUp(10);
        bytes32 id = _disputedEvent();
        (bool seeding, uint64 commitDeadline, uint64 revealDeadline,,, bool drawn) = _seed(id);
        assertTrue(seeding);
        assertFalse(drawn);
        assertEq(commitDeadline, block.timestamp + dm.SEED_COMMIT_WINDOW());
        assertEq(revealDeadline, commitDeadline + dm.SEED_REVEAL_WINDOW());
        assertEq(dm.getCommittee(id, 1).length, 0);

        uint256 bond = tier1Bond;
        vm.prank(pool[0]);
        vm.expectRevert(bytes("DisputeManager: committee not drawn yet"));
        dm.submitTier1Vote{ value: bond }(id, true);

        vm.warp(block.timestamp + 3 hours);
        vm.expectRevert(bytes("DisputeManager: committee not drawn yet"));
        dm.escalateTier2(id);
    }

    function test_commitReveal_excludesWithholder_drawIsDeterministic() public {
        _setUp(10);
        bytes32 id = _disputedEvent();
        for (uint256 i = 0; i < 5; i++) _commit(id, i);

        vm.warp(block.timestamp + dm.SEED_COMMIT_WINDOW());
        for (uint256 i = 0; i < 4; i++) _reveal(id, i); // pool[4] withholds

        vm.expectRevert(bytes("DisputeManager: seeding still in progress"));
        dm.drawCommittee(id);

        vm.warp(block.timestamp + dm.SEED_REVEAL_WINDOW());
        uint256 snap = vm.snapshotState();
        dm.drawCommittee(id);
        address[] memory committee = dm.getCommittee(id, 1);
        assertEq(committee.length, 7);
        for (uint256 i = 0; i < committee.length; i++) {
            assertTrue(committee[i] != pool[4], "withholder must be excluded");
            assertTrue(registry.isAuthorizedResolver(committee[i]));
            for (uint256 j = i + 1; j < committee.length; j++) assertTrue(committee[i] != committee[j], "no duplicates");
        }
        (bool seeding,,,, uint32 reveals, bool drawn) = _seed(id);
        assertFalse(seeding);
        assertTrue(drawn);
        assertEq(reveals, 4);

        // Same reveals -> same committee, regardless of who calls draw or when.
        vm.revertToState(snap);
        vm.warp(block.timestamp + 5 minutes);
        vm.prank(address(0xBEEF));
        dm.drawCommittee(id);
        address[] memory again = dm.getCommittee(id, 1);
        for (uint256 i = 0; i < 7; i++) assertEq(again[i], committee[i]);
    }

    function test_everyoneRevealed_drawsWithoutWaitingForRevealDeadline() public {
        _setUp(10);
        bytes32 id = _disputedEvent();
        for (uint256 i = 0; i < 3; i++) _commit(id, i);
        vm.warp(block.timestamp + dm.SEED_COMMIT_WINDOW());
        for (uint256 i = 0; i < 3; i++) _reveal(id, i);
        dm.drawCommittee(id);
        assertEq(dm.getCommittee(id, 1).length, 7);
    }

    function test_guards() public {
        _setUp(10);
        bytes32 id = _disputedEvent();

        vm.prank(address(0xBAD));
        vm.expectRevert(bytes("DisputeManager: not an authorized resolver"));
        dm.commitSeed(id, keccak256("x"));

        _commit(id, 0);
        vm.prank(pool[0]);
        vm.expectRevert(bytes("DisputeManager: already committed"));
        dm.commitSeed(id, keccak256("again"));

        vm.prank(pool[0]);
        vm.expectRevert(bytes("DisputeManager: commit window still open"));
        dm.revealSeed(id, _salt(0));

        vm.warp(block.timestamp + dm.SEED_COMMIT_WINDOW());
        vm.prank(pool[1]);
        vm.expectRevert(bytes("DisputeManager: commit window closed"));
        dm.commitSeed(id, keccak256("late"));

        vm.prank(pool[0]);
        vm.expectRevert(bytes("DisputeManager: reveal does not match commitment"));
        dm.revealSeed(id, keccak256("wrong salt"));

        vm.prank(pool[2]); // never committed
        vm.expectRevert(bytes("DisputeManager: reveal does not match commitment"));
        dm.revealSeed(id, _salt(2));

        _reveal(id, 0);
        vm.prank(pool[0]);
        vm.expectRevert(bytes("DisputeManager: already revealed"));
        dm.revealSeed(id, _salt(0));
    }

    function test_noReveals_fallbackSeed_keepsDisputeLive() public {
        _setUp(10);
        bytes32 id = _disputedEvent();
        vm.warp(block.timestamp + dm.SEED_COMMIT_WINDOW() + dm.SEED_REVEAL_WINDOW());
        dm.drawCommittee(id);
        assertEq(dm.getCommittee(id, 1).length, 7);
    }

    function test_afterDraw_committeeDecides_andTier2FitsWholePool() public {
        _setUp(10);
        bytes32 id = _disputedEvent();
        for (uint256 i = 0; i < 4; i++) _commit(id, i);
        vm.warp(block.timestamp + dm.SEED_COMMIT_WINDOW());
        for (uint256 i = 0; i < 4; i++) _reveal(id, i);
        dm.drawCommittee(id);

        address[] memory committee = dm.getCommittee(id, 1);
        (,, uint64 deadline,) = dm.getTierTally(id, 1);
        assertEq(deadline, block.timestamp + dm.TIER1_WINDOW(), "voting window starts at the draw");

        // Split 3-3 with one abstention: no 66% -> escalate; pool 10 <= 15 so Tier 2 is the whole pool at once.
        uint256 bond = tier1Bond;
        for (uint256 i = 0; i < 6; i++) {
            vm.prank(committee[i]);
            dm.submitTier1Vote{ value: bond }(id, i % 2 == 0);
        }
        vm.warp(block.timestamp + dm.TIER1_WINDOW());
        dm.escalateTier2(id);
        (bool seeding2,,,,, bool drawn2) = dm.getSeedState(id, 2);
        assertFalse(seeding2);
        assertTrue(drawn2);
        assertEq(dm.getCommittee(id, 2).length, 10);
    }
}
