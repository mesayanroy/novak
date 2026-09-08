// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventRegistry} from "../../contracts/EventRegistry.sol";
import {EventComposer} from "../../contracts/EventComposer.sol";
import {IEventComposer} from "../../contracts/interfaces/IEventComposer.sol";

contract EventComposerTest is Test {
    EventRegistry internal registry;
    EventComposer internal composer;

    function setUp() public {
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
    }

    function test_createComposite_and_requiresAtLeastTwoOperands() public {
        bytes32[] memory operands = new bytes32[](1);
        operands[0] = keccak256("event-a");

        vm.expectRevert(bytes("EventComposer: AND/OR take >= 2 operands"));
        composer.createComposite(
            IEventComposer.CompositeSpec({op: IEventComposer.Op.And, operands: operands, window: 0})
        );
    }

    function test_createComposite_not_requiresExactlyOneOperand() public {
        bytes32[] memory operands = new bytes32[](2);
        operands[0] = keccak256("event-a");
        operands[1] = keccak256("event-b");

        vm.expectRevert(bytes("EventComposer: NOT takes 1 operand"));
        composer.createComposite(
            IEventComposer.CompositeSpec({op: IEventComposer.Op.Not, operands: operands, window: 0})
        );
    }

    function test_createComposite_within_requiresExactlyTwoOperands() public {
        bytes32[] memory operands = new bytes32[](1);
        operands[0] = keccak256("event-a");

        vm.expectRevert(bytes("EventComposer: temporal op takes 2 operands"));
        composer.createComposite(
            IEventComposer.CompositeSpec({
                op: IEventComposer.Op.Within,
                operands: operands,
                window: 48 hours
            })
        );
    }

    function test_tryResolve_unresolvedByDefault() public {
        bytes32[] memory operands = new bytes32[](2);
        operands[0] = keccak256("event-a");
        operands[1] = keccak256("event-b");

        bytes32 compositeId = composer.createComposite(
            IEventComposer.CompositeSpec({op: IEventComposer.Op.And, operands: operands, window: 0})
        );

        (bool resolved, bool outcome) = composer.tryResolve(compositeId);
        assertFalse(resolved);
        assertFalse(outcome);
    }

    // TODO: once tryResolve's per-op logic is implemented, add tests for each op
    // (AND/OR/NOT/BEFORE/WITHIN) against finalized primitive outcomes, plus a
    // determinism test (same spec + same primitive outcomes => same result, always).
}
