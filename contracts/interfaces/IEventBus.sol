// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IEventRegistry } from "./IEventRegistry.sol";

/// @title IEventBus
/// @notice Pull-based read surface for finalized events. This is the ONLY interface
///         application contracts (e.g. the derivatives Market) are allowed to depend
///         on for event data — never the Registry directly, and never a resolver.
/// @dev MVP is pull-only: consumers call `readOutcome` (or equivalent) when they need
///      data, typically at settlement time. No push/callback delivery in the MVP —
///      see SubscriptionManager for the (currently stubbed) future push path.
interface IEventBus {
    /// @notice Reverts if the event is not finalized. Use `isAvailable` to check first.
    function readOutcome(bytes32 eventId)
        external
        view
        returns (IEventRegistry.Outcome memory outcome);

    /// @notice True once an event (primitive or composite) has a finalized outcome
    ///         available for consumption.
    function isAvailable(bytes32 eventId) external view returns (bool);

    /// @dev Emitted when the Bus observes an event becoming available, purely for
    ///      off-chain indexers — this is NOT a push-delivery mechanism to consumer
    ///      contracts. Consumers must still pull.
    event EventAvailable(bytes32 indexed eventId);
}
