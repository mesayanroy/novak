// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { CommunityMarket } from "../derivatives/CommunityMarket.sol";

/// @notice Add-on deploy: CommunityMarket next to an existing deployment, using
///         that deployment's collateral (COLLATERAL_TOKEN_ADDRESS). Nothing else
///         changes. Then `node script/export-deployment.mjs <chainId>` merges
///         its address into deployments/<chainId>.json from this broadcast.
contract DeployCommunity is Script {
    function run() external {
        address collateral = vm.envAddress("COLLATERAL_TOKEN_ADDRESS");
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        CommunityMarket community = new CommunityMarket(collateral);
        vm.stopBroadcast();
        console.log("CommunityMarket:", address(community));
    }
}
