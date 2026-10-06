// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EventRegistry } from "../../contracts/EventRegistry.sol";
import { DisputeManager } from "../../contracts/DisputeManager.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";

/// @notice Deploy-time bond unit: bonds keep the fixed 1 : 3 : 8 ratio at any
///         unit, the documented mainnet default is unchanged, and a small
///         testnet unit lets three faucet-funded resolvers (0.01 ETH each) run
///         a full Tier-1 dispute end to end.
contract DisputeBondsTest is Test {
    address internal constant A = address(0xA11CE);
    address internal constant B = address(0xB0B);
    address internal constant C = address(0xC0FFEE);
    address internal constant TREASURY = address(0x7EA5);
    address internal constant BURN = 0x000000000000000000000000000000000000dEaD;

    function test_defaultUnit_matchesDocumentedBonds() public {
        DisputeManager dm = new DisputeManager(address(new EventRegistry()), TREASURY, 0.01 ether);
        assertEq(dm.DEFAULT_BOND_UNIT(), 0.01 ether);
        assertEq(dm.DISPUTE_BOND(), 0.01 ether);
        assertEq(dm.TIER1_BOND(), 0.03 ether);
        assertEq(dm.TIER2_BOND(), 0.08 ether);
    }

    function testFuzz_bondsKeepRatio(uint256 unit) public {
        unit = bound(unit, 1e12, 10 ether);
        DisputeManager dm = new DisputeManager(address(new EventRegistry()), TREASURY, unit);
        assertEq(dm.DISPUTE_BOND(), unit);
        assertEq(dm.TIER1_BOND(), unit * 3);
        assertEq(dm.TIER2_BOND(), unit * 8);
    }

    function test_constructor_revertsBelowMinimumUnit() public {
        EventRegistry registry = new EventRegistry();
        vm.expectRevert(bytes("DisputeManager: bond unit too small"));
        new DisputeManager(address(registry), TREASURY, 1e12 - 1);
    }

    /// Three resolvers with 0.01 ETH each (what the testnet faucet gives),
    /// unit 0.0005 ETH: A and B propose TRUE, C disputes and votes FALSE,
    /// A and B uphold TRUE (2 of 3 >= 66%). Exact payouts, and nobody needed
    /// more than their 0.01 ETH.
    function test_testnetUnit_threeResolverDisputeIsAffordableAndExact() public {
        uint256 unit = 0.0005 ether;
        EventRegistry registry = new EventRegistry();
        DisputeManager dm = new DisputeManager(address(registry), TREASURY, unit);
        registry.setDisputeManager(address(dm));
        registry.setResolverAuthorization(A, true);
        registry.setResolverAuthorization(B, true);
        registry.setResolverAuthorization(C, true);
        vm.deal(A, 0.01 ether);
        vm.deal(B, 0.01 ether);
        vm.deal(C, 0.01 ether);

        bytes32 id = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("chainlink.price-at.v1"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 10 minutes,
                quorumThreshold: 2,
                spec: abi.encode("NVDA >= 234 at T")
            })
        );
        vm.prank(A);
        registry.submitObservation(id, abi.encode(true), keccak256("a"));
        vm.prank(B);
        registry.submitObservation(id, abi.encode(true), keccak256("b"));

        // Hoist the bond values before vm.prank (a getter call would consume the prank).
        uint256 disputeBond = dm.DISPUTE_BOND();
        uint256 tier1Bond = dm.TIER1_BOND();

        vm.prank(C);
        dm.dispute{ value: disputeBond }(id);
        assertEq(dm.getCommittee(id, 1).length, 3, "pool of 3 <= 7: committee is the whole pool");

        vm.prank(C);
        dm.submitTier1Vote{ value: tier1Bond }(id, false);
        vm.prank(A);
        dm.submitTier1Vote{ value: tier1Bond }(id, true);
        vm.prank(B);
        dm.submitTier1Vote{ value: tier1Bond }(id, true); // 2 * 100 >= 3 * 66 -> decided

        assertEq(uint8(registry.getEvent(id)), uint8(IEventRegistry.EventStatus.Finalized));
        assertEq(abi.decode(registry.getOutcome(id).outcomeData, (bool)), true);

        // Losing pool = C's tier-1 bond (0.0015): 1/3 burn, 1/3 treasury, 1/3 to the 2 winners.
        uint256 losing = tier1Bond;
        uint256 perWinner = (losing - losing / 3 - losing / 3) / 2;
        assertEq(dm.pendingWithdrawals(A), tier1Bond + perWinner);
        assertEq(dm.pendingWithdrawals(B), tier1Bond + perWinner);
        assertEq(dm.pendingWithdrawals(C), 0, "wrong voter and wrong disputer get nothing back");
        // Treasury: its third of the losing pool + dust, plus 2/3 of the forfeited dispute bond.
        uint256 treasuryExpected =
            (losing / 3) + (losing - losing / 3 - losing / 3 - perWinner * 2) + (disputeBond - disputeBond / 3);
        assertEq(dm.pendingWithdrawals(TREASURY), treasuryExpected);
        assertEq(BURN.balance, losing / 3 + disputeBond / 3);

        // Everyone stayed within their 0.01 ETH, and ETH is conserved.
        vm.prank(A);
        dm.withdraw();
        vm.prank(B);
        dm.withdraw();
        assertEq(A.balance, 0.01 ether + perWinner);
        assertEq(B.balance, 0.01 ether + perWinner);
        assertEq(C.balance, 0.01 ether - disputeBond - tier1Bond);
        assertEq(address(dm).balance, dm.pendingWithdrawals(TREASURY));
    }
}
