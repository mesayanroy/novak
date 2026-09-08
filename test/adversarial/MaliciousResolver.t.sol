// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EventRegistry} from "../../contracts/EventRegistry.sol";
import {EventBus} from "../../contracts/EventBus.sol";
import {EventComposer} from "../../contracts/EventComposer.sol";
import {Market} from "../../derivatives/Market.sol";

/// @notice Placeholder for adversarial scenarios once resolver submission/quorum/
///         dispute logic exists. Intent (do not implement until that logic lands):
///
///   - Conflicting observations: two resolvers submit different outcomes for the
///     same event before quorum; Registry must not finalize until quorum rules
///     (not yet implemented) are satisfied.
///   - Late/post-deadline observation: a resolver submits after
///     EventSpec.observationDeadline; must be rejected.
///   - Dispute spam: a griefer repeatedly disputes a correct proposed outcome to
///     stall finalization; dispute bonding/slashing (not yet designed) should
///     price this out.
///   - Bus bypass attempt: a consumer contract tries to read an outcome directly
///     from EventRegistry instead of through EventBus. This scaffold's Market
///     contract structurally cannot do this (it only holds an IEventBus
///     reference) — see test/unit/Market.t.sol::test_market_onlyHoldsEventBusReference
///     for the regression guard on that boundary.
///
/// See docs/threat-model.md for the fuller adversary list this suite should grow
/// into (colluding resolver majority, composite-event operand griefing, etc).
contract MaliciousResolverTest is Test {
    EventRegistry internal registry;
    EventComposer internal composer;
    EventBus internal bus;
    Market internal market;

    function setUp() public {
        registry = new EventRegistry();
        composer = new EventComposer(address(registry));
        bus = new EventBus(address(registry), address(composer));
        market = new Market(address(bus));
    }

    function test_placeholder_adversarialSuiteAwaitsResolverLogic() public {
        // Intentionally trivial until resolver submission/quorum/dispute contracts
        // exist. Kept as a non-skipped test so CI flags this file as still pending
        // real coverage rather than silently passing an empty suite.
        assertTrue(true);
    }
}
