// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The subset of Gnosis Conditional Tokens (the CTF, used by
///         Polymarket-style venues) an oracle adapter needs. The oracle of a
///         condition is whoever calls `reportPayouts` — the conditionId binds
///         (oracle, questionId, outcomeSlotCount).
interface IConditionalTokens {
    function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount) external;

    function reportPayouts(bytes32 questionId, uint256[] calldata payouts) external;

    function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount)
        external
        pure
        returns (bytes32);

    function payoutDenominator(bytes32 conditionId) external view returns (uint256);

    function payoutNumerators(bytes32 conditionId, uint256 index) external view returns (uint256);

    function getOutcomeSlotCount(bytes32 conditionId) external view returns (uint256);
}
