// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PositionManager
/// @notice Audit-trail ledger of individual deposits (YES/NO exposure) made
///         into a Market. Holds NO funds — Market.sol custodies collateral
///         directly (parimutuel pools, see Market.sol docs) and calls into
///         this contract purely to record a queryable per-position history
///         for the SDK/frontend (e.g. "list my positions").
/// @dev Only the Market (wired once via `setMarket`) may write, so every
///      record corresponds to real collateral actually received — anyone
///      being able to write records for arbitrary traders would let the
///      "my positions" view be spoofed. Must not import resolver or
///      Registry/Composer types — position accounting has no reason to know
///      how events are resolved, only what a Market tells it.
contract PositionManager {
    enum Side {
        Long, // backing YES
        Short // backing NO
    }

    struct Position {
        address trader;
        bytes32 marketId;
        Side side;
        uint256 size;
    }

    address public immutable owner;
    address public market;

    mapping(bytes32 => Position) public positions;
    uint256 private _nonce;

    event MarketSet(address indexed market);
    event PositionOpened(
        bytes32 indexed positionId,
        bytes32 indexed marketId,
        address indexed trader,
        Side side,
        uint256 size
    );

    constructor() {
        owner = msg.sender;
    }

    /// @notice One-time wiring of the Market allowed to record positions
    ///         (the two contracts reference each other, so this can't be a
    ///         constructor argument).
    function setMarket(address market_) external {
        require(msg.sender == owner, "PositionManager: not owner");
        require(market == address(0), "PositionManager: market already set");
        require(market_ != address(0), "PositionManager: zero address");
        market = market_;
        emit MarketSet(market_);
    }

    /// @notice Records a position on behalf of `trader`, called by the Market
    ///         at the moment it accepts real collateral from `trader`.
    function recordPosition(address trader, bytes32 marketId, Side side, uint256 size)
        external
        returns (bytes32 positionId)
    {
        require(msg.sender == market, "PositionManager: only market");
        positionId = keccak256(abi.encode(marketId, trader, side, size, block.timestamp, _nonce++));
        positions[positionId] =
            Position({ trader: trader, marketId: marketId, side: side, size: size });
        emit PositionOpened(positionId, marketId, trader, side, size);
    }
}
