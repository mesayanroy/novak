// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PositionManager
/// @notice Tracks user positions (long/short exposure) opened against a Market.
///         Skeleton only — no collateral, margin, or liquidation logic yet, per MVP
///         scope (complex liquidation systems are explicitly deferred).
/// @dev Must not import resolver or Registry/Composer types — position accounting has
///      no reason to know how events are resolved, only what a Market tells it.
contract PositionManager {
    enum Side {
        Long,
        Short
    }

    struct Position {
        address trader;
        bytes32 marketId;
        Side side;
        uint256 size;
        bool closed;
    }

    mapping(bytes32 => Position) public positions;

    event PositionOpened(
        bytes32 indexed positionId, bytes32 indexed marketId, address indexed trader, Side side, uint256 size
    );
    event PositionClosed(bytes32 indexed positionId);

    /// @notice Opens a position against `marketId`. Collateral transfer/escrow is
    ///         NOT implemented in this scaffold.
    /// @dev TODO(protocol semantics): collateral asset, margin requirements, and
    ///      position sizing rules are all deferred (see docs/protocol-spec.md MVP
    ///      scope) — do not guess these before the market design is confirmed.
    function openPosition(bytes32 marketId, Side side, uint256 size)
        external
        returns (bytes32 positionId)
    {
        positionId = keccak256(abi.encode(marketId, msg.sender, side, size, block.timestamp));
        positions[positionId] =
            Position({trader: msg.sender, marketId: marketId, side: side, size: size, closed: false});
        emit PositionOpened(positionId, marketId, msg.sender, side, size);
    }

    /// @notice Marks a position closed. Payout calculation happens in Settlement.sol.
    function closePosition(bytes32 positionId) external {
        Position storage p = positions[positionId];
        require(p.trader == msg.sender, "PositionManager: not owner");
        require(!p.closed, "PositionManager: already closed");
        p.closed = true;
        emit PositionClosed(positionId);
    }
}
