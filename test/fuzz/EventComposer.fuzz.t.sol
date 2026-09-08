// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventRegistry} from "../../contracts/EventRegistry.sol";
import {EventComposer} from "../../contracts/EventComposer.sol";
import {IEventComposer} from "../../contracts/interfaces/IEventComposer.sol";

/// @notice Fuzz tests targeting the Composer's determinism invariant: identical
///         CompositeSpec inputs must always yield the identical compositeId, and
///         (once implemented) tryResolve must always yield the identical result for
///         identical underlying primitive outcomes.
contract EventComposerFuzzTest is Test {
    EventRegistry internal registry;
    EventComposer internal composer;

    function setUp() public {
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
    }

    /// @dev Same (op, operands, window) submitted twice from two different callers
    ///      must produce the same compositeId — composite identity must not depend
    ///      on msg.sender or transaction context.
    function testFuzz_createComposite_isDeterministicAcrossCallers(
        bytes32 eventA,
        bytes32 eventB,
        uint64 window,
        address caller1,
        address caller2
    ) public {
        vm.assume(caller1 != address(0) && caller2 != address(0));
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

    // TODO: once tryResolve is implemented, add a fuzz test over primitive
    // finalization timestamps for BEFORE/WITHIN to check the window boundary
    // (exactly at `window`, one second over/under) never flips non-deterministically.
}
