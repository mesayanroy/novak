// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PositionManager
/// @notice Audit-trail ledger of individual positions (YES/NO exposure) opened
///         against a Market. Holds NO funds — Market.sol custodies collateral
///         directly (parimutuel pools, see Market.sol docs) and calls into this
///         contract purely to record a queryable per-position history for the
///         SDK/frontend (e.g. "list my positions"). Because it holds no funds,
///         `recordPosition` trusts its caller to pass the real trader address —
///         that's a deliberate MVP trust simplification, safe only because this
///         contract is not a value boundary.
/// @dev Must not import resolver or Registry/Composer types — position accounting has
///      no reason to know how events are resolved, only what a Market tells it.
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
        bool closed;
    }

    mapping(bytes32 => Position) public positions;
    uint256 private _nonce;

    event PositionOpened(
        bytes32 indexed positionId, bytes32 indexed marketId, address indexed trader, Side side, uint256 size
    );
    event PositionClosed(bytes32 indexed positionId);

    /// @notice Self-service: caller opens a position record for themselves.
    ///         Available for direct SDK/demo use independent of a Market
    ///         contract; does not move any funds.
    function openPosition(bytes32 marketId, Side side, uint256 size)
        external
        returns (bytes32 positionId)
    {
        return _open(msg.sender, marketId, side, size);
    }

    /// @notice Records a position on behalf of `trader`. Intended to be called
    ///         by a Market contract at the moment it accepts real collateral
    ///         from `trader`, so the ledger's `trader` field reflects the
    ///         actual user rather than the calling Market contract's address.
    function recordPosition(address trader, bytes32 marketId, Side side, uint256 size)
        external
        returns (bytes32 positionId)
    {
        return _open(trader, marketId, side, size);
    }

    /// @notice Marks a position closed. Purely a ledger flag — actual refund/
    ///         payout of funds happens in Market.sol.
    function closePosition(bytes32 positionId) external {
        Position storage p = positions[positionId];
        require(p.trader == msg.sender, "PositionManager: not owner");
        require(!p.closed, "PositionManager: already closed");
        p.closed = true;
        emit PositionClosed(positionId);
    }

    function _open(address trader, bytes32 marketId, Side side, uint256 size)
        private
        returns (bytes32 positionId)
    {
        positionId = keccak256(abi.encode(marketId, trader, side, size, block.timestamp, _nonce++));
        positions[positionId] =
            Position({trader: trader, marketId: marketId, side: side, size: size, closed: false});
        emit PositionOpened(positionId, marketId, trader, side, size);
    }
}
