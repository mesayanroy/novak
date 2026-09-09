// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventRegistry} from "../../contracts/EventRegistry.sol";
import {EventComposer} from "../../contracts/EventComposer.sol";
import {DisputeManager} from "../../contracts/DisputeManager.sol";
import {IEventRegistry} from "../../contracts/interfaces/IEventRegistry.sol";
import {IEventComposer} from "../../contracts/interfaces/IEventComposer.sol";

/// @notice Covers Gap 3 (structural DAG bounds + the cycle-impossibility
///         proof) and the "dead child stalls the composite forever" half of
///         Gap 4 from docs/protocol-spec.md — the concrete griefing
///         scenarios the depth/fan-in bounds and Voided-propagation truth
///         table are meant to close. See docs/threat-model.md for the
///         written-up cycle proof and propagation table this suite
///         exercises.
contract CompositeGriefingTest is Test {
    EventRegistry internal registry;
    EventComposer internal composer;
    DisputeManager internal disputeManager;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);

    function setUp() public {
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
        disputeManager = new DisputeManager(address(registry), address(0xC0DE));
        registry.setDisputeManager(address(disputeManager));

        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
    }

    function _createAndFinalize(bool outcome) internal returns (bytes32 eventId) {
        eventId = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.price-feed"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: abi.encode("griefing-placeholder")
            })
        );
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(outcome), keccak256("ev-a"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(outcome), keccak256("ev-b"));
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(eventId);
    }

    /// @dev An attacker cannot fan a single node out past
    ///      `MAX_CHILDREN_PER_NODE` to force an unboundedly expensive
    ///      one-time resolution walk.
    function test_fanInGriefing_revertsPastMaxChildrenPerNode() public {
        uint256 tooMany = composer.MAX_CHILDREN_PER_NODE() + 1;
        bytes32[] memory operands = new bytes32[](tooMany);
        for (uint256 i = 0; i < tooMany; i++) {
            operands[i] = _createAndFinalize(true);
        }

        vm.expectRevert(bytes("EventComposer: too many operands"));
        composer.createComposite(
            IEventComposer.CompositeSpec({op: IEventComposer.Op.And, operands: operands, window: 0})
        );
    }

    /// @dev An attacker cannot chain composites past `MAX_DAG_DEPTH` to
    ///      build an oversized graph other applications would have to pay
    ///      to walk.
    function test_depthGriefing_revertsPastMaxDagDepth() public {
        bytes32 current = _createAndFinalize(true);
        uint32 maxDepth = composer.MAX_DAG_DEPTH();

        for (uint32 d = 1; d <= maxDepth; d++) {
            bytes32[] memory operands = new bytes32[](1);
            operands[0] = current;
            current = composer.createComposite(
                IEventComposer.CompositeSpec({op: IEventComposer.Op.Not, operands: operands, window: 0})
            );
        }

        bytes32[] memory oneMore = new bytes32[](1);
        oneMore[0] = current;
        vm.expectRevert(bytes("EventComposer: composition too deep"));
        composer.createComposite(
            IEventComposer.CompositeSpec({op: IEventComposer.Op.Not, operands: oneMore, window: 0})
        );
    }

    /// @dev Cycle-impossibility, made concrete: an attacker cannot reference
    ///      a not-yet-created composite's own future ID as one of its own
    ///      operands, because that ID doesn't exist as a registered event or
    ///      composite until AFTER creation — the same `_operandExists`
    ///      check that blocks referencing any unregistered ID also makes
    ///      self-reference (and therefore any cycle) impossible. See
    ///      docs/threat-model.md for the full proof.
    function test_cycleGriefing_cannotReferenceAFutureOrSelfId() public {
        bytes32 real = _createAndFinalize(true);
        // A "guessed" future composite ID (e.g. what AND(real, real) might
        // hash to) is indistinguishable on-chain from any other unknown
        // bytes32 — it was never registered, so it's rejected exactly like
        // any other made-up ID.
        bytes32 guessedFutureId = keccak256(abi.encode(IEventComposer.Op.And, real, real, uint64(0)));

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = real;
        operands[1] = guessedFutureId;

        vm.expectRevert(bytes("EventComposer: unknown operand"));
        composer.createComposite(
            IEventComposer.CompositeSpec({op: IEventComposer.Op.And, operands: operands, window: 0})
        );
    }

    /// @dev The core Gap 4 griefing fix: before this change, a Voided
    ///      primitive left every composite depending on it stuck at
    ///      "unresolved" forever — silently stalling any market built on
    ///      top, with no way out. Now it propagates deterministically.
    function test_voidedPrimitive_noLongerStallsCompositeForever() public {
        bytes32 voided = _createVoidedPrimitive();
        bytes32 healthy = _createAndFinalize(true);

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = voided;
        operands[1] = healthy;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({op: IEventComposer.Op.And, operands: operands, window: 0})
        );

        (bool resolved,) = composer.tryResolve(compositeId);
        assertFalse(resolved, "never exposed as a true/false outcome");
        assertEq(
            uint8(composer.getStatus(compositeId)),
            uint8(IEventComposer.Status.Voided),
            "but it IS a terminal, queryable state, not a permanent stall"
        );

        // Re-querying is a cheap cached read, not a re-walk — the whole
        // point of caching the resolution once computed.
        (bool resolvedAgain,) = composer.tryResolve(compositeId);
        assertFalse(resolvedAgain);
    }

    function _createVoidedPrimitive() internal returns (bytes32 eventId) {
        eventId = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.price-feed"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: abi.encode("will be voided")
            })
        );
        vm.prank(resolverA);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-a-void"));
        vm.prank(resolverB);
        registry.submitObservation(eventId, abi.encode(true), keccak256("ev-b-void"));

        address disputer = address(0xD15C0);
        vm.deal(disputer, 1 ether);
        uint256 bond = disputeManager.DISPUTE_BOND();
        vm.prank(disputer);
        disputeManager.dispute{value: bond}(eventId);

        uint64 tier1Window = disputeManager.TIER1_WINDOW();
        vm.warp(block.timestamp + tier1Window + 1);
        disputeManager.escalateTier2(eventId);
        uint64 tier2Window = disputeManager.TIER2_WINDOW();
        vm.warp(block.timestamp + tier2Window + 1);
        disputeManager.voidAfterTier2Timeout(eventId);

        assertEq(uint8(registry.getEvent(eventId)), uint8(IEventRegistry.EventStatus.Voided));
    }
}
