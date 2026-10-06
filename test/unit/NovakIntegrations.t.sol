// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { EventRegistry } from "../../contracts/EventRegistry.sol";
import { EventComposer } from "../../contracts/EventComposer.sol";
import { EventBus } from "../../contracts/EventBus.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";
import { NovakConsumer } from "../../contracts/integrations/NovakConsumer.sol";
import { NovakCTFAdapter } from "../../contracts/integrations/NovakCTFAdapter.sol";
import { MockConditionalTokens } from "../../contracts/mocks/MockConditionalTokens.sol";

/// @notice Minimal ETH escrow built on NovakConsumer: the shape the docs show.
contract EscrowHarness is NovakConsumer {
    bytes32 public immutable eventId;
    uint8 public settled; // 0 none, 1 yes, 2 no, 3 refund

    constructor(address bus, bytes32 id) NovakConsumer(bus) {
        eventId = id;
    }

    function deposit() external payable whenNovakPending(eventId) { }

    function settle() external returns (Resolution) {
        return _settleWithNovak(eventId);
    }

    function outcome() external view returns (bool, uint64) {
        return _novakOutcome(eventId);
    }

    function _onNovakResolved(bytes32, bool yes) internal override {
        settled = yes ? 1 : 2;
    }

    function _onNovakVoided(bytes32) internal override {
        settled = 3;
    }
}

