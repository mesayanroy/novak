// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { NovakConsumer } from "./NovakConsumer.sol";
import { IConditionalTokens } from "../interfaces/IConditionalTokens.sol";

/// @title NovakCTFAdapter — Novak as the oracle of a Conditional Tokens market
/// @notice Polymarket-style venues hold positions as Gnosis Conditional Tokens
///         (the CTF) and settle by having an oracle call `reportPayouts`. This
///         adapter IS that oracle, and it answers from Novak:
///           1. `prepareBinary(eventId)` / `prepareRange(boundaries)` prepares
///              a CTF condition whose oracle is this adapter;
///           2. the venue trades the condition's outcome tokens as usual;
///           3. anyone calls `resolve(questionId)` once Novak has decided —
///              the adapter reports payouts straight into the CTF.
///         Binary: slot 0 = YES, slot 1 = NO. Range: slot k = the k-th bucket of
///         an ascending threshold ladder (winning bucket = number of TRUE
///         boundaries). If Novak voids the event, every slot pays equally — the
///         CTF's "invalid" outcome, i.e. everyone gets their collateral back.
///         The venue never runs an oracle, a bond or a dispute process:
///         disputes go through Novak's committees before `resolve` can run.
/// @dev Depends on Novak only through IEventBus (via NovakConsumer), plus the
///      venue's CTF. Guarded by
///      test/unit/NovakIntegrations.t.sol::test_adapter_holdsOnlyEventBusAndCtf.
contract NovakCTFAdapter is NovakConsumer {
    struct Question {
        bytes32[] eventIds; // 1 for binary; the ascending ladder for a range
        bool range;
        bool resolved;
        uint8 slots;
    }

    IConditionalTokens public immutable ctf;
    mapping(bytes32 => Question) private _questions;

    event QuestionPrepared(
        bytes32 indexed questionId,
        bytes32 indexed conditionId,
        bytes32[] eventIds,
        uint256 outcomeSlots,
        bool range
    );
    event QuestionResolved(bytes32 indexed questionId, uint256[] payouts, bool voided);

    constructor(address eventBus, address conditionalTokens) NovakConsumer(eventBus) {
        require(conditionalTokens != address(0), "NovakCTFAdapter: zero CTF");
        ctf = IConditionalTokens(conditionalTokens);
    }

    // --- Prepare ------------------------------------------------------------

    /// @notice Deterministic: the same Novak event always maps to the same question.
    function binaryQuestionId(bytes32 eventId) public pure returns (bytes32) {
        return keccak256(abi.encode("novak.binary.v1", eventId));
    }

    function rangeQuestionId(bytes32[] calldata boundaries) public pure returns (bytes32) {
        return keccak256(abi.encode("novak.range.v1", boundaries));
    }

    function prepareBinary(bytes32 eventId)
        external
        returns (bytes32 questionId, bytes32 conditionId)
    {
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = eventId;
        questionId = binaryQuestionId(eventId);
        conditionId = _prepare(questionId, ids, 2, false);
    }

    /// @param boundaries Ascending threshold events ("value ≥ t_i"); n boundaries ⇒ n+1 outcome slots.
    function prepareRange(bytes32[] calldata boundaries)
        external
        returns (bytes32 questionId, bytes32 conditionId)
    {
        require(
            boundaries.length > 0 && boundaries.length <= NOVAK_MAX_BOUNDARIES,
            "NovakCTFAdapter: bad ladder"
        );
        questionId = rangeQuestionId(boundaries);
        conditionId = _prepare(questionId, boundaries, uint8(boundaries.length + 1), true);
    }

    function _prepare(bytes32 questionId, bytes32[] memory ids, uint8 slots, bool range)
        private
        returns (bytes32 conditionId)
    {
        require(_questions[questionId].slots == 0, "NovakCTFAdapter: already prepared");
        for (uint256 i = 0; i < ids.length; i++) {
            require(
                novakResolution(ids[i]) == Resolution.Pending,
                "NovakCTFAdapter: outcome already known"
            );
        }
        Question storage q = _questions[questionId];
        q.eventIds = ids;
        q.range = range;
        q.slots = slots;
        ctf.prepareCondition(address(this), questionId, slots);
        conditionId = ctf.getConditionId(address(this), questionId, slots);
        emit QuestionPrepared(questionId, conditionId, ids, slots, range);
    }

    // --- Resolve ------------------------------------------------------------

    /// @notice True once Novak has decided (or voided) everything the question depends on.
    function canResolve(bytes32 questionId) public view returns (bool) {
        Question storage q = _questions[questionId];
        if (q.slots == 0 || q.resolved) return false;
        if (q.range) {
            (Resolution r,) = novakRange(q.eventIds);
            return r != Resolution.Pending;
        }
        return novakResolution(q.eventIds[0]) != Resolution.Pending;
    }

    /// @notice Permissionless: report Novak's answer into the CTF.
    function resolve(bytes32 questionId) external returns (uint256[] memory payouts) {
        Question storage q = _questions[questionId];
        require(q.slots != 0, "NovakCTFAdapter: unknown question");
        require(!q.resolved, "NovakCTFAdapter: already resolved");
        payouts = new uint256[](q.slots);
        bool voided;
        if (q.range) {
            (Resolution r, uint256 bucket) = novakRange(q.eventIds);
            require(r != Resolution.Pending, "NovakCTFAdapter: not decided yet");
            voided = r == Resolution.Voided;
            if (!voided) payouts[bucket] = 1;
        } else {
            Resolution r = novakResolution(q.eventIds[0]);
            require(r != Resolution.Pending, "NovakCTFAdapter: not decided yet");
            voided = r == Resolution.Voided;
            if (!voided) payouts[r == Resolution.True ? 0 : 1] = 1;
        }
        if (voided) {
            for (uint256 i = 0; i < payouts.length; i++) {
                payouts[i] = 1; // CTF "invalid": equal split = refund
            }
        }
        q.resolved = true;
        ctf.reportPayouts(questionId, payouts);
        emit QuestionResolved(questionId, payouts, voided);
    }

    function getQuestion(bytes32 questionId)
        external
        view
        returns (bytes32[] memory eventIds, bool range, bool resolved, uint8 slots)
    {
        Question storage q = _questions[questionId];
        return (q.eventIds, q.range, q.resolved, q.slots);
    }

    // This adapter only reports; it never needs the hooks.
    function _onNovakResolved(bytes32, bool) internal pure override { }

    function _onNovakVoided(bytes32) internal pure override { }
}
