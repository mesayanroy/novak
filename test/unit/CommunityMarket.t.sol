// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { CommunityMarket } from "../../derivatives/CommunityMarket.sol";
import { MockUSDG } from "../../contracts/mocks/MockUSDG.sol";

contract CommunityMarketTest is Test {
    CommunityMarket internal cm;
    MockUSDG internal usdg;
    address internal creator = address(0xC0FFEE);
    address internal alice = address(0xA1);
    address internal bob = address(0xB2);
    address internal carol = address(0xC3);

    function setUp() public {
        usdg = new MockUSDG();
        cm = new CommunityMarket(address(usdg));
        address[3] memory players = [alice, bob, carol];
        for (uint256 i = 0; i < players.length; i++) {
            usdg.mint(players[i], 1_000e6);
            vm.prank(players[i]);
            usdg.approve(address(cm), type(uint256).max);
        }
    }

    function _outcomes() internal pure returns (string[] memory o) {
        o = new string[](3);
        o[0] = "Team A wins";
        o[1] = "Draw";
        o[2] = "Team B wins";
    }

    function _market() internal returns (bytes32 id) {
        vm.prank(creator);
        id = cm.createMarket(
            "A vs B: who wins?",
            _outcomes(),
            uint64(block.timestamp + 1 hours),
            uint64(block.timestamp + 1 days),
            1 hours,
            "Official full-time score."
        );
    }

    function _stake(address who, bytes32 id, uint8 o, uint256 amt) internal {
        vm.prank(who);
        cm.stake(id, o, amt);
    }

    function _claim(address who, bytes32 id) internal returns (uint256 got) {
        uint256 before = usdg.balanceOf(who);
        vm.prank(who);
        cm.claim(id);
        got = usdg.balanceOf(who) - before;
    }

    // Not part of the Novak event layer: the only external dependency is the collateral token.
    function test_holdsOnlyCollateralReference() public view {
        assertEq(address(cm.collateral()), address(usdg));
    }

    function test_happyPath_winnersSplitWholePool() public {
        bytes32 id = _market();
        _stake(alice, id, 0, 30e6);
        _stake(bob, id, 0, 10e6);
        _stake(carol, id, 2, 60e6);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(creator);
        cm.proposeOutcome(id, 0);
        vm.warp(block.timestamp + 1 hours);
        cm.finalize(id);
        assertEq(uint8(cm.getMarket(id).status), uint8(CommunityMarket.Status.Resolved));
        assertEq(_claim(alice, id), 75e6); // 30/40 of 100
        assertEq(_claim(bob, id), 25e6); // 10/40 of 100
        assertEq(cm.payoutOf(id, carol), 0);
        vm.expectRevert("CommunityMarket: nothing to claim");
        vm.prank(alice);
        cm.claim(id);
    }

    function test_stakingClosesAtCloseTime() public {
        bytes32 id = _market();
        vm.warp(block.timestamp + 1 hours);
        vm.expectRevert("CommunityMarket: staking closed");
        _stake(alice, id, 0, 1e6);
    }

    function test_onlyCreatorProposes_afterCloseBeforeDeadline() public {
        bytes32 id = _market();
        vm.expectRevert("CommunityMarket: only creator");
        vm.prank(alice);
        cm.proposeOutcome(id, 0);
        vm.expectRevert("CommunityMarket: staking still open");
        vm.prank(creator);
        cm.proposeOutcome(id, 0);
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert("CommunityMarket: past resolve deadline");
        vm.prank(creator);
        cm.proposeOutcome(id, 0);
    }

    function test_objectionsOverAThirdVoidAndRefund() public {
        bytes32 id = _market();
        _stake(alice, id, 0, 60e6);
        _stake(bob, id, 2, 40e6);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(creator);
        cm.proposeOutcome(id, 0);
        vm.prank(bob); // 40% of the pool objects
        cm.object(id);
        assertEq(uint8(cm.getMarket(id).status), uint8(CommunityMarket.Status.Voided));
        assertEq(_claim(alice, id), 60e6);
        assertEq(_claim(bob, id), 40e6);
    }

    function test_smallObjectionDoesNotVoid() public {
        bytes32 id = _market();
        _stake(alice, id, 0, 80e6);
        _stake(bob, id, 2, 20e6);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(creator);
        cm.proposeOutcome(id, 0);
        vm.prank(bob);
        cm.object(id);
        assertEq(uint8(cm.getMarket(id).status), uint8(CommunityMarket.Status.Proposed));
        vm.expectRevert("CommunityMarket: objection window open");
        cm.finalize(id);
        vm.warp(block.timestamp + 1 hours);
        cm.finalize(id);
        assertEq(_claim(alice, id), 100e6);
    }

    function test_objectionGuards() public {
        bytes32 id = _market();
        _stake(alice, id, 0, 10e6);
        vm.expectRevert("CommunityMarket: nothing to object to");
        vm.prank(alice);
        cm.object(id);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(creator);
        cm.proposeOutcome(id, 1);
        vm.expectRevert("CommunityMarket: only players can object");
        vm.prank(carol);
        cm.object(id);
        vm.warp(block.timestamp + 1 hours);
        vm.expectRevert("CommunityMarket: objection window over");
        vm.prank(alice);
        cm.object(id);
    }

    function test_creatorMissesDeadline_anyoneVoids() public {
        bytes32 id = _market();
        _stake(alice, id, 0, 10e6);
        vm.expectRevert("CommunityMarket: deadline not passed");
        cm.voidUnresolved(id);
        vm.warp(block.timestamp + 1 days + 1);
        cm.voidUnresolved(id);
        assertEq(_claim(alice, id), 10e6);
    }

    function test_nobodyBackedResult_refundsEveryone() public {
        bytes32 id = _market();
        _stake(alice, id, 0, 10e6);
        _stake(bob, id, 2, 5e6);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(creator);
        cm.proposeOutcome(id, 1); // Draw — nobody staked on it
        vm.warp(block.timestamp + 1 hours);
        cm.finalize(id);
        assertEq(uint8(cm.getMarket(id).status), uint8(CommunityMarket.Status.Voided));
        assertEq(_claim(alice, id), 10e6);
        assertEq(_claim(bob, id), 5e6);
    }

    function test_creatorCancel_refunds() public {
        bytes32 id = _market();
        _stake(alice, id, 0, 10e6);
        vm.expectRevert("CommunityMarket: only creator");
        vm.prank(alice);
        cm.cancel(id);
        vm.prank(creator);
        cm.cancel(id);
        assertEq(_claim(alice, id), 10e6);
    }

    function test_createValidation() public {
        string[] memory one = new string[](1);
        one[0] = "only";
        vm.expectRevert("CommunityMarket: 2-8 outcomes");
        cm.createMarket(
            "q", one, uint64(block.timestamp + 1), uint64(block.timestamp + 2), 1 hours, ""
        );
        vm.expectRevert("CommunityMarket: bad resolve deadline");
        cm.createMarket(
            "q",
            _outcomes(),
            uint64(block.timestamp + 10),
            uint64(block.timestamp + 10),
            1 hours,
            ""
        );
        vm.expectRevert("CommunityMarket: bad objection window");
        cm.createMarket(
            "q", _outcomes(), uint64(block.timestamp + 10), uint64(block.timestamp + 100), 60, ""
        );
    }

    function test_enumerationAndViews() public {
        bytes32 id = _market();
        _stake(alice, id, 2, 7e6);
        assertEq(cm.marketCount(), 1);
        assertEq(cm.getMarketIds(0, 10)[0], id);
        assertEq(cm.getOutcomes(id)[1], "Draw");
        assertEq(cm.getPools(id)[2], 7e6);
        assertEq(cm.stakesOf(id, alice)[2], 7e6);
        assertEq(cm.stakesOf(id, bob).length, 3);
    }

    /// Payouts never exceed the pool, whatever the stakes.
    function testFuzz_payoutsNeverExceedPool(uint64 a, uint64 b, uint64 c, uint8 win) public {
        a = uint64(bound(a, 1, 300e6));
        b = uint64(bound(b, 1, 300e6));
        c = uint64(bound(c, 1, 300e6));
        win = uint8(bound(win, 0, 2));
        bytes32 id = _market();
        _stake(alice, id, 0, a);
        _stake(bob, id, 1, b);
        _stake(carol, id, win, c);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(creator);
        cm.proposeOutcome(id, win);
        vm.warp(block.timestamp + 1 hours);
        cm.finalize(id);
        uint256 paid = _claimIf(alice, id) + _claimIf(bob, id) + _claimIf(carol, id);
        assertLe(paid, uint256(a) + b + c);
        assertGe(paid + 3, uint256(a) + b + c); // at most rounding dust left behind
    }

    function _claimIf(address who, bytes32 id) internal returns (uint256) {
        return cm.payoutOf(id, who) > 0 ? _claim(who, id) : 0;
    }
}
