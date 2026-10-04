// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IEventBus } from "../../contracts/interfaces/IEventBus.sol";
import { IEventRegistry } from "../../contracts/interfaces/IEventRegistry.sol";

/// @title ExternalPredictionMarket — how a third-party market plugs into Novak
/// @notice A minimal binary market owned by ANOTHER protocol (a Polymarket-
///         style venue) that outsources resolution AND disputes to Novak:
///           1. it references an existing Novak event ID (or creates one);
///           2. it never runs its own oracle, quorum or dispute process —
///              Novak's resolvers, Tier-1/Tier-2 committees and void rules do;
///           3. at resolution it PULLS the outcome from the EventBus, and
///              treats `Voided` as "refund everyone" (Novak's guarantee that
///              an event that can never resolve never locks funds).
///         The only Novak dependency is `IEventBus` — never the Registry,
///         Composer or a resolver. This is the integration contract the
///         Novak SDK guide (docs/INTEGRATE.md) walks through.
/// @dev Deliberately tiny and ETH-denominated so the integration surface is
///      obvious; production venues keep their own order books / AMMs and only
///      swap their resolution step for the three Bus reads in `resolve`.
contract ExternalPredictionMarket {
    enum State {
        Trading,
        ResolvedYes,
        ResolvedNo,
        Refunding
    }

    IEventBus public immutable novak;
    bytes32 public immutable eventId;
    uint64 public immutable closesAt;
    State public state;

    mapping(address => uint256) public yesStake;
    mapping(address => uint256) public noStake;
    uint256 public totalYes;
    uint256 public totalNo;

    constructor(address novakEventBus, bytes32 eventId_, uint64 closesAt_) {
        novak = IEventBus(novakEventBus);
        eventId = eventId_;
        closesAt = closesAt_;
    }

    function bet(bool yes) external payable {
        require(state == State.Trading && block.timestamp < closesAt, "closed");
        require(novak.getAvailability(eventId) == IEventBus.Availability.Pending, "outcome known");
        if (yes) {
            yesStake[msg.sender] += msg.value;
            totalYes += msg.value;
        } else {
            noStake[msg.sender] += msg.value;
            totalNo += msg.value;
        }
    }

    /// @notice The whole integration: three reads from the Novak Event Bus.
    function resolve() external {
        require(state == State.Trading, "resolved");
        IEventBus.Availability a = novak.getAvailability(eventId);
        require(a != IEventBus.Availability.Pending, "not final yet");
        if (a == IEventBus.Availability.Voided) {
            state = State.Refunding;
            return;
        }
        IEventRegistry.Outcome memory o = novak.readOutcome(eventId);
        state = abi.decode(o.outcomeData, (bool)) ? State.ResolvedYes : State.ResolvedNo;
    }

    function claim() external {
        uint256 amount;
        if (state == State.Refunding) {
            amount = yesStake[msg.sender] + noStake[msg.sender];
        } else if (state == State.ResolvedYes && totalYes > 0) {
            amount = yesStake[msg.sender] + (yesStake[msg.sender] * totalNo) / totalYes;
        } else if (state == State.ResolvedNo && totalNo > 0) {
            amount = noStake[msg.sender] + (noStake[msg.sender] * totalYes) / totalNo;
        }
        require(amount > 0, "nothing to claim");
        yesStake[msg.sender] = 0;
        noStake[msg.sender] = 0;
        (bool ok,) = msg.sender.call{ value: amount }("");
        require(ok, "transfer failed");
    }
}
