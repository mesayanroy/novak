// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ITreasuryVault
/// @notice Where Novak's value flows. Consumer markets push their protocol
///         fees here tagged with the event IDs they settled on; the vault
///         splits every event's fees into thirds once the event is decided:
///           1/3 -> resolvers who reported the final outcome
///           1/3 -> dispute-committee members who voted the final outcome
///                  (insurance reserve if the event was never disputed)
///           1/3 -> protocol treasury
///         It is also the DisputeManager's `treasury`, so the treasury third of
///         every forfeited dispute bond lands here too.
/// @dev Consumers only ever PUSH fees into this interface. The vault — not the
///      consumers — reads the Registry/DisputeManager to decide who is paid,
///      so the "consumers depend only on the Event Bus" rule still holds.
interface ITreasuryVault {
    /// @notice Pulls `amount` collateral from the caller (approve first) and
    ///         attributes it equally to `eventIds` (composites expand one
    ///         level into their primitive operands).
    function depositFees(bytes32[] calldata eventIds, uint256 amount) external;
}
