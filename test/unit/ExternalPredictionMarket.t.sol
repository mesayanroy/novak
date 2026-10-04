// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EventRegistry } from "../../contracts/EventRegistry.sol";
import { EventComposer } from "../../contracts/EventComposer.sol";
import { EventBus } from "../../contracts/EventBus.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";
import { ExternalPredictionMarket } from "../../examples/integrations/ExternalPredictionMarket.sol";

/// @notice The documented integration path for third-party prediction markets.
contract ExternalPredictionMarketTest is Test {
    EventRegistry internal registry;
    EventBus internal bus;
    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);
    address internal alice = address(0x1);
    address internal bob = address(0x2);

    function setUp() public {
        registry = new EventRegistry();
        EventComposer composer = new EventComposer(address(registry));
        bus = new EventBus(address(registry), address(composer));
        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _event() internal returns (bytes32) {
        return registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("chainlink.price-at.v1"),
                openTimestamp: uint64(block.timestamp + 1 hours),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: ""
            })
        );
    }

    // Architectural regression guard (CLAUDE.md): integrators hold only the Bus.
    function test_holdsOnlyEventBusReference() public {
        ExternalPredictionMarket m =
            new ExternalPredictionMarket(address(bus), _event(), uint64(block.timestamp + 1 hours));
        assertEq(address(m.novak()), address(bus));
    }

    function test_resolvesFromNovak_andPaysWinners() public {
        bytes32 id = _event();
        ExternalPredictionMarket m =
            new ExternalPredictionMarket(address(bus), id, uint64(block.timestamp + 1 hours));
        vm.prank(alice);
        m.bet{ value: 1 ether }(true);
        vm.prank(bob);
        m.bet{ value: 1 ether }(false);

        vm.warp(block.timestamp + 1 hours);
        vm.prank(resolverA);
        registry.submitObservation(id, abi.encode(true), keccak256("a"));
        vm.prank(resolverB);
        registry.submitObservation(id, abi.encode(true), keccak256("b"));
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(id);

        m.resolve();
        assertEq(uint8(m.state()), uint8(ExternalPredictionMarket.State.ResolvedYes));
        uint256 before = alice.balance;
        vm.prank(alice);
        m.claim();
        assertEq(alice.balance - before, 2 ether);
    }

    function test_voidedNovakEvent_refundsEveryone() public {
        bytes32 id = _event();
        ExternalPredictionMarket m =
            new ExternalPredictionMarket(address(bus), id, uint64(block.timestamp + 1 hours));
        vm.prank(alice);
        m.bet{ value: 1 ether }(true);
        vm.warp(block.timestamp + 1 days + 1);
        registry.expire(id); // nobody observed it -> Voided on the Bus

        m.resolve();
        assertEq(uint8(m.state()), uint8(ExternalPredictionMarket.State.Refunding));
        uint256 before = alice.balance;
        vm.prank(alice);
        m.claim();
        assertEq(alice.balance - before, 1 ether);
    }
}
