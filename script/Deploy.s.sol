// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { EventRegistry } from "../contracts/EventRegistry.sol";
import { DisputeManager } from "../contracts/DisputeManager.sol";
import { EventComposer } from "../contracts/EventComposer.sol";
import { EventBus } from "../contracts/EventBus.sol";
import { SubscriptionManager } from "../contracts/SubscriptionManager.sol";
import { MockUSDG } from "../contracts/mocks/MockUSDG.sol";
import { Market } from "../derivatives/Market.sol";
import { Settlement } from "../derivatives/Settlement.sol";
import { PositionManager } from "../derivatives/PositionManager.sol";
import { StockLendingGuard } from "../consumers/StockLendingGuard.sol";

/// @notice Deploys the full stack in dependency order: Registry -> DisputeManager
///         (wired back into Registry via `setDisputeManager`, since the two have
///         a circular reference) -> Composer -> Bus -> SubscriptionManager ->
///         Settlement -> PositionManager -> Market (wired back into
///         PositionManager via `setMarket`) -> StockLendingGuard, then
///         authorizes the resolver set.
///
///         Collateral: uses `COLLATERAL_TOKEN_ADDRESS` if set; otherwise
///         deploys `MockUSDG` — allowed everywhere EXCEPT Robinhood Chain
///         mainnet (4663), where real USDG must be passed explicitly.
///
/// Env:
///   DEPLOYER_PRIVATE_KEY      (required)
///   TREASURY_ADDRESS          (default: deployer) — dispute + market fees
///   RISK_ADMIN_ADDRESS        (default: deployer) — StockLendingGuard rules
///   RESOLVER_ADDRESSES        (optional) comma-separated, authorized in-script
///   COLLATERAL_TOKEN_ADDRESS  (optional) see above
///   MARKET_FEE_BPS            (default: 100 = 1%)
///
/// Usage (Robinhood Chain testnet):
///   forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast
///   node script/export-deployment.mjs 46630   # -> deployments/46630.json
contract Deploy is Script {
    uint256 internal constant ROBINHOOD_MAINNET = 4663;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        address riskAdmin = vm.envOr("RISK_ADMIN_ADDRESS", deployer);
        address collateral = vm.envOr("COLLATERAL_TOKEN_ADDRESS", address(0));
        uint256 feeBps = vm.envOr("MARKET_FEE_BPS", uint256(100));
        address[] memory resolvers = vm.envOr("RESOLVER_ADDRESSES", ",", new address[](0));

        require(
            collateral != address(0) || block.chainid != ROBINHOOD_MAINNET,
            "Deploy: set COLLATERAL_TOKEN_ADDRESS (real USDG) on mainnet"
        );

        vm.startBroadcast(deployerKey);

        if (collateral == address(0)) {
            collateral = address(new MockUSDG());
        }

        EventRegistry registry = new EventRegistry();
        DisputeManager disputeManager = new DisputeManager(address(registry), treasury);
        registry.setDisputeManager(address(disputeManager));

        EventComposer composer = new EventComposer(address(registry));
        EventBus bus = new EventBus(address(registry), address(composer));
        SubscriptionManager subscriptions = new SubscriptionManager();

        Settlement settlement = new Settlement(address(bus));
        PositionManager positionManager = new PositionManager();
        Market market = new Market(
            address(settlement), address(positionManager), collateral, treasury, feeBps
        );
        positionManager.setMarket(address(market));

        StockLendingGuard guard = new StockLendingGuard(address(bus), riskAdmin);

        for (uint256 i = 0; i < resolvers.length; i++) {
            registry.setResolverAuthorization(resolvers[i], true);
        }

        vm.stopBroadcast();

        console.log("Chain ID:            ", block.chainid);
        console.log("Collateral (USDG):   ", collateral);
        console.log("EventRegistry:       ", address(registry));
        console.log("DisputeManager:      ", address(disputeManager));
        console.log("EventComposer:       ", address(composer));
        console.log("EventBus:            ", address(bus));
        console.log("SubscriptionManager: ", address(subscriptions));
        console.log("Settlement:          ", address(settlement));
        console.log("PositionManager:     ", address(positionManager));
        console.log("Market:              ", address(market));
        console.log("StockLendingGuard:   ", address(guard));
        console.log("Resolvers authorized:", resolvers.length);
    }
}
