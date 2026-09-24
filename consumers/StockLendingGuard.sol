// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IEventBus } from "../contracts/interfaces/IEventBus.sol";
import { IEventRegistry } from "../contracts/interfaces/IEventRegistry.sol";

/// @title StockLendingGuard
/// @notice Second Event Bus consumer (alongside the derivatives Market): a
///         liquidation circuit-breaker a lending protocol on Robinhood Chain
///         can call before liquidating stock-token collateral.
///
///         Why: Robinhood Stock Tokens change their ERC-8056 `uiMultiplier` on
///         splits/dividends, which is a price discontinuity; Chainlink's
///         stock feeds hold the last price off-hours; and the token's
///         `oraclePaused()` flag is advisory, not enforced on-chain.
///         Chainlink explicitly provides no corporate-action calendar or
///         automated pause trigger. Liquidating through those windows can
///         wrongly liquidate healthy positions. Novak resolves those facts
///         (e.g. "NVDA multiplier change effective between T1 and T2",
///         "TSLA halted during session S") ONCE, and every protocol reads
///         the same finalized event — this guard and the Market can settle
///         on the very same event ID.
///
///         A risk admin attaches rules to a stock token: "while `now` is in
///         [pauseFrom, pauseUntil], if `eventId` resolved TRUE, liquidations
///         are paused". With `failClosed`, a rule whose event is still
///         unresolved inside its window also pauses (conservative default for
///         scheduled corporate actions). A `Voided` event never pauses.
/// @dev ARCHITECTURAL INVARIANT: holds only an `IEventBus` reference — never a
///      resolver, the Registry, or the Composer (it imports IEventRegistry
///      solely for the `Outcome` struct type the Bus returns). Guarded by
///      test/unit/StockLendingGuard.t.sol::test_guard_onlyHoldsEventBusReference.
contract StockLendingGuard {
    struct RiskRule {
        bytes32 eventId;
        uint64 pauseFrom;
        uint64 pauseUntil;
        bool failClosed;
    }

    uint256 public constant MAX_RULES_PER_TOKEN = 16;

    IEventBus public immutable eventBus;
    address public immutable riskAdmin;

    mapping(address => RiskRule[]) private _rules;

    event RiskRuleAdded(
        address indexed stockToken,
        bytes32 indexed eventId,
        uint64 pauseFrom,
        uint64 pauseUntil,
        bool failClosed
    );
    event RiskRulesCleared(address indexed stockToken);

    constructor(address eventBus_, address riskAdmin_) {
        eventBus = IEventBus(eventBus_);
        riskAdmin = riskAdmin_;
    }

    modifier onlyRiskAdmin() {
        require(msg.sender == riskAdmin, "StockLendingGuard: not risk admin");
        _;
    }

    function addRiskRule(
        address stockToken,
        bytes32 eventId,
        uint64 pauseFrom,
        uint64 pauseUntil,
        bool failClosed
    ) external onlyRiskAdmin {
        require(pauseUntil > pauseFrom, "StockLendingGuard: bad window");
        require(
            _rules[stockToken].length < MAX_RULES_PER_TOKEN, "StockLendingGuard: too many rules"
        );
        _rules[stockToken].push(RiskRule(eventId, pauseFrom, pauseUntil, failClosed));
        emit RiskRuleAdded(stockToken, eventId, pauseFrom, pauseUntil, failClosed);
    }

    function clearRiskRules(address stockToken) external onlyRiskAdmin {
        delete _rules[stockToken];
        emit RiskRulesCleared(stockToken);
    }

    /// @notice Whether liquidating `stockToken` collateral is safe right now.
    /// @return allowed False while any active rule's event says "risk".
    /// @return blockingEventId The first event responsible for a pause (0 if allowed).
    function canLiquidate(address stockToken)
        external
        view
        returns (bool allowed, bytes32 blockingEventId)
    {
        RiskRule[] storage rules = _rules[stockToken];
        for (uint256 i = 0; i < rules.length; i++) {
            RiskRule storage r = rules[i];
            if (block.timestamp < r.pauseFrom || block.timestamp > r.pauseUntil) continue;

            IEventBus.Availability status = eventBus.getAvailability(r.eventId);
            if (status == IEventBus.Availability.Available) {
                IEventRegistry.Outcome memory o = eventBus.readOutcome(r.eventId);
                if (abi.decode(o.outcomeData, (bool))) return (false, r.eventId);
            } else if (status == IEventBus.Availability.Pending && r.failClosed) {
                return (false, r.eventId);
            }
        }
        return (true, bytes32(0));
    }

    function getRiskRules(address stockToken) external view returns (RiskRule[] memory) {
        return _rules[stockToken];
    }
}
