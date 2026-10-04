// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { EventRegistry } from "../contracts/EventRegistry.sol";
import { DisputeManager } from "../contracts/DisputeManager.sol";
import { EventComposer } from "../contracts/EventComposer.sol";
import { EventBus } from "../contracts/EventBus.sol";
import { SubscriptionManager } from "../contracts/SubscriptionManager.sol";
import { TreasuryVault } from "../contracts/TreasuryVault.sol";
import { MockUSDG } from "../contracts/mocks/MockUSDG.sol";
import { Market } from "../derivatives/Market.sol";
import { DistributionMarket } from "../derivatives/DistributionMarket.sol";
import { Settlement } from "../derivatives/Settlement.sol";
import { PositionManager } from "../derivatives/PositionManager.sol";
import { StockLendingGuard } from "../consumers/StockLendingGuard.sol";

/// @notice Deploys the full stack in dependency order:
///         Registry -> Composer -> TreasuryVault -> DisputeManager (treasury =
///         vault; wired back into Registry and vault) -> Bus ->
///         SubscriptionManager -> Settlement -> PositionManager -> Market ->
///         DistributionMarket -> StockLendingGuard, then authorizes resolvers.
///
///         Every protocol fee and the treasury third of every forfeited
///         dispute bond flows into the TreasuryVault, which splits market fees
///         into thirds per event (resolvers / committee or insurance /
///         treasury) — see contracts/TreasuryVault.sol.
///
///         Collateral: uses `COLLATERAL_TOKEN_ADDRESS` if set; otherwise
///         deploys `MockUSDG` — allowed everywhere EXCEPT Robinhood Chain
///         mainnet (4663), where real USDG must be passed explicitly.
///
/// Env:
///   DEPLOYER_PRIVATE_KEY      (required)
///   VAULT_OWNER               (default: deployer) — can spend treasury/insurance
///   RISK_ADMIN_ADDRESS        (default: deployer) — StockLendingGuard rules
///   RESOLVER_ADDRESSES        (optional) comma-separated, authorized in-script
///   COLLATERAL_TOKEN_ADDRESS  (optional) see above
///   MARKET_FEE_BPS            (default: 100 = 1%) — binary Market fee on the losing pool
///   TRADE_FEE_BPS             (default: 100 = 1%) — DistributionMarket fee per trade
///
/// Usage (Robinhood Chain testnet):
///   forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast --verify
///   node script/export-deployment.mjs 46630   # -> deployments/46630.json
contract Deploy is Script {
    uint256 internal constant ROBINHOOD_MAINNET = 4663;

    struct Config {
        uint256 deployerKey;
        address deployer;
        address vaultOwner;
        address riskAdmin;
        address collateral;
        uint256 marketFeeBps;
        uint256 tradeFeeBps;
        address[] resolvers;
    }

    struct Core {
        EventRegistry registry;
        EventComposer composer;
        TreasuryVault vault;
        DisputeManager disputeManager;
        EventBus bus;
        Settlement settlement;
    }

    function run() external {
        Config memory cfg = _config();
        vm.startBroadcast(cfg.deployerKey);

        if (cfg.collateral == address(0)) {
            cfg.collateral = address(new MockUSDG());
        }
        Core memory c = _deployCore(cfg);

        SubscriptionManager subscriptions = new SubscriptionManager();
        PositionManager positionManager = new PositionManager();
        Market market = new Market(
            address(c.settlement),
            address(positionManager),
            cfg.collateral,
            address(c.vault),
            cfg.marketFeeBps
        );
        positionManager.setMarket(address(market));
        DistributionMarket dist = new DistributionMarket(
            address(c.settlement), cfg.collateral, address(c.vault), cfg.tradeFeeBps
        );
        StockLendingGuard guard = new StockLendingGuard(address(c.bus), cfg.riskAdmin);

        for (uint256 i = 0; i < cfg.resolvers.length; i++) {
            c.registry.setResolverAuthorization(cfg.resolvers[i], true);
        }
        if (cfg.vaultOwner != cfg.deployer) c.vault.transferOwnership(cfg.vaultOwner);

        vm.stopBroadcast();

        console.log("Chain ID:            ", block.chainid);
        console.log("Collateral (USDG):   ", cfg.collateral);
        console.log("EventRegistry:       ", address(c.registry));
        console.log("DisputeManager:      ", address(c.disputeManager));
        console.log("EventComposer:       ", address(c.composer));
        console.log("EventBus:            ", address(c.bus));
        console.log("TreasuryVault:       ", address(c.vault));
        console.log("SubscriptionManager: ", address(subscriptions));
        console.log("Settlement:          ", address(c.settlement));
        console.log("PositionManager:     ", address(positionManager));
        console.log("Market:              ", address(market));
        console.log("DistributionMarket:  ", address(dist));
        console.log("StockLendingGuard:   ", address(guard));
        console.log("Resolvers authorized:", cfg.resolvers.length);
    }

    function _config() internal view returns (Config memory cfg) {
        cfg.deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        cfg.deployer = vm.addr(cfg.deployerKey);
        cfg.vaultOwner = vm.envOr("VAULT_OWNER", cfg.deployer);
        cfg.riskAdmin = vm.envOr("RISK_ADMIN_ADDRESS", cfg.deployer);
        cfg.collateral = vm.envOr("COLLATERAL_TOKEN_ADDRESS", address(0));
        cfg.marketFeeBps = vm.envOr("MARKET_FEE_BPS", uint256(100));
        cfg.tradeFeeBps = vm.envOr("TRADE_FEE_BPS", uint256(100));
        cfg.resolvers = vm.envOr("RESOLVER_ADDRESSES", ",", new address[](0));
        require(
            cfg.collateral != address(0) || block.chainid != ROBINHOOD_MAINNET,
            "Deploy: set COLLATERAL_TOKEN_ADDRESS (real USDG) on mainnet"
        );
    }

    /// @dev The vault is deployed with the deployer as owner so it can wire the
    ///      DisputeManager (one-time, owner-only); ownership moves to
    ///      VAULT_OWNER at the end of `run`.
    function _deployCore(Config memory cfg) internal returns (Core memory c) {
        c.registry = new EventRegistry();
        c.composer = new EventComposer(address(c.registry));
        c.vault = new TreasuryVault(
            cfg.collateral, address(c.registry), address(c.composer), cfg.deployer
        );
        c.disputeManager = new DisputeManager(address(c.registry), address(c.vault));
        c.registry.setDisputeManager(address(c.disputeManager));
        c.vault.setDisputeManager(address(c.disputeManager));
        c.bus = new EventBus(address(c.registry), address(c.composer));
        c.settlement = new Settlement(address(c.bus));
    }
}
