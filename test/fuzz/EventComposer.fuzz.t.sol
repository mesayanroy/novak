// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventRegistry} from "../../contracts/EventRegistry.sol";
import {EventComposer} from "../../contracts/EventComposer.sol";
import {IEventComposer} from "../../contracts/interfaces/IEventComposer.sol";
import {IEventRegistry} from "../../contracts/interfaces/IEventRegistry.sol";

/// @notice Fuzz tests targeting the Composer's determinism invariant: identical
///         CompositeSpec inputs must always yield the identical compositeId, and
///         tryResolve must always yield the identical result for identical
///         underlying primitive outcomes.
contract EventComposerFuzzTest is Test {
    EventRegistry internal registry;
    EventComposer internal composer;

    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);

    function setUp() public {
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
    }

    function _registerEvent() internal returns (bytes32 eventId) {
        eventId = registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: 1,
                sourceId: keccak256("example.price-feed"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: abi.encode("fuzz-placeholder")
            })
        );
    }

    /// @dev Same (op, operands, window) submitted twice from two different callers
    ///      must produce the same compositeId — composite identity must not depend
    ///      on msg.sender or transaction context.
    function testFuzz_createComposite_isDeterministicAcrossCallers(
        uint64 window,
        address caller1,
        address caller2
    ) public {
        vm.assume(caller1 != address(0) && caller2 != address(0));

        bytes32 eventA = _registerEvent();
        bytes32 eventB = _registerEvent();
        bytes32[] memory operands = new bytes32[](2);
        operands[0] = eventA;
        operands[1] = eventB;

        IEventComposer.CompositeSpec memory spec =
            IEventComposer.CompositeSpec({op: IEventComposer.Op.And, operands: operands, window: window});

        vm.prank(caller1);
        bytes32 idFromCaller1 = composer.createComposite(spec);

        EventComposer composer2 = new EventComposer(address(registry));
        vm.prank(caller2);
        bytes32 idFromCaller2 = composer2.createComposite(spec);

        assertEq(idFromCaller1, idFromCaller2);
    }

    /// @dev The WITHIN boundary must never flip non-deterministically: a gap of
    ///      exactly `window` seconds between two finalizations is inside the
    ///      window (<=), one second more is outside it.
    function testFuzz_within_boundaryIsInclusiveAndStable(uint32 window, uint32 gap) public {
        gap = uint32(bound(gap, 0, 365 days));
        window = uint32(bound(window, 0, 365 days));

        bytes32 eventA = _registerEvent();
        vm.prank(resolverA);
        registry.submitObservation(eventA, abi.encode(true), keccak256("ev-a1"));
        vm.prank(resolverB);
        registry.submitObservation(eventA, abi.encode(true), keccak256("ev-a2"));
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(eventA);

        vm.warp(block.timestamp + gap);

        bytes32 eventB = _registerEvent();
        vm.prank(resolverA);
        registry.submitObservation(eventB, abi.encode(true), keccak256("ev-b1"));
        vm.prank(resolverB);
        registry.submitObservation(eventB, abi.encode(true), keccak256("ev-b2"));
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(eventB);

        bytes32[] memory operands = new bytes32[](2);
        operands[0] = eventA;
        operands[1] = eventB;
        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({op: IEventComposer.Op.Within, operands: operands, window: window})
        );

        (bool resolved, bool outcome) = composer.tryResolve(compositeId);
        assertTrue(resolved);

        IEventRegistry.Outcome memory outcomeA = registry.getOutcome(eventA);
        IEventRegistry.Outcome memory outcomeB = registry.getOutcome(eventB);
        uint64 actualGap = outcomeB.finalizedAt - outcomeA.finalizedAt;

        assertEq(outcome, actualGap <= window);

        // Resolution is cached: re-querying must return the identical result.
        (bool resolvedAgain, bool outcomeAgain) = composer.tryResolve(compositeId);
        assertEq(resolvedAgain, resolved);
        assertEq(outcomeAgain, outcome);
    }
}
