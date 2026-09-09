// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Settlement} from "./Settlement.sol";
import {PositionManager} from "./PositionManager.sol";

/// @title Market
/// @notice First consumer application of the Event Bus: a binary (YES/NO)
///         derivatives market that settles against a primitive or composite
///         event outcome. Uses a simple parimutuel model for the MVP (deferred:
///         AMM pricing, leverage, liquidation — see docs/protocol-spec.md MVP
///         scope): everyone backing YES pools their ETH, everyone backing NO
///         pools theirs, and once the market settles, the winning side splits
///         the losing side's pool pro-rata to stake (plus gets its own stake
///         back). If nobody backed the winning side, everyone is refunded
///         their own stake. This is trivially solvent: total payouts can never
///         exceed total deposits.
/// @dev ARCHITECTURAL INVARIANT: settlement is delegated to `Settlement`, which
///      itself only depends on IEventBus. This contract MUST NOT import or call
///      a resolver, the Registry, or the Composer directly.
contract Market {
    Settlement public immutable settlement;
    PositionManager public immutable positionManager;

    struct MarketDef {
        bytes32 eventId; // primitive or composite event ID this market settles against
        uint64 createdAt;
        bool settled;
        bool outcome;
        uint256 yesPool;
        uint256 noPool;
    }

    mapping(bytes32 => MarketDef) public markets;
    mapping(bytes32 => mapping(address => uint256)) public yesBalance;
    mapping(bytes32 => mapping(address => uint256)) public noBalance;
    mapping(bytes32 => mapping(address => bool)) public claimed;

    event MarketCreated(bytes32 indexed marketId, bytes32 indexed eventId);
    event CollateralDeposited(
        bytes32 indexed marketId, address indexed trader, bool backingYes, uint256 amount
    );
    event PositionWithdrawn(
        bytes32 indexed marketId, address indexed trader, bool backingYes, uint256 amount
    );
    event MarketSettled(bytes32 indexed marketId, bool outcome);
    event Claimed(bytes32 indexed marketId, address indexed trader, uint256 amount);

    constructor(address settlement_, address positionManager_) {
        settlement = Settlement(settlement_);
        positionManager = PositionManager(positionManager_);
    }

    /// @notice Opens a market that will settle against `eventId`'s outcome once
    ///         available via the Bus (through Settlement).
    function createMarket(bytes32 eventId) external returns (bytes32 marketId) {
        marketId = keccak256(abi.encode(eventId, block.timestamp, msg.sender));
        require(markets[marketId].createdAt == 0, "Market: already exists");

        markets[marketId] = MarketDef({
            eventId: eventId,
            createdAt: uint64(block.timestamp),
            settled: false,
            outcome: false,
            yesPool: 0,
            noPool: 0
        });
        emit MarketCreated(marketId, eventId);
    }

    /// @notice Deposits `msg.value` ETH as collateral backing YES or NO for
    ///         `marketId`. Records a matching entry in PositionManager for
    ///         auditability.
    function depositCollateral(bytes32 marketId, bool backingYes) external payable {
        MarketDef storage m = markets[marketId];
        require(m.createdAt != 0, "Market: unknown market");
        require(!m.settled, "Market: already settled");
        require(msg.value > 0, "Market: zero deposit");

        if (backingYes) {
            yesBalance[marketId][msg.sender] += msg.value;
            m.yesPool += msg.value;
        } else {
            noBalance[marketId][msg.sender] += msg.value;
            m.noPool += msg.value;
        }

        positionManager.recordPosition(
            msg.sender,
            marketId,
            backingYes ? PositionManager.Side.Long : PositionManager.Side.Short,
            msg.value
        );

        emit CollateralDeposited(marketId, msg.sender, backingYes, msg.value);
    }

    /// @notice Withdraws up to `amount` of the caller's own stake before the
    ///         market settles. There is no partial-withdrawal position lookup
    ///         in PositionManager for this (it's a pool, not per-position
    ///         accounting) — this only affects the caller's own balance/pool.
    function closePosition(bytes32 marketId, bool backingYes, uint256 amount) external {
        MarketDef storage m = markets[marketId];
        require(!m.settled, "Market: already settled");
        require(amount > 0, "Market: zero amount");

        if (backingYes) {
            require(yesBalance[marketId][msg.sender] >= amount, "Market: insufficient balance");
            yesBalance[marketId][msg.sender] -= amount;
            m.yesPool -= amount;
        } else {
            require(noBalance[marketId][msg.sender] >= amount, "Market: insufficient balance");
            noBalance[marketId][msg.sender] -= amount;
            m.noPool -= amount;
        }

        (bool sent,) = msg.sender.call{value: amount}("");
        require(sent, "Market: refund transfer failed");

        emit PositionWithdrawn(marketId, msg.sender, backingYes, amount);
    }

    /// @notice Pulls the finalized outcome (via Settlement -> EventBus) and
    ///         locks in the market's settlement outcome. Callable by anyone
    ///         once the underlying event is available.
    function settle(bytes32 marketId) external {
        MarketDef storage m = markets[marketId];
        require(m.createdAt != 0, "Market: unknown market");
        require(!m.settled, "Market: already settled");

        (bool available, bool outcome) = settlement.resolveOutcome(m.eventId);
        require(available, "Market: event not finalized");

        m.settled = true;
        m.outcome = outcome;
        emit MarketSettled(marketId, outcome);
    }

    /// @notice Claims the caller's payout after settlement. Winners receive
    ///         their own stake back plus a pro-rata share of the losing pool;
    ///         if nobody backed the winning side, everyone is refunded their
    ///         own stake.
    function claim(bytes32 marketId) external {
        MarketDef storage m = markets[marketId];
        require(m.settled, "Market: not settled");
        require(!claimed[marketId][msg.sender], "Market: already claimed");

        uint256 payout = _computePayout(marketId, msg.sender);
        require(payout > 0, "Market: nothing to claim");

        claimed[marketId][msg.sender] = true;

        (bool sent,) = msg.sender.call{value: payout}("");
        require(sent, "Market: payout transfer failed");

        emit Claimed(marketId, msg.sender, payout);
    }

    function _computePayout(bytes32 marketId, address trader) private view returns (uint256) {
        MarketDef storage m = markets[marketId];
        uint256 winnerPool = m.outcome ? m.yesPool : m.noPool;
        uint256 loserPool = m.outcome ? m.noPool : m.yesPool;
        uint256 winnerStake = m.outcome ? yesBalance[marketId][trader] : noBalance[marketId][trader];

        if (winnerPool == 0) {
            // Nobody backed the winning side — refund everyone their own stake.
            return yesBalance[marketId][trader] + noBalance[marketId][trader];
        }
        if (winnerStake == 0) {
            return 0;
        }
        return winnerStake + (winnerStake * loserPool) / winnerPool;
    }
}
