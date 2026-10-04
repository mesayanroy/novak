// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IEventBus } from "../contracts/interfaces/IEventBus.sol";
import { IEventRegistry } from "../contracts/interfaces/IEventRegistry.sol";

/// @title Settlement
/// @notice Adapts the Event Bus's generic `Outcome` payload into the single
///         boolean a derivatives market settles on. This is the only place
///         the "outcome payload is abi.encode(bool)" MVP schema decision
///         (see IEventRegistry docs) is decoded for the derivatives package,
///         so Market.sol itself stays free of payload-decoding concerns.
/// @dev ARCHITECTURAL INVARIANT: depends on IEventBus only — never a resolver,
///      the Registry, or the Composer directly. Holds no funds.
contract Settlement {
    IEventBus public immutable eventBus;

    constructor(address eventBus_) {
        eventBus = IEventBus(eventBus_);
    }

    /// @notice Returns whether `eventId` (primitive or composite) has a
    ///         finalized outcome available, and if so, its boolean value.
    function resolveOutcome(bytes32 eventId) external view returns (bool available, bool outcome) {
        if (!eventBus.isAvailable(eventId)) {
            return (false, false);
        }
        return (true, _decode(eventId));
    }

    /// @notice Three-way settlement state: `Pending` (wait), `Available`
    ///         (settle on `outcome`), or `Voided` (the event will never
    ///         resolve — consumers must refund). `outcome` is only meaningful
    ///         when `status == Available`.
    function getSettlement(bytes32 eventId)
        external
        view
        returns (IEventBus.Availability status, bool outcome)
    {
        status = eventBus.getAvailability(eventId);
        if (status == IEventBus.Availability.Available) {
            outcome = _decode(eventId);
        }
    }

    /// @notice `getSettlement` for many events at once (e.g. a
    ///         DistributionMarket's threshold ladder).
    function getSettlements(bytes32[] calldata eventIds)
        external
        view
        returns (IEventBus.Availability[] memory statuses, bool[] memory outcomes)
    {
        statuses = new IEventBus.Availability[](eventIds.length);
        outcomes = new bool[](eventIds.length);
        for (uint256 i = 0; i < eventIds.length; i++) {
            statuses[i] = eventBus.getAvailability(eventIds[i]);
            if (statuses[i] == IEventBus.Availability.Available) {
                outcomes[i] = _decode(eventIds[i]);
            }
        }
    }

    function _decode(bytes32 eventId) private view returns (bool) {
        IEventRegistry.Outcome memory o = eventBus.readOutcome(eventId);
        return abi.decode(o.outcomeData, (bool));
    }
}
