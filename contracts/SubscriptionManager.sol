// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISubscriptionManager} from "./interfaces/ISubscriptionManager.sol";

/// @title SubscriptionManager
/// @notice Stub only. MVP is pull-based — this contract records subscription intent
///         but performs no notification delivery. Do not build callback/trigger
///         execution against this contract in the MVP.
contract SubscriptionManager is ISubscriptionManager {
    mapping(bytes32 => mapping(address => bool)) private _subscriptions;

    function subscribe(bytes32 topic, address consumer) external {
        _subscriptions[topic][consumer] = true;
        emit Subscribed(topic, consumer);
    }

    function unsubscribe(bytes32 topic, address consumer) external {
        _subscriptions[topic][consumer] = false;
        emit Unsubscribed(topic, consumer);
    }

    function isSubscribed(bytes32 topic, address consumer) external view returns (bool) {
        return _subscriptions[topic][consumer];
    }
}
