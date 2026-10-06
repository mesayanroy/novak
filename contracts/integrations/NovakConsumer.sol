// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IEventBus } from "../interfaces/IEventBus.sol";
import { IEventRegistry } from "../interfaces/IEventRegistry.sol";

/// @title NovakConsumer — drop-in base contract for markets settled by Novak
/// @notice Inherit this in any prediction market, AMM or range market to make
///         Novak its resolution AND dispute layer. You get:
///           - `novakResolution(id)`  Pending / True / False / Voided in one call;
///           - `whenNovakPending(id)` stop deposits/trades once the answer is known;
///           - `_settleWithNovak(id)` routes to your `_onNovakResolved` /
///             `_onNovakVoided` hooks (Voided = refund, never a guess);
///           - `novakRange(boundaries)` the range-market rule over an ascending
///             ladder of "value ≥ threshold_i" events (winning bucket = number
///             of TRUE boundaries; any void or inconsistent ladder ⇒ Voided);
///           - `_novakOutcome(id)` the outcome plus WHEN it happened (v2
///             payloads carry `occurredAt`; v1 falls back to `finalizedAt`).
///         Quorum, disputes, Tier-1/Tier-2 committees and the VOID floor all
///         happen in Novak — the inheriting market never runs an oracle.
/// @dev ARCHITECTURAL INVARIANT: the only Novak dependency is `IEventBus` —
///      never the Registry, Composer, DisputeManager or a resolver. Guarded by
///      test/unit/NovakIntegrations.t.sol::test_consumer_holdsOnlyEventBusReference.
///
///      Minimal use:
///        contract MyMarket is NovakConsumer {
///            constructor(address bus, bytes32 id) NovakConsumer(bus) { eventId = id; }
///            function deposit() external payable whenNovakPending(eventId) { … }
///            function resolve() external { _settleWithNovak(eventId); }
///            function _onNovakResolved(bytes32, bool yes) internal override { … pay winners … }
///            function _onNovakVoided(bytes32) internal override { … refund … }
///        }
abstract contract NovakConsumer {
    enum Resolution {
        Pending,
        True,
        False,
        Voided
    }

    /// @notice The Novak Event Bus on this chain (see `getDeployment(chainId).eventBus` in @novakoracle/sdk).
    IEventBus public immutable novak;

    /// @notice Upper bound on a range ladder (matches DistributionMarket: up to 10 buckets).
    uint256 internal constant NOVAK_MAX_BOUNDARIES = 9;

    constructor(address eventBus) {
        require(eventBus != address(0), "NovakConsumer: zero event bus");
        novak = IEventBus(eventBus);
    }

    // --- Reads ------------------------------------------------------------

    /// @notice One call for everything a market needs to know about an event.
    function novakResolution(bytes32 eventId) public view returns (Resolution) {
        IEventBus.Availability a = novak.getAvailability(eventId);
        if (a == IEventBus.Availability.Pending) return Resolution.Pending;
        if (a == IEventBus.Availability.Voided) return Resolution.Voided;
        return abi.decode(novak.readOutcome(eventId).outcomeData, (bool))
            ? Resolution.True
            : Resolution.False;
    }

    /// @notice The range-market rule over an ascending ladder of threshold events.
    /// @return status Pending until every boundary is decided; Voided if any
    ///         boundary is voided or the TRUEs don't form a prefix; else True.
    /// @return winningBucket Number of TRUE boundaries (0…n) when status is True.
    function novakRange(bytes32[] memory boundaries)
        public
        view
        returns (Resolution status, uint256 winningBucket)
    {
        require(
            boundaries.length > 0 && boundaries.length <= NOVAK_MAX_BOUNDARIES,
            "NovakConsumer: bad ladder"
        );
        bool sawFalse;
        bool voided;
        for (uint256 i = 0; i < boundaries.length; i++) {
            Resolution r = novakResolution(boundaries[i]);
            if (r == Resolution.Pending) return (Resolution.Pending, 0);
            if (r == Resolution.Voided) {
                voided = true;
            } else if (r == Resolution.True) {
                if (sawFalse) voided = true; // TRUE above a FALSE: impossible for an honest ladder
                winningBucket++;
            } else {
                sawFalse = true;
            }
        }
        if (voided) return (Resolution.Voided, 0);
        return (Resolution.True, winningBucket);
    }

    /// @notice A finalized outcome and when it happened. Reverts unless Available.
    function _novakOutcome(bytes32 eventId)
        internal
        view
        returns (bool outcome, uint64 occurredAt)
    {
        require(
            novak.getAvailability(eventId) == IEventBus.Availability.Available,
            "NovakConsumer: not available"
        );
        IEventRegistry.Outcome memory o = novak.readOutcome(eventId);
        if (o.outcomeData.length == 64) {
            (outcome, occurredAt) = abi.decode(o.outcomeData, (bool, uint64)); // specVersion 2
        } else {
            outcome = abi.decode(o.outcomeData, (bool));
            occurredAt = o.finalizedAt;
        }
    }

    // --- Guards & settlement ---------------------------------------------

    /// @notice Use on deposits / trades / position changes: once Novak has an
    ///         answer (or will never have one) nobody may trade on it.
    modifier whenNovakPending(bytes32 eventId) {
        require(novakResolution(eventId) == Resolution.Pending, "NovakConsumer: outcome known");
        _;
    }

    /// @notice Settle against Novak: calls exactly one of your hooks. Reverts while pending.
    function _settleWithNovak(bytes32 eventId) internal returns (Resolution r) {
        r = novakResolution(eventId);
        require(r != Resolution.Pending, "NovakConsumer: not decided yet");
        if (r == Resolution.Voided) _onNovakVoided(eventId);
        else _onNovakResolved(eventId, r == Resolution.True);
    }

    /// @dev Pay out on a decided outcome.
    function _onNovakResolved(bytes32 eventId, bool outcome) internal virtual;

    /// @dev Novak will never decide this event (voided / expired / no
    ///      agreement): give users their money back.
    function _onNovakVoided(bytes32 eventId) internal virtual;
}
