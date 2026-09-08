// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISubscriptionManager
/// @notice MVP is pull-based; this interface is a stub for a deferred push-notification
///         layer. Do not build automatic callback/trigger execution against it yet —
///         "pull before push" is a hard MVP constraint. Kept here so consumers can be
///         written against a stable shape once push is implemented, without a breaking
///         interface change.
/// @dev TODO(deferred — do not implement business logic yet): delivery guarantees,
///      gas payment/incentive model for push delivery, and reentrancy/trust boundary
///      between the Bus and arbitrary consumer callbacks are all unresolved.
interface ISubscriptionManager {
    event Subscribed(bytes32 indexed topic, address indexed consumer);
    event Unsubscribed(bytes32 indexed topic, address indexed consumer);

    /// @notice Registers `consumer` interest in `topic` (e.g. an event ID or composite
    ///         ID becoming available). Stub only — MVP does not deliver notifications.
    function subscribe(bytes32 topic, address consumer) external;

    function unsubscribe(bytes32 topic, address consumer) external;

    function isSubscribed(bytes32 topic, address consumer) external view returns (bool);
}
