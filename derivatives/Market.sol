// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEventBus} from "../contracts/interfaces/IEventBus.sol";

/// @title Market
/// @notice First consumer application of the Event Bus: a derivatives market whose
///         contracts settle against composite (or primitive) event outcomes.
/// @dev ARCHITECTURAL INVARIANT: this contract MUST only ever import/call IEventBus.
///      It must never import a resolver, the Registry, or the Composer directly.
///      That boundary is the whole point of the Bus — do not weaken it for
///      convenience.
contract Market {
    IEventBus public immutable eventBus;

    struct MarketDef {
        bytes32 eventId; // primitive or composite event ID this market settles against
        uint64 createdAt;
        bool settled;
        bool outcome;
    }

    mapping(bytes32 => MarketDef) public markets;

    event MarketCreated(bytes32 indexed marketId, bytes32 indexed eventId);
    event MarketSettled(bytes32 indexed marketId, bool outcome);

    constructor(address eventBus_) {
        eventBus = IEventBus(eventBus_);
    }

    /// @notice Opens a market that will settle against `eventId`'s outcome once
    ///         available via the Bus.
    /// @dev TODO(protocol semantics): marketId derivation scheme + whether multiple
    ///      markets may reference the same eventId. Left as a simple hash for
    ///      scaffolding.
    function createMarket(bytes32 eventId) external returns (bytes32 marketId) {
        marketId = keccak256(abi.encode(eventId, block.timestamp, msg.sender));
        markets[marketId] = MarketDef({
            eventId: eventId,
            createdAt: uint64(block.timestamp),
            settled: false,
            outcome: false
        });
        emit MarketCreated(marketId, eventId);
    }

    /// @notice Pulls the finalized outcome from the Bus and settles the market.
    ///         See Settlement.sol / PositionManager.sol for payout logic (unimplemented).
    function settle(bytes32 marketId) external {
        MarketDef storage m = markets[marketId];
        require(m.createdAt != 0, "Market: unknown market");
        require(!m.settled, "Market: already settled");
        require(eventBus.isAvailable(m.eventId), "Market: event not finalized");

        // TODO: decode IEventRegistry.Outcome.outcomeData into a boolean/settlement
        // value once the outcome payload schema (per EventSpec.specVersion) is fixed.
        // Placeholder below treats any finalized outcome as `true`.
        eventBus.readOutcome(m.eventId);
        m.settled = true;
        m.outcome = true;

        emit MarketSettled(marketId, m.outcome);

        // TODO: hand off to Settlement.sol / PositionManager.sol for payout
        // distribution once position accounting is implemented.
    }
}
