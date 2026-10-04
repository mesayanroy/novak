// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Settlement } from "./Settlement.sol";
import { PositionManager } from "./PositionManager.sol";
import { IERC20Minimal } from "./interfaces/IERC20Minimal.sol";
import { IEventBus } from "../contracts/interfaces/IEventBus.sol";
import { ITreasuryVault } from "../contracts/interfaces/ITreasuryVault.sol";

/// @title Market
/// @notice First consumer application of the Event Bus: a binary (YES/NO)
///         market that settles against a primitive or composite event
///         outcome, collateralized in an ERC-20 stablecoin (USDG on Robinhood
///         Chain; MockUSDG on testnet). Uses a simple parimutuel model for the
///         MVP (deferred: AMM pricing, leverage, liquidation — see
///         docs/protocol-spec.md MVP scope): YES backers pool their stake, NO
///         backers pool theirs, and once the market settles the winning side
///         splits the losing side's pool (minus the protocol fee) pro-rata to
///         stake, plus gets its own stake back. If nobody backed the winning
///         side, everyone is refunded their own stake and no fee is taken.
///         Trivially solvent: payouts + fee can never exceed deposits.
///
///         Lifecycle safety (both were real exploits in the previous version,
///         see test/unit/Market.t.sol regression tests):
///         - Trading (deposits AND withdrawals) stops at `tradingClosesAt`.
///           Otherwise the losing side could withdraw its stake once the
///           outcome became public but before anyone called `settle`.
///         - As a backstop, deposits also revert once the Bus reports the
///           event decided (`Available`/`Voided`), even before close time.
///         - If the event can never resolve (`Voided`: a voided/expired
///           primitive, or a composite that propagated it), the market enters
///           `Refunding` and everyone reclaims their own stake — funds are
///           never locked forever.
/// @dev ARCHITECTURAL INVARIANT: settlement is delegated to `Settlement`, which
///      itself only depends on IEventBus. This contract MUST NOT import or call
///      a resolver, the Registry, or the Composer directly (it imports
///      IEventBus solely for the `Availability` enum type Settlement returns).
///      The `tradingClosesAt <= event openTimestamp` relationship can't be
///      checked here for that reason — market creators (the frontend
///      templates) are responsible for choosing it; depositors can see it.
contract Market {
    enum MarketStatus {
        Open,
        Settled,
        Refunding
    }

    struct MarketDef {
        bytes32 eventId; // primitive or composite event ID this market settles against
        address creator;
        uint64 createdAt;
        uint64 tradingClosesAt;
        MarketStatus status;
        bool outcome;
        uint256 yesPool;
        uint256 noPool;
        uint256 feeTaken;
        string question;
    }

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 500;
    uint256 public constant MAX_QUESTION_LENGTH = 280;

    Settlement public immutable settlement;
    PositionManager public immutable positionManager;
    IERC20Minimal public immutable collateral;
    /// @dev The TreasuryVault: the protocol fee is pushed there tagged with
    ///      this market's event ID, and split into thirds (resolvers /
    ///      committee or insurance / treasury) once the event is decided.
    address public immutable treasury;
    uint256 public immutable feeBps;

    mapping(bytes32 => MarketDef) private _markets;
    bytes32[] private _marketIds;
    uint256 private _nonce;
    uint256 private _lock = 1;

    mapping(bytes32 => mapping(address => uint256)) public yesBalance;
    mapping(bytes32 => mapping(address => uint256)) public noBalance;
    mapping(bytes32 => mapping(address => bool)) public claimed;

    event MarketCreated(
        bytes32 indexed marketId,
        bytes32 indexed eventId,
        address indexed creator,
        uint64 tradingClosesAt,
        string question
    );
    event CollateralDeposited(
        bytes32 indexed marketId, address indexed trader, bool backingYes, uint256 amount
    );
    event PositionWithdrawn(
        bytes32 indexed marketId, address indexed trader, bool backingYes, uint256 amount
    );
    event MarketSettled(bytes32 indexed marketId, bool outcome, uint256 fee);
    event MarketRefunding(bytes32 indexed marketId);
    event Claimed(bytes32 indexed marketId, address indexed trader, uint256 amount);

    modifier nonReentrant() {
        require(_lock == 1, "Market: reentrant");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(
        address settlement_,
        address positionManager_,
        address collateral_,
        address treasury_,
        uint256 feeBps_
    ) {
        require(feeBps_ <= MAX_FEE_BPS, "Market: fee too high");
        require(collateral_ != address(0) && treasury_ != address(0), "Market: zero address");
        settlement = Settlement(settlement_);
        positionManager = PositionManager(positionManager_);
        collateral = IERC20Minimal(collateral_);
        treasury = treasury_;
        feeBps = feeBps_;
    }

    // --- Market lifecycle ---

    /// @notice Opens a market that will settle against `eventId`'s outcome once
    ///         available via the Bus (through Settlement). Deposits and
    ///         withdrawals are accepted until `tradingClosesAt`.
    function createMarket(bytes32 eventId, uint64 tradingClosesAt, string calldata question)
        external
        returns (bytes32 marketId)
    {
        require(tradingClosesAt > block.timestamp, "Market: close time in past");
        require(bytes(question).length <= MAX_QUESTION_LENGTH, "Market: question too long");
        (IEventBus.Availability eventStatus,) = settlement.getSettlement(eventId);
        require(eventStatus == IEventBus.Availability.Pending, "Market: event already decided");

        marketId = keccak256(abi.encode(eventId, msg.sender, _nonce++));
        MarketDef storage m = _markets[marketId];
        m.eventId = eventId;
        m.creator = msg.sender;
        m.createdAt = uint64(block.timestamp);
        m.tradingClosesAt = tradingClosesAt;
        m.question = question;
        _marketIds.push(marketId);

        emit MarketCreated(marketId, eventId, msg.sender, tradingClosesAt, question);
    }

    /// @notice Deposits `amount` of collateral backing YES or NO. Requires a
    ///         prior `approve` of this contract on the collateral token.
    function depositCollateral(bytes32 marketId, bool backingYes, uint256 amount)
        external
        nonReentrant
    {
        MarketDef storage m = _markets[marketId];
        _requireTradingOpen(m);
        require(amount > 0, "Market: zero deposit");
        (IEventBus.Availability eventStatus,) = settlement.getSettlement(m.eventId);
        require(eventStatus == IEventBus.Availability.Pending, "Market: outcome known");

        if (backingYes) {
            yesBalance[marketId][msg.sender] += amount;
            m.yesPool += amount;
        } else {
            noBalance[marketId][msg.sender] += amount;
            m.noPool += amount;
        }

        _safeTransferFrom(msg.sender, amount);
        positionManager.recordPosition(
            msg.sender,
            marketId,
            backingYes ? PositionManager.Side.Long : PositionManager.Side.Short,
            amount
        );

        emit CollateralDeposited(marketId, msg.sender, backingYes, amount);
    }

    /// @notice Withdraws up to `amount` of the caller's own stake — only
    ///         while trading is open.
    function closePosition(bytes32 marketId, bool backingYes, uint256 amount)
        external
        nonReentrant
    {
        MarketDef storage m = _markets[marketId];
        _requireTradingOpen(m);
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

        _safeTransfer(msg.sender, amount);
        emit PositionWithdrawn(marketId, msg.sender, backingYes, amount);
    }

    /// @notice Pulls the event's state (via Settlement -> EventBus) and
    ///         either locks in the outcome or, if the event will never
    ///         resolve, switches the market to refunds. Callable by anyone.
    function settle(bytes32 marketId) external nonReentrant {
        MarketDef storage m = _markets[marketId];
        require(m.createdAt != 0, "Market: unknown market");
        require(m.status == MarketStatus.Open, "Market: already settled");

        (IEventBus.Availability eventStatus, bool outcome) = settlement.getSettlement(m.eventId);
        require(eventStatus != IEventBus.Availability.Pending, "Market: event not finalized");

        if (eventStatus == IEventBus.Availability.Voided) {
            m.status = MarketStatus.Refunding;
            emit MarketRefunding(marketId);
            return;
        }

        m.status = MarketStatus.Settled;
        m.outcome = outcome;
        uint256 winnerPool = outcome ? m.yesPool : m.noPool;
        uint256 loserPool = outcome ? m.noPool : m.yesPool;
        uint256 fee = (winnerPool > 0) ? (loserPool * feeBps) / BPS : 0;
        m.feeTaken = fee;

        if (fee > 0) _payFee(m.eventId, fee);
        emit MarketSettled(marketId, outcome, fee);
    }

    /// @notice Claims the caller's payout after settlement (or their refund
    ///         in `Refunding`).
    function claim(bytes32 marketId) external nonReentrant {
        MarketDef storage m = _markets[marketId];
        require(m.status != MarketStatus.Open, "Market: not settled");
        require(!claimed[marketId][msg.sender], "Market: already claimed");

        uint256 payout = _computePayout(marketId, msg.sender);
        require(payout > 0, "Market: nothing to claim");

        claimed[marketId][msg.sender] = true;
        _safeTransfer(msg.sender, payout);

        emit Claimed(marketId, msg.sender, payout);
    }

    // --- Views ---

    function getMarket(bytes32 marketId) external view returns (MarketDef memory) {
        return _markets[marketId];
    }

    function marketCount() external view returns (uint256) {
        return _marketIds.length;
    }

    /// @notice Paginated enumeration (newest last), so frontends can list
    ///         markets without an indexer.
    function getMarketIds(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory ids)
    {
        uint256 total = _marketIds.length;
        if (offset >= total) return new bytes32[](0);
        uint256 end = offset + limit > total ? total : offset + limit;
        ids = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            ids[i - offset] = _marketIds[i];
        }
    }

    /// @notice What `trader` would receive from `claim` right now (0 while
    ///         the market is open or once already claimed).
    function payoutOf(bytes32 marketId, address trader) external view returns (uint256) {
        if (_markets[marketId].status == MarketStatus.Open || claimed[marketId][trader]) return 0;
        return _computePayout(marketId, trader);
    }

    // --- Internal ---

    function _requireTradingOpen(MarketDef storage m) private view {
        require(m.createdAt != 0, "Market: unknown market");
        require(m.status == MarketStatus.Open, "Market: already settled");
        require(block.timestamp < m.tradingClosesAt, "Market: trading closed");
    }

    function _computePayout(bytes32 marketId, address trader) private view returns (uint256) {
        MarketDef storage m = _markets[marketId];
        uint256 ownStake = yesBalance[marketId][trader] + noBalance[marketId][trader];
        if (m.status == MarketStatus.Refunding) return ownStake;

        uint256 winnerPool = m.outcome ? m.yesPool : m.noPool;
        uint256 loserPool = m.outcome ? m.noPool : m.yesPool;
        if (winnerPool == 0) {
            // Nobody backed the winning side — refund everyone their own stake.
            return ownStake;
        }
        uint256 winnerStake = m.outcome ? yesBalance[marketId][trader] : noBalance[marketId][trader];
        if (winnerStake == 0) return 0;
        return winnerStake + (winnerStake * (loserPool - m.feeTaken)) / winnerPool;
    }

    function _payFee(bytes32 eventId, uint256 fee) private {
        (bool ok, bytes memory data) =
            address(collateral).call(abi.encodeCall(IERC20Minimal.approve, (treasury, fee)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "Market: approve failed");
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = eventId;
        ITreasuryVault(treasury).depositFees(ids, fee);
    }

    function _safeTransfer(address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            address(collateral).call(abi.encodeCall(IERC20Minimal.transfer, (to, amount)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "Market: transfer failed");
    }

    function _safeTransferFrom(address from, uint256 amount) private {
        (bool ok, bytes memory data) = address(collateral)
            .call(abi.encodeCall(IERC20Minimal.transferFrom, (from, address(this), amount)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "Market: transferFrom failed");
    }
}
