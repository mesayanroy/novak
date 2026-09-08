// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEventBus} from "../contracts/interfaces/IEventBus.sol";

/// @title Settlement
/// @notice Computes and (eventually) distributes payouts for positions once a
///         Market has settled against a finalized event outcome from the Bus.
/// @dev Skeleton only. Like Market.sol, this may depend on IEventBus but never on a
///      resolver, the Registry, or the Composer directly.
contract Settlement {
    IEventBus public immutable eventBus;

    event PayoutComputed(bytes32 indexed marketId, bytes32 indexed positionId, uint256 amount);

    constructor(address eventBus_) {
        eventBus = IEventBus(eventBus_);
    }

    /// @notice Computes the payout for a single position given a settled market's
    ///         event outcome. Actual token transfer is NOT implemented in this
    ///         scaffold — token/collateral model is deferred (see MVP scope).
    /// @dev TODO: define payout formula once PositionManager carries collateral
    ///      accounting. Currently a no-op placeholder so the settlement flow
    ///      (Market -> Settlement -> payout) is wired end-to-end for the demo.
    function computePayout(bytes32 marketId, bytes32 positionId, bytes32 eventId)
        external
        returns (uint256 amount)
    {
        require(eventBus.isAvailable(eventId), "Settlement: event not finalized");
        eventBus.readOutcome(eventId);

        // Placeholder: no payout math yet.
        amount = 0;
        emit PayoutComputed(marketId, positionId, amount);
    }
}
