// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IConditionalTokens } from "../interfaces/IConditionalTokens.sol";

/// @notice Test double for Gnosis Conditional Tokens: the condition-preparation
///         and payout-reporting logic of the real CTF (same conditionId
///         derivation, same oracle = msg.sender rule, same one-shot reporting),
///         without the ERC-1155 position tokens.
contract MockConditionalTokens is IConditionalTokens {
    mapping(bytes32 => uint256[]) private _numerators;
    mapping(bytes32 => uint256) public payoutDenominator;

    event ConditionPreparation(
        bytes32 indexed conditionId,
        address indexed oracle,
        bytes32 indexed questionId,
        uint256 outcomeSlotCount
    );
    event ConditionResolution(
        bytes32 indexed conditionId,
        address indexed oracle,
        bytes32 indexed questionId,
        uint256 outcomeSlotCount,
        uint256[] payoutNumerators
    );

    function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount));
    }

    function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount)
        external
    {
        require(outcomeSlotCount <= 256, "too many outcome slots");
        require(outcomeSlotCount > 1, "there should be more than one outcome slot");
        bytes32 conditionId = getConditionId(oracle, questionId, outcomeSlotCount);
        require(_numerators[conditionId].length == 0, "condition already prepared");
        _numerators[conditionId] = new uint256[](outcomeSlotCount);
        emit ConditionPreparation(conditionId, oracle, questionId, outcomeSlotCount);
    }

    function reportPayouts(bytes32 questionId, uint256[] calldata payouts) external {
        uint256 outcomeSlotCount = payouts.length;
        require(outcomeSlotCount > 1, "there should be more than one outcome slot");
        bytes32 conditionId = getConditionId(msg.sender, questionId, outcomeSlotCount);
        require(
            _numerators[conditionId].length == outcomeSlotCount, "condition not prepared or found"
        );
        require(payoutDenominator[conditionId] == 0, "payout denominator already set");
        uint256 den = 0;
        for (uint256 i = 0; i < outcomeSlotCount; i++) {
            den += payouts[i];
            _numerators[conditionId][i] = payouts[i];
        }
        require(den > 0, "payout is all zeroes");
        payoutDenominator[conditionId] = den;
        emit ConditionResolution(conditionId, msg.sender, questionId, outcomeSlotCount, payouts);
    }

    function payoutNumerators(bytes32 conditionId, uint256 index) external view returns (uint256) {
        return _numerators[conditionId][index];
    }

    function getOutcomeSlotCount(bytes32 conditionId) external view returns (uint256) {
        return _numerators[conditionId].length;
    }
}