contract NovakIntegrationsTest is Test {
    EventRegistry internal registry;
    EventBus internal bus;
    MockConditionalTokens internal ctf;
    NovakCTFAdapter internal adapter;
    address internal resolverA = address(0xA11CE);
    address internal resolverB = address(0xB0B);

    function setUp() public {
        registry = new EventRegistry();
        EventComposer composer = new EventComposer(address(registry));
        bus = new EventBus(address(registry), address(composer));
        registry.setResolverAuthorization(resolverA, true);
        registry.setResolverAuthorization(resolverB, true);
        ctf = new MockConditionalTokens();
        adapter = new NovakCTFAdapter(address(bus), address(ctf));
    }

    // --- helpers ------------------------------------------------------------

    function _event(uint16 version) internal returns (bytes32) {
        return registry.createEvent(
            IEventRegistry.EventSpec({
                specVersion: version,
                sourceId: keccak256("chainlink.price-at.v1"),
                openTimestamp: uint64(block.timestamp),
                observationDeadline: uint64(block.timestamp + 1 days),
                disputeWindowSeconds: 1 hours,
                quorumThreshold: 2,
                spec: ""
            })
        );
    }

    function _decide(bytes32 id, bytes memory payload) internal {
        vm.prank(resolverA);
        registry.submitObservation(id, payload, keccak256("a"));
        vm.prank(resolverB);
        registry.submitObservation(id, payload, keccak256("b"));
        vm.warp(block.timestamp + 1 hours + 1);
        registry.finalize(id);
    }

    function _decide(bytes32 id, bool yes) internal {
        _decide(id, abi.encode(yes));
    }

    /// Nobody observes before the deadline -> Expired -> Voided on the Bus.
    /// Warps past every event created so far, so call it last.
    function _void(bytes32 id) internal {
        vm.warp(block.timestamp + 1 days + 1);
        registry.expire(id);
    }

    function _ladder(uint256 n) internal returns (bytes32[] memory ids) {
        ids = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) ids[i] = _event(1);
    }

    function _payouts(bytes32 conditionId, uint256 slots) internal view returns (uint256[] memory p) {
        p = new uint256[](slots);
        for (uint256 i = 0; i < slots; i++) p[i] = ctf.payoutNumerators(conditionId, i);
    }

    // --- architectural guards (CLAUDE.md) ------------------------------------

    function test_consumer_holdsOnlyEventBusReference() public {
        EscrowHarness h = new EscrowHarness(address(bus), _event(1));
        assertEq(address(h.novak()), address(bus));
    }

    function test_adapter_holdsOnlyEventBusAndCtf() public view {
        assertEq(address(adapter.novak()), address(bus));
        assertEq(address(adapter.ctf()), address(ctf));
    }

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert("NovakConsumer: zero event bus");
        new EscrowHarness(address(0), bytes32(0));
        vm.expectRevert("NovakCTFAdapter: zero CTF");
        new NovakCTFAdapter(address(bus), address(0));
    }

    // --- NovakConsumer ------------------------------------------------------

    function test_resolution_pendingThenTrue() public {
        bytes32 id = _event(1);
        EscrowHarness h = new EscrowHarness(address(bus), id);
        assertEq(uint8(h.novakResolution(id)), uint8(NovakConsumer.Resolution.Pending));
        h.deposit{ value: 1 }();
        _decide(id, true);
        assertEq(uint8(h.novakResolution(id)), uint8(NovakConsumer.Resolution.True));
    }

    function test_whenNovakPending_blocksOnceDecided() public {
        bytes32 id = _event(1);
        EscrowHarness h = new EscrowHarness(address(bus), id);
        _decide(id, false);
        vm.expectRevert("NovakConsumer: outcome known");
        h.deposit{ value: 1 }();
    }

    function test_settle_revertsWhilePending() public {
        EscrowHarness h = new EscrowHarness(address(bus), _event(1));
        vm.expectRevert("NovakConsumer: not decided yet");
        h.settle();
    }

    function test_settle_routesYesNoAndVoid() public {
        bytes32 yes = _event(1);
        bytes32 no = _event(1);
        bytes32 gone = _event(1);
        EscrowHarness hy = new EscrowHarness(address(bus), yes);
        EscrowHarness hn = new EscrowHarness(address(bus), no);
        EscrowHarness hv = new EscrowHarness(address(bus), gone);
        _decide(yes, true);
        _decide(no, false);
        _void(gone);

        assertEq(uint8(hy.settle()), uint8(NovakConsumer.Resolution.True));
        assertEq(hy.settled(), 1);
        assertEq(uint8(hn.settle()), uint8(NovakConsumer.Resolution.False));
        assertEq(hn.settled(), 2);
        assertEq(uint8(hv.settle()), uint8(NovakConsumer.Resolution.Voided));
        assertEq(hv.settled(), 3);
    }

    function test_outcome_v1UsesFinalizedAt() public {
        bytes32 id = _event(1);
        EscrowHarness h = new EscrowHarness(address(bus), id);
        _decide(id, true);
        (bool o, uint64 at) = h.outcome();
        assertTrue(o);
        assertEq(at, uint64(block.timestamp));
    }

    function test_outcome_v2DecodesOccurredAt() public {
        vm.warp(1_800_000_000);
        bytes32 id = _event(2);
        EscrowHarness h = new EscrowHarness(address(bus), id);
        uint64 happened = uint64(block.timestamp - 30 minutes);
        _decide(id, abi.encode(true, happened));
        (bool o, uint64 at) = h.outcome();
        assertTrue(o);
        assertEq(at, happened);
    }

    function test_outcome_revertsUnlessAvailable() public {
        EscrowHarness h = new EscrowHarness(address(bus), _event(1));
        vm.expectRevert("NovakConsumer: not available");
        h.outcome();
    }

    function test_range_pendingUntilEveryBoundaryDecided() public {
        bytes32[] memory ids = _ladder(3);
        _decide(ids[0], true);
        (NovakConsumer.Resolution r,) = adapter.novakRange(ids);
        assertEq(uint8(r), uint8(NovakConsumer.Resolution.Pending));
    }

    function test_range_winningBucketIsTrueCount() public {
        bytes32[] memory ids = _ladder(4);
        _decide(ids[0], true);
        _decide(ids[1], true);
        _decide(ids[2], false);
        _decide(ids[3], false);
        (NovakConsumer.Resolution r, uint256 bucket) = adapter.novakRange(ids);
        assertEq(uint8(r), uint8(NovakConsumer.Resolution.True));
        assertEq(bucket, 2);
    }

    function test_range_inconsistentLadderVoids() public {
        bytes32[] memory ids = _ladder(2);
        _decide(ids[0], false);
        _decide(ids[1], true); // "≥ high" true while "≥ low" false: impossible
        (NovakConsumer.Resolution r,) = adapter.novakRange(ids);
        assertEq(uint8(r), uint8(NovakConsumer.Resolution.Voided));
    }

    function test_range_voidedBoundaryVoids() public {
        bytes32[] memory ids = _ladder(2);
        _decide(ids[0], true);
        _void(ids[1]);
        (NovakConsumer.Resolution r,) = adapter.novakRange(ids);
        assertEq(uint8(r), uint8(NovakConsumer.Resolution.Voided));
    }

    function test_range_rejectsBadLadderSize() public {
        vm.expectRevert("NovakConsumer: bad ladder");
        adapter.novakRange(new bytes32[](0));
        vm.expectRevert("NovakConsumer: bad ladder");
        adapter.novakRange(new bytes32[](10));
    }

    // --- NovakCTFAdapter ----------------------------------------------------

    function test_ctf_binaryYesPaysSlotZero() public {
        bytes32 id = _event(1);
        (bytes32 q, bytes32 cond) = adapter.prepareBinary(id);
        assertEq(q, adapter.binaryQuestionId(id));
        assertEq(cond, ctf.getConditionId(address(adapter), q, 2));
        assertEq(ctf.getOutcomeSlotCount(cond), 2);
        assertFalse(adapter.canResolve(q));

        _decide(id, true);
        assertTrue(adapter.canResolve(q));
        adapter.resolve(q);
        uint256[] memory p = _payouts(cond, 2);
        assertEq(p[0], 1);
        assertEq(p[1], 0);
        assertEq(ctf.payoutDenominator(cond), 1);
        assertFalse(adapter.canResolve(q));
    }

    function test_ctf_binaryNoPaysSlotOne() public {
        bytes32 id = _event(1);
        (bytes32 q, bytes32 cond) = adapter.prepareBinary(id);
        _decide(id, false);
        adapter.resolve(q);
        uint256[] memory p = _payouts(cond, 2);
        assertEq(p[0], 0);
        assertEq(p[1], 1);
    }

    function test_ctf_binaryVoidRefundsEqually() public {
        bytes32 id = _event(1);
        (bytes32 q, bytes32 cond) = adapter.prepareBinary(id);
        _void(id);
        vm.expectEmit(true, false, false, false, address(adapter));
        emit NovakCTFAdapter.QuestionResolved(q, new uint256[](2), true);
        adapter.resolve(q);
        uint256[] memory p = _payouts(cond, 2);
        assertEq(p[0], 1);
        assertEq(p[1], 1);
        assertEq(ctf.payoutDenominator(cond), 2);
    }

    function test_ctf_rangePaysWinningBucket() public {
        bytes32[] memory ids = _ladder(3); // 4 buckets
        (bytes32 q, bytes32 cond) = adapter.prepareRange(ids);
        assertEq(ctf.getOutcomeSlotCount(cond), 4);
        _decide(ids[0], true);
        _decide(ids[1], false);
        _decide(ids[2], false);
        adapter.resolve(q);
        uint256[] memory p = _payouts(cond, 4);
        assertEq(p[0], 0);
        assertEq(p[1], 1);
        assertEq(p[2], 0);
        assertEq(p[3], 0);
    }

    function test_ctf_rangeVoidRefundsEqually() public {
        bytes32[] memory ids = _ladder(2);
        (bytes32 q, bytes32 cond) = adapter.prepareRange(ids);
        _decide(ids[0], false);
        _decide(ids[1], true); // inconsistent
        adapter.resolve(q);
        uint256[] memory p = _payouts(cond, 3);
        for (uint256 i = 0; i < 3; i++) assertEq(p[i], 1);
    }

    function test_ctf_resolveGuards() public {
        bytes32 id = _event(1);
        vm.expectRevert("NovakCTFAdapter: unknown question");
        adapter.resolve(bytes32(uint256(1)));

        (bytes32 q,) = adapter.prepareBinary(id);
        vm.expectRevert("NovakCTFAdapter: not decided yet");
        adapter.resolve(q);

        _decide(id, true);
        adapter.resolve(q);
        vm.expectRevert("NovakCTFAdapter: already resolved");
        adapter.resolve(q);
    }

    function test_ctf_prepareGuards() public {
        bytes32 id = _event(1);
        adapter.prepareBinary(id);
        vm.expectRevert("NovakCTFAdapter: already prepared");
        adapter.prepareBinary(id);

        bytes32 decided = _event(1);
        _decide(decided, true);
        vm.expectRevert("NovakCTFAdapter: outcome already known");
        adapter.prepareBinary(decided);

        vm.expectRevert("NovakCTFAdapter: bad ladder");
        adapter.prepareRange(new bytes32[](0));
    }

    function test_ctf_onlyAdapterCanReport() public {
        bytes32 id = _event(1);
        (bytes32 q,) = adapter.prepareBinary(id);
        uint256[] memory fake = new uint256[](2);
        fake[1] = 1;
        // Anyone else reporting hits a different (unprepared) condition.
        vm.expectRevert("condition not prepared or found");
        ctf.reportPayouts(q, fake);
    }

    function test_ctf_getQuestion() public {
        bytes32[] memory ids = _ladder(2);
        (bytes32 q,) = adapter.prepareRange(ids);
        (bytes32[] memory got, bool range, bool resolved, uint8 slots) = adapter.getQuestion(q);
        assertEq(got.length, 2);
        assertEq(got[1], ids[1]);
        assertTrue(range);
        assertFalse(resolved);
        assertEq(slots, 3);
    }
}
