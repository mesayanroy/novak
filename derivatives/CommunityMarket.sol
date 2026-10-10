// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20Minimal } from "./interfaces/IERC20Minimal.sol";

/// @title CommunityMarket — user-created, creator-resolved prediction pools
/// @notice Anyone can open a market on anything Novak's resolvers don't cover —
///         a football match, a bet between friends, an office challenge:
///           1. the creator writes the question, 2–8 outcomes ("Team A wins",
///              "Draw", "Team B wins by 2+"), when staking closes and the
///              deadline by which they must report the result;
///           2. players stake USDG on an outcome until staking closes;
///           3. the creator — the market's resolver — declares the result;
///           4. an objection window follows. If players holding more than a
///              third of the pool object, the market is VOIDED and everyone is
///              refunded. Otherwise anyone can finalize it after the window;
///           5. winners split the whole pool pro rata to their winning stake.
///         A creator who never reports by the deadline can't hold the pool
///         hostage: anyone can void the market and everyone is refunded. If
///         nobody backed the declared outcome, everyone is refunded too.
/// @dev Deliberately NOT part of the Novak event layer: it is resolved by its
///      creator, not by Novak's resolver quorum and dispute committees, so it
///      holds no reference to the Registry, EventBus or a resolver. Guarded by
///      test/unit/CommunityMarket.t.sol::test_holdsOnlyCollateralReference.
contract CommunityMarket {
    enum Status {
        Open, // staking until closesAt, then awaiting the creator's result
        Proposed, // creator declared an outcome; objection window running
        Resolved, // final: winners claim
        Voided // final: everyone claims their stake back
    }

    struct MarketInfo {
        address creator;
        uint64 createdAt;
        uint64 closesAt; // staking stops
        uint64 resolveBy; // creator must declare by this time
        uint64 objectionWindow; // seconds after the declaration
        uint64 proposedAt;
        Status status;
        uint8 nOutcomes;
        uint8 outcome; // declared / winning outcome
        uint256 totalPool;
        uint256 objectedStake;
        string question;
        string rules; // how the creator will decide (source, tie-breaks)
    }

    uint256 public constant MAX_OUTCOMES = 8;
    uint256 public constant MAX_QUESTION_LENGTH = 280;
    uint256 public constant MAX_RULES_LENGTH = 1000;
    uint64 public constant MIN_OBJECTION_WINDOW = 10 minutes;
    uint64 public constant MAX_OBJECTION_WINDOW = 7 days;
    uint64 public constant MAX_HORIZON = 365 days;

    IERC20Minimal public immutable collateral;

    mapping(bytes32 => MarketInfo) private _markets;
    mapping(bytes32 => string[]) private _labels;
    mapping(bytes32 => uint256[]) private _pools;
    mapping(bytes32 => mapping(address => uint256[])) private _stakes;
    mapping(bytes32 => mapping(address => uint256)) public stakedBy;
    mapping(bytes32 => mapping(address => bool)) public objected;
    mapping(bytes32 => mapping(address => bool)) public claimed;
    bytes32[] private _marketIds;
    uint256 private _nonce;
    uint256 private _lock = 1;

    event MarketCreated(
        bytes32 indexed marketId,
        address indexed creator,
        string question,
        string[] outcomes,
        uint64 closesAt,
        uint64 resolveBy,
        uint64 objectionWindow
    );
    event Staked(bytes32 indexed marketId, address indexed player, uint8 indexed outcome, uint256 amount);
    event OutcomeProposed(bytes32 indexed marketId, uint8 outcome, uint64 objectionEndsAt);
    event Objected(bytes32 indexed marketId, address indexed player, uint256 stake, uint256 objectedStake);
    event MarketResolved(bytes32 indexed marketId, uint8 outcome, uint256 totalPool);
    event MarketVoided(bytes32 indexed marketId, string reason);
    event Claimed(bytes32 indexed marketId, address indexed player, uint256 amount);

    modifier nonReentrant() {
        require(_lock == 1, "CommunityMarket: reentrant");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address collateral_) {
        require(collateral_ != address(0), "CommunityMarket: zero collateral");
        collateral = IERC20Minimal(collateral_);
    }

    // --- Create & stake ----------------------------------------------------

    function createMarket(
        string calldata question,
        string[] calldata outcomes,
        uint64 closesAt,
        uint64 resolveBy,
        uint64 objectionWindow,
        string calldata rules
    ) external returns (bytes32 marketId) {
        require(bytes(question).length > 0 && bytes(question).length <= MAX_QUESTION_LENGTH, "CommunityMarket: bad question");
        require(bytes(rules).length <= MAX_RULES_LENGTH, "CommunityMarket: rules too long");
        require(outcomes.length >= 2 && outcomes.length <= MAX_OUTCOMES, "CommunityMarket: 2-8 outcomes");
        for (uint256 i = 0; i < outcomes.length; i++) {
            require(bytes(outcomes[i]).length > 0 && bytes(outcomes[i]).length <= 64, "CommunityMarket: bad outcome label");
        }
        require(closesAt > block.timestamp, "CommunityMarket: close time in past");
        require(resolveBy > closesAt && resolveBy <= block.timestamp + MAX_HORIZON, "CommunityMarket: bad resolve deadline");
        require(
            objectionWindow >= MIN_OBJECTION_WINDOW && objectionWindow <= MAX_OBJECTION_WINDOW,
            "CommunityMarket: bad objection window"
        );

        // address(this) keeps IDs unique across Novak's market contracts (same creator, same nonce).
        marketId = keccak256(abi.encode(address(this), msg.sender, _nonce++, block.chainid));
        MarketInfo storage m = _markets[marketId];
        m.creator = msg.sender;
        m.createdAt = uint64(block.timestamp);
        m.closesAt = closesAt;
        m.resolveBy = resolveBy;
        m.objectionWindow = objectionWindow;
        m.nOutcomes = uint8(outcomes.length);
        m.question = question;
        m.rules = rules;
        for (uint256 i = 0; i < outcomes.length; i++) _labels[marketId].push(outcomes[i]);
        _pools[marketId] = new uint256[](outcomes.length);
        _marketIds.push(marketId);
        emit MarketCreated(marketId, msg.sender, question, outcomes, closesAt, resolveBy, objectionWindow);
    }

    function stake(bytes32 marketId, uint8 outcome, uint256 amount) external nonReentrant {
        MarketInfo storage m = _markets[marketId];
        require(m.createdAt != 0, "CommunityMarket: unknown market");
        require(m.status == Status.Open && block.timestamp < m.closesAt, "CommunityMarket: staking closed");
        require(outcome < m.nOutcomes, "CommunityMarket: bad outcome");
        require(amount > 0, "CommunityMarket: zero amount");
        _pull(msg.sender, amount);
        uint256[] storage s = _stakes[marketId][msg.sender];
        if (s.length == 0) {
            for (uint256 i = 0; i < m.nOutcomes; i++) s.push(0);
        }
        s[outcome] += amount;
        stakedBy[marketId][msg.sender] += amount;
        _pools[marketId][outcome] += amount;
        m.totalPool += amount;
        emit Staked(marketId, msg.sender, outcome, amount);
    }

    // --- Resolve -------------------------------------------------------------

    /// @notice The creator declares the result after staking closes, before `resolveBy`.
    function proposeOutcome(bytes32 marketId, uint8 outcome) external {
        MarketInfo storage m = _markets[marketId];
        require(msg.sender == m.creator, "CommunityMarket: only creator");
        require(m.status == Status.Open, "CommunityMarket: not open");
        require(block.timestamp >= m.closesAt, "CommunityMarket: staking still open");
        require(block.timestamp <= m.resolveBy, "CommunityMarket: past resolve deadline");
        require(outcome < m.nOutcomes, "CommunityMarket: bad outcome");
        m.status = Status.Proposed;
        m.outcome = outcome;
        m.proposedAt = uint64(block.timestamp);
        emit OutcomeProposed(marketId, outcome, m.proposedAt + m.objectionWindow);
    }

    /// @notice A player disputes the declared result. Once objecting players
    ///         hold more than a third of the pool, the market is voided.
    function object(bytes32 marketId) external {
        MarketInfo storage m = _markets[marketId];
        require(m.status == Status.Proposed, "CommunityMarket: nothing to object to");
        require(block.timestamp < m.proposedAt + m.objectionWindow, "CommunityMarket: objection window over");
        uint256 s = stakedBy[marketId][msg.sender];
        require(s > 0, "CommunityMarket: only players can object");
        require(!objected[marketId][msg.sender], "CommunityMarket: already objected");
        objected[marketId][msg.sender] = true;
        m.objectedStake += s;
        emit Objected(marketId, msg.sender, s, m.objectedStake);
        if (m.objectedStake * 3 > m.totalPool) _void(marketId, "players objected");
    }

    /// @notice Permissionless: lock in the declared result once the objection window has passed.
    function finalize(bytes32 marketId) external {
        MarketInfo storage m = _markets[marketId];
        require(m.status == Status.Proposed, "CommunityMarket: not proposed");
        require(block.timestamp >= m.proposedAt + m.objectionWindow, "CommunityMarket: objection window open");
        if (_pools[marketId][m.outcome] == 0) {
            _void(marketId, "nobody backed the result");
            return;
        }
        m.status = Status.Resolved;
        emit MarketResolved(marketId, m.outcome, m.totalPool);
    }

    /// @notice Permissionless: the creator missed their own deadline — refund everyone.
    function voidUnresolved(bytes32 marketId) external {
        MarketInfo storage m = _markets[marketId];
        require(m.status == Status.Open && m.createdAt != 0, "CommunityMarket: not open");
        require(block.timestamp > m.resolveBy, "CommunityMarket: deadline not passed");
        _void(marketId, "creator did not resolve");
    }

    /// @notice The creator can cancel before anyone has staked, or refund everyone at any time before a result is final.
    function cancel(bytes32 marketId) external {
        MarketInfo storage m = _markets[marketId];
        require(msg.sender == m.creator, "CommunityMarket: only creator");
        require(m.status == Status.Open || m.status == Status.Proposed, "CommunityMarket: already final");
        _void(marketId, "cancelled by creator");
    }

    function claim(bytes32 marketId) external nonReentrant {
        uint256 amount = payoutOf(marketId, msg.sender);
        require(amount > 0, "CommunityMarket: nothing to claim");
        claimed[marketId][msg.sender] = true;
        _push(msg.sender, amount);
        emit Claimed(marketId, msg.sender, amount);
    }

    // --- Views ------------------------------------------------------------------

    /// @notice What `player` can claim now (0 before the market is final or once claimed).
    function payoutOf(bytes32 marketId, address player) public view returns (uint256) {
        MarketInfo storage m = _markets[marketId];
        if (claimed[marketId][player]) return 0;
        if (m.status == Status.Voided) return stakedBy[marketId][player];
        if (m.status != Status.Resolved) return 0;
        uint256[] storage s = _stakes[marketId][player];
        if (s.length == 0 || s[m.outcome] == 0) return 0;
        return (s[m.outcome] * m.totalPool) / _pools[marketId][m.outcome];
    }

    function getMarket(bytes32 marketId) external view returns (MarketInfo memory) {
        return _markets[marketId];
    }

    function getOutcomes(bytes32 marketId) external view returns (string[] memory) {
        return _labels[marketId];
    }

    function getPools(bytes32 marketId) external view returns (uint256[] memory) {
        return _pools[marketId];
    }

    function stakesOf(bytes32 marketId, address player) external view returns (uint256[] memory s) {
        s = _stakes[marketId][player];
        if (s.length == 0) s = new uint256[](_markets[marketId].nOutcomes);
    }

    function marketCount() external view returns (uint256) {
        return _marketIds.length;
    }

    function getMarketIds(uint256 offset, uint256 limit) external view returns (bytes32[] memory ids) {
        uint256 n = _marketIds.length;
        if (offset >= n) return new bytes32[](0);
        uint256 end = offset + limit > n ? n : offset + limit;
        ids = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) ids[i - offset] = _marketIds[i];
    }

    // --- Internal -------------------------------------------------------------------

    function _void(bytes32 marketId, string memory reason) private {
        _markets[marketId].status = Status.Voided;
        emit MarketVoided(marketId, reason);
    }

    function _pull(address from, uint256 amount) private {
        (bool ok, bytes memory data) =
            address(collateral).call(abi.encodeCall(IERC20Minimal.transferFrom, (from, address(this), amount)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "CommunityMarket: transfer failed");
    }

    function _push(address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            address(collateral).call(abi.encodeCall(IERC20Minimal.transfer, (to, amount)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "CommunityMarket: transfer failed");
    }
}
