// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {EventRegistry} from "../contracts/EventRegistry.sol";
import {EventComposer} from "../contracts/EventComposer.sol";
import {EventBus} from "../contracts/EventBus.sol";
import {SubscriptionManager} from "../contracts/SubscriptionManager.sol";
import {Market} from "../derivatives/Market.sol";
import {Settlement} from "../derivatives/Settlement.sol";
import {PositionManager} from "../derivatives/PositionManager.sol";

/// @notice Deploys the full stack in dependency order: Registry -> Composer -> Bus
///         -> SubscriptionManager -> derivatives package. Run against a local anvil
///         node or a testnet via the `local` / `testnet` rpc_endpoints in foundry.toml.
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url local --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        EventRegistry registry = new EventRegistry();
        EventComposer composer = new EventComposer(address(registry));
        EventBus bus = new EventBus(address(registry), address(composer));
        SubscriptionManager subscriptions = new SubscriptionManager();

        Market market = new Market(address(bus));
        Settlement settlement = new Settlement(address(bus));
        PositionManager positionManager = new PositionManager();

        vm.stopBroadcast();

        console.log("EventRegistry:       ", address(registry));
        console.log("EventComposer:       ", address(composer));
        console.log("EventBus:            ", address(bus));
        console.log("SubscriptionManager: ", address(subscriptions));
        console.log("Market:              ", address(market));
        console.log("Settlement:          ", address(settlement));
        console.log("PositionManager:     ", address(positionManager));
    }
}
