// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {EventRegistry} from "../contracts/EventRegistry.sol";
import {DisputeManager} from "../contracts/DisputeManager.sol";
import {EventComposer} from "../contracts/EventComposer.sol";
import {EventBus} from "../contracts/EventBus.sol";
import {SubscriptionManager} from "../contracts/SubscriptionManager.sol";
import {Market} from "../derivatives/Market.sol";
import {Settlement} from "../derivatives/Settlement.sol";
import {PositionManager} from "../derivatives/PositionManager.sol";

/// @notice Deploys the full stack in dependency order: Registry -> DisputeManager
///         (wired back into Registry via `setDisputeManager`, since the two have
///         a circular reference) -> Composer -> Bus -> SubscriptionManager ->
///         Settlement -> PositionManager -> Market. Run against a local anvil
///         node or a testnet via the `local` / `testnet` rpc_endpoints in
///         foundry.toml.
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url local --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        vm.startBroadcast(deployerKey);

        EventRegistry registry = new EventRegistry();
        // DisputeManager needs the Registry's address, and the Registry needs
        // DisputeManager's address for its onlyDisputeManager transitions —
        // resolved by deploying Registry first and wiring it after.
        // `treasury` reuses the deployer address for the MVP (same role as
        // the old owner-arbitration forfeiture recipient).
        DisputeManager disputeManager = new DisputeManager(address(registry), deployer);
        registry.setDisputeManager(address(disputeManager));

        EventComposer composer = new EventComposer(address(registry));
        EventBus bus = new EventBus(address(registry), address(composer));
        SubscriptionManager subscriptions = new SubscriptionManager();

        Settlement settlement = new Settlement(address(bus));
        PositionManager positionManager = new PositionManager();
        Market market = new Market(address(settlement), address(positionManager));

        vm.stopBroadcast();

        console.log("EventRegistry:       ", address(registry));
        console.log("DisputeManager:      ", address(disputeManager));
        console.log("EventComposer:       ", address(composer));
        console.log("EventBus:            ", address(bus));
        console.log("SubscriptionManager: ", address(subscriptions));
        console.log("Settlement:          ", address(settlement));
        console.log("PositionManager:     ", address(positionManager));
        console.log("Market:              ", address(market));
    }
}
