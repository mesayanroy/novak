// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEventBus} from "../contracts/interfaces/IEventBus.sol";
import {IEventRegistry} from "../contracts/interfaces/IEventRegistry.sol";

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
        IEventRegistry.Outcome memory o = eventBus.readOutcome(eventId);
        return (true, abi.decode(o.outcomeData, (bool)));
    }
}
