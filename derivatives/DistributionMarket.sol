// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Settlement } from "./Settlement.sol";
import { IERC20Minimal } from "./interfaces/IERC20Minimal.sol";
import { IEventBus } from "../contracts/interfaces/IEventBus.sol";
import { ITreasuryVault } from "../contracts/interfaces/ITreasuryVault.sol";
import { FixedPointMathLib } from "../contracts/vendor/solady/FixedPointMathLib.sol";

/// @title DistributionMarket
/// @notice A market on WHERE a number lands — "NVDA price at T", "SGOV at
///         month-end" — split into N ranges ("buckets"). Each bucket has
///         shares priced by an LMSR automated market maker, so the N prices
///         always sum to 1 and together ARE the market's probability
///         distribution. Trade any bucket (buy or sell) until close; the
///         winning bucket pays 1 USDG per share.
///
///         Resolution uses Novak's dispute layer unchanged: the N-1 bucket
///         boundaries are ordinary yes/no Novak events, ascending —
///         boundary i = "value >= threshold_i at T?". The winning bucket is
///         the number of boundaries that resolved TRUE. Each boundary goes
///         through resolver quorum and, if challenged, the Tier-1/Tier-2
///         committees. Other prediction markets can reuse the same boundary
///         events.
///
///         Safety:
///         - Trading stops at `tradingClosesAt` and as soon as ANY boundary
///           is decided (same fix as Market: no trading on a known outcome).
///         - VOID (any boundary voided/expired, or the boundaries came back
///           inconsistent — a TRUE above a FALSE) pays every share 1/N USDG.
///         - Solvent by construction. The creator seeds `b·ln N` (LMSR's
///           maximum loss); the market's reserve then always covers C(q),
///           the LMSR cost function, and C(q) >= max q_i >= mean q_i, so both
///           the winning-bucket and the 1/N void payouts are covered. Every
///           trade re-checks `reserve >= C(q)` and reverts otherwise; buys
///           round shares down and sells round proceeds down.
///         - Trade fees go to the TreasuryVault at settlement, attributed to
///           the boundary events (-> resolvers / committees / treasury
///           thirds). Leftover reserve after payouts returns to the creator.
/// @dev ARCHITECTURAL INVARIANT: reads event state ONLY through `Settlement`
///      (-> IEventBus). Never the Registry, Composer or a resolver. Fees are
///      pushed into ITreasuryVault. Guarded by
///      test/unit/DistributionMarket.t.sol::test_holdsOnlySettlementReference.
contract DistributionMarket {
    using FixedPointMathLib for uint256;

    enum Status {
        Open,
        Settled,
        Voided
    }

    struct MarketInfo {
        address creator;
        uint64 createdAt;
        uint64 tradingClosesAt;
        Status status;
        uint8 nBuckets;
        uint8 winningBucket; // meaningful once Settled
        uint256 b; // LMSR liquidity, collateral units (6 decimals)
        uint256 reserve; // collateral backing payouts (excludes fees)
        uint256 fees; // accrued trade fees, sent to the vault at settlement
        uint256 liability; // total payout owed, fixed at settlement
        string question;
    }

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 500;
    uint256 public constant MAX_BOUNDARIES = 9; // => up to 10 buckets
    uint256 public constant MIN_LIQUIDITY = 1e6; // b >= 1 USDG
    uint256 public constant MAX_QUESTION_LENGTH = 280;
    /// @dev collateral has 6 decimals; LMSR math runs in 18-decimal wad.
    uint256 internal constant TO_WAD = 1e12;
    int256 internal constant WAD = 1e18;

    Settlement public immutable settlement;
    IERC20Minimal public immutable collateral;
    address public immutable treasury; // TreasuryVault
    uint256 public immutable tradeFeeBps;

    mapping(bytes32 => MarketInfo) private _markets;
    mapping(bytes32 => bytes32[]) private _boundaries;
    mapping(bytes32 => uint256[]) private _q; // outstanding shares per bucket
    mapping(bytes32 => mapping(address => uint256[])) private _shares;
    mapping(bytes32 => mapping(address => bool)) public redeemed;
    bytes32[] private _marketIds;
    uint256 private _nonce;
    uint256 private _lock = 1;

    event MarketCreated(
        bytes32 indexed marketId,
        address indexed creator,
        bytes32[] boundaryEventIds,
        uint256 liquidity,
        uint64 tradingClosesAt,
        string question
    );
    event Trade(
        bytes32 indexed marketId,
        address indexed trader,
        uint8 indexed bucket,
        bool isBuy,
        uint256 shares,
        uint256 collateral, // paid in (buy, incl. fee) or received (sell, after fee)
        uint256 fee,
        uint256[] pricesAfter // wad, sum to 1e18 — the distribution after this trade
    );
    event MarketSettled(bytes32 indexed marketId, uint8 winningBucket, uint256 fees);
    event MarketVoided(bytes32 indexed marketId, uint256 fees);
    event Redeemed(bytes32 indexed marketId, address indexed trader, uint256 amount);

    modifier nonReentrant() {
        require(_lock == 1, "DistributionMarket: reentrant");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address settlement_, address collateral_, address treasury_, uint256 tradeFeeBps_) {
        require(tradeFeeBps_ <= MAX_FEE_BPS, "DistributionMarket: fee too high");
        require(
            collateral_ != address(0) && treasury_ != address(0), "DistributionMarket: zero address"
        );
        settlement = Settlement(settlement_);
        collateral = IERC20Minimal(collateral_);
        treasury = treasury_;
        tradeFeeBps = tradeFeeBps_;
    }

    // --- Create ---

    /// @param boundaryEventIds N-1 yes/no events, ASCENDING thresholds:
    ///        boundary i = "value >= threshold_i". Bucket k = exactly k TRUE.
    /// @param liquidity LMSR `b` in collateral units. The creator deposits the
    ///        subsidy `b·ln N` (rounded up) — the most the market maker can lose.
    function createMarket(
        string calldata question,
        bytes32[] calldata boundaryEventIds,
        uint64 tradingClosesAt,
        uint256 liquidity
    ) external nonReentrant returns (bytes32 marketId) {
        require(tradingClosesAt > block.timestamp, "DistributionMarket: close time in past");
        require(liquidity >= MIN_LIQUIDITY, "DistributionMarket: liquidity too low");
        require(
            bytes(question).length <= MAX_QUESTION_LENGTH, "DistributionMarket: question too long"
        );
        _validateBoundaries(boundaryEventIds);

        marketId = keccak256(abi.encode(msg.sender, _nonce++, block.chainid));
        _boundaries[marketId] = boundaryEventIds;
        uint256 subsidy = _init(marketId, boundaryEventIds.length + 1, tradingClosesAt, liquidity);
        _markets[marketId].question = question;
        _pull(msg.sender, subsidy);

        emit MarketCreated(
            marketId, msg.sender, boundaryEventIds, liquidity, tradingClosesAt, question
        );
    }

    function _validateBoundaries(bytes32[] calldata ids) private view {
        uint256 nb = ids.length;
        require(nb >= 1 && nb <= MAX_BOUNDARIES, "DistributionMarket: 1-9 boundaries");
        for (uint256 i = 0; i < nb; i++) {
            for (uint256 j = i + 1; j < nb; j++) {
                require(ids[i] != ids[j], "DistributionMarket: duplicate");
            }
        }
        _requireAllPending(ids);
    }

    /// @dev Writes the market and returns the LMSR subsidy to pull:
    ///      ceil(C(0)) + 1 unit of margin, where C(0) = b·ln N.
    function _init(bytes32 marketId, uint256 n, uint64 tradingClosesAt, uint256 liquidity)
        private
        returns (uint256 subsidy)
    {
        MarketInfo storage m = _markets[marketId];
        m.creator = msg.sender;
        m.createdAt = uint64(block.timestamp);
        m.tradingClosesAt = tradingClosesAt;
        m.nBuckets = uint8(n);
        m.b = liquidity;
        _q[marketId] = new uint256[](n);
        _marketIds.push(marketId);
        subsidy = _ceilToUnits(_cost(_q[marketId], liquidity)) + 1;
        m.reserve = subsidy;
    }

    // --- Trade ---

    /// @notice Spend `collateralIn` (incl. fee) on bucket `bucket`; receive
    ///         at least `minShares` shares (6 decimals; 1 share pays 1 USDG).
    function buy(bytes32 marketId, uint8 bucket, uint256 collateralIn, uint256 minShares)
        external
        nonReentrant
        returns (uint256 shares)
    {
        MarketInfo storage m = _markets[marketId];
        _requireTradable(marketId, m, bucket);
        require(collateralIn > 0, "DistributionMarket: zero amount");

        uint256 fee = (collateralIn * tradeFeeBps) / BPS;
        uint256 net = collateralIn - fee;
        shares = _sharesForCost(_q[marketId], m.b, bucket, net);
        require(shares > 0 && shares >= minShares, "DistributionMarket: slippage");

        _q[marketId][bucket] += shares;
        _ensureShares(marketId, msg.sender, m.nBuckets);
        _shares[marketId][msg.sender][bucket] += shares;
        m.reserve += net;
        m.fees += fee;
        _requireSolvent(marketId, m);

        _pull(msg.sender, collateralIn);
        _logTrade(marketId, bucket, true, shares, collateralIn, fee);
    }

    /// @notice Sell `shares` of bucket `bucket` back to the market maker for at
    ///         least `minCollateralOut` (after fee).
    function sell(bytes32 marketId, uint8 bucket, uint256 shares, uint256 minCollateralOut)
        external
        nonReentrant
        returns (uint256 collateralOut)
    {
        MarketInfo storage m = _markets[marketId];
        _requireTradable(marketId, m, bucket);
        require(shares > 0, "DistributionMarket: zero shares");
        _ensureShares(marketId, msg.sender, m.nBuckets);
        require(
            _shares[marketId][msg.sender][bucket] >= shares,
            "DistributionMarket: insufficient shares"
        );

        uint256 gross = _proceedsForShares(_q[marketId], m.b, bucket, shares);
        uint256 fee = (gross * tradeFeeBps) / BPS;
        collateralOut = gross - fee;
        require(
            collateralOut >= minCollateralOut && collateralOut > 0, "DistributionMarket: slippage"
        );

        _q[marketId][bucket] -= shares;
        _shares[marketId][msg.sender][bucket] -= shares;
        m.reserve -= gross;
        m.fees += fee;
        _requireSolvent(marketId, m);

        _push(msg.sender, collateralOut);
        _logTrade(marketId, bucket, false, shares, collateralOut, fee);
    }

    // --- Settle / redeem ---

    /// @notice Reads every boundary through Settlement -> EventBus. Callable by
    ///         anyone once all boundaries are decided (the keeper does it).
    function settle(bytes32 marketId) external nonReentrant {
        MarketInfo storage m = _markets[marketId];
        require(m.createdAt != 0, "DistributionMarket: unknown market");
        require(m.status == Status.Open, "DistributionMarket: already settled");

        (IEventBus.Availability[] memory st, bool[] memory out) =
            settlement.getSettlements(_boundaries[marketId]);

        bool voided = false;
        uint256 trues = 0;
        bool sawFalse = false;
        for (uint256 i = 0; i < st.length; i++) {
            require(st[i] != IEventBus.Availability.Pending, "DistributionMarket: not finalized");
            if (st[i] == IEventBus.Availability.Voided) {
                voided = true;
            } else if (out[i]) {
                if (sawFalse) voided = true; // TRUE above a FALSE: inconsistent ladder
                trues++;
            } else {
                sawFalse = true;
            }
        }

        uint256[] storage q = _q[marketId];
        if (voided) {
            m.status = Status.Voided;
            uint256 total = 0;
            for (uint256 i = 0; i < q.length; i++) {
                total += q[i];
            }
            m.liability = (total + m.nBuckets - 1) / m.nBuckets; // ceil(total / N)
        } else {
            m.status = Status.Settled;
            m.winningBucket = uint8(trues);
            m.liability = q[trues];
        }

        uint256 fees = m.fees;
        m.fees = 0;
        uint256 leftover = m.reserve - m.liability; // solvent by invariant
        m.reserve = m.liability;

        if (fees > 0) _payFees(marketId, fees);
        if (leftover > 0) _push(m.creator, leftover);

        if (voided) emit MarketVoided(marketId, fees);
        else emit MarketSettled(marketId, m.winningBucket, fees);
    }

    function redeem(bytes32 marketId) external nonReentrant returns (uint256 amount) {
        MarketInfo storage m = _markets[marketId];
        require(m.status != Status.Open, "DistributionMarket: not settled");
        require(!redeemed[marketId][msg.sender], "DistributionMarket: already redeemed");
        amount = payoutOf(marketId, msg.sender);
        require(amount > 0, "DistributionMarket: nothing to redeem");
        redeemed[marketId][msg.sender] = true;
        m.reserve -= amount;
        _push(msg.sender, amount);
        emit Redeemed(marketId, msg.sender, amount);
    }

    // --- Views ---

    /// @notice Bucket prices in wad; they sum to 1e18 (up to rounding).
    function prices(bytes32 marketId) public view returns (uint256[] memory p) {
        uint256[] storage q = _q[marketId];
        uint256 n = q.length;
        p = new uint256[](n);
        if (n == 0) return p;
        int256 bWad = int256(_markets[marketId].b * TO_WAD);
        int256 m = _maxWad(q);
        int256[] memory e = new int256[](n);
        int256 sum = 0;
        for (uint256 i = 0; i < n; i++) {
            e[i] = FixedPointMathLib.expWad(((int256(q[i] * TO_WAD) - m) * WAD) / bWad);
            sum += e[i];
        }
        for (uint256 i = 0; i < n; i++) {
            p[i] = uint256((e[i] * WAD) / sum);
        }
    }

    function quoteBuy(bytes32 marketId, uint8 bucket, uint256 collateralIn)
        external
        view
        returns (uint256 shares, uint256 fee)
    {
        MarketInfo storage m = _markets[marketId];
        require(bucket < m.nBuckets, "DistributionMarket: bad bucket");
        fee = (collateralIn * tradeFeeBps) / BPS;
        shares = _sharesForCost(_q[marketId], m.b, bucket, collateralIn - fee);
    }

    function quoteSell(bytes32 marketId, uint8 bucket, uint256 shares)
        external
        view
        returns (uint256 collateralOut, uint256 fee)
    {
        MarketInfo storage m = _markets[marketId];
        require(bucket < m.nBuckets, "DistributionMarket: bad bucket");
        require(_q[marketId][bucket] >= shares, "DistributionMarket: exceeds outstanding");
        uint256 gross = _proceedsForShares(_q[marketId], m.b, bucket, shares);
        fee = (gross * tradeFeeBps) / BPS;
        collateralOut = gross - fee;
    }

    function payoutOf(bytes32 marketId, address trader) public view returns (uint256) {
        MarketInfo storage m = _markets[marketId];
        if (m.status == Status.Open || redeemed[marketId][trader]) return 0;
        uint256[] storage s = _shares[marketId][trader];
        if (s.length == 0) return 0;
        if (m.status == Status.Settled) return s[m.winningBucket];
        uint256 total = 0;
        for (uint256 i = 0; i < s.length; i++) {
            total += s[i];
        }
        return total / m.nBuckets;
    }

    function getMarket(bytes32 marketId) external view returns (MarketInfo memory) {
        return _markets[marketId];
    }

    function getBoundaries(bytes32 marketId) external view returns (bytes32[] memory) {
        return _boundaries[marketId];
    }

    function getOutstanding(bytes32 marketId) external view returns (uint256[] memory) {
        return _q[marketId];
    }

    function sharesOf(bytes32 marketId, address trader) external view returns (uint256[] memory s) {
        s = _shares[marketId][trader];
        if (s.length == 0) s = new uint256[](_markets[marketId].nBuckets);
    }

    function marketCount() external view returns (uint256) {
        return _marketIds.length;
    }

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

    // --- LMSR math (wad) ---

    /// @dev C(q) = b·ln Σ exp(q_i/b), via log-sum-exp: m + b·ln Σ exp((q_i - m)/b).
    function _cost(uint256[] memory q, uint256 b) internal pure returns (int256) {
        int256 bWad = int256(b * TO_WAD);
        int256 m = _maxWadMem(q);
        int256 sum = 0;
        for (uint256 i = 0; i < q.length; i++) {
            sum += FixedPointMathLib.expWad(((int256(q[i] * TO_WAD) - m) * WAD) / bWad);
        }
        return m + (bWad * FixedPointMathLib.lnWad(sum)) / WAD;
    }

    /// @dev Shares Δ of `k` such that C(q + Δe_k) = C(q) + cost. Closed form,
    ///      shifted by M = C(q) + cost so every exponent is <= 0:
    ///      q_k + Δ = M + b·ln(1 - Σ_{j≠k} exp((q_j - M)/b)). Rounded down.
    function _sharesForCost(uint256[] memory q, uint256 b, uint256 k, uint256 cost)
        internal
        pure
        returns (uint256)
    {
        if (cost == 0) return 0;
        int256 bWad = int256(b * TO_WAD);
        int256 big = _cost(q, b) + int256(cost * TO_WAD);
        int256 r = 0;
        for (uint256 j = 0; j < q.length; j++) {
            if (j == k) continue;
            r += FixedPointMathLib.expWad(((int256(q[j] * TO_WAD) - big) * WAD) / bWad);
        }
        require(r < WAD, "DistributionMarket: math");
        int256 newQk = big + (bWad * FixedPointMathLib.lnWad(WAD - r)) / WAD;
        int256 delta = newQk - int256(q[k] * TO_WAD);
        if (delta <= 0) return 0;
        return uint256(delta) / TO_WAD;
    }

    /// @dev C(q) - C(q - Δe_k), rounded down.
    function _proceedsForShares(uint256[] memory q, uint256 b, uint256 k, uint256 shares)
        internal
        pure
        returns (uint256)
    {
        int256 before = _cost(q, b);
        q[k] -= shares;
        int256 afterCost = _cost(q, b);
        q[k] += shares;
        int256 diff = before - afterCost;
        if (diff <= 0) return 0;
        return uint256(diff) / TO_WAD;
    }

    function _requireSolvent(bytes32 marketId, MarketInfo storage m) private view {
        require(m.reserve >= _ceilToUnits(_cost(_q[marketId], m.b)), "DistributionMarket: solvency");
    }

    function _ceilToUnits(int256 wadAmount) private pure returns (uint256) {
        if (wadAmount <= 0) return 0;
        uint256 w = uint256(wadAmount);
        return (w + TO_WAD - 1) / TO_WAD;
    }

    function _maxWad(uint256[] storage q) private view returns (int256 m) {
        for (uint256 i = 0; i < q.length; i++) {
            int256 v = int256(q[i] * TO_WAD);
            if (v > m) m = v;
        }
    }

    function _maxWadMem(uint256[] memory q) private pure returns (int256 m) {
        for (uint256 i = 0; i < q.length; i++) {
            int256 v = int256(q[i] * TO_WAD);
            if (v > m) m = v;
        }
    }

    // --- Internal plumbing ---

    function _requireTradable(bytes32 marketId, MarketInfo storage m, uint8 bucket) private view {
        require(m.createdAt != 0, "DistributionMarket: unknown market");
        require(m.status == Status.Open, "DistributionMarket: already settled");
        require(block.timestamp < m.tradingClosesAt, "DistributionMarket: trading closed");
        require(bucket < m.nBuckets, "DistributionMarket: bad bucket");
        _requireAllPending(_boundaries[marketId]);
    }

    function _requireAllPending(bytes32[] memory ids) private view {
        (IEventBus.Availability[] memory st,) = settlement.getSettlements(ids);
        for (uint256 i = 0; i < st.length; i++) {
            require(st[i] == IEventBus.Availability.Pending, "DistributionMarket: outcome known");
        }
    }

    /// @dev Separate frame for the event (keeps buy/sell under the stack limit).
    function _logTrade(
        bytes32 marketId,
        uint8 bucket,
        bool isBuy,
        uint256 shares,
        uint256 amount,
        uint256 fee
    ) private {
        emit Trade(marketId, msg.sender, bucket, isBuy, shares, amount, fee, prices(marketId));
    }

    function _ensureShares(bytes32 marketId, address trader, uint8 n) private {
        if (_shares[marketId][trader].length == 0) _shares[marketId][trader] = new uint256[](n);
    }

    function _payFees(bytes32 marketId, uint256 fees) private {
        (bool ok, bytes memory data) =
            address(collateral).call(abi.encodeCall(IERC20Minimal.approve, (treasury, fees)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "DistributionMarket: approve");
        ITreasuryVault(treasury).depositFees(_boundaries[marketId], fees);
    }

    function _pull(address from, uint256 amount) private {
        (bool ok, bytes memory data) = address(collateral)
            .call(abi.encodeCall(IERC20Minimal.transferFrom, (from, address(this), amount)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "DistributionMarket: pull");
    }

    function _push(address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            address(collateral).call(abi.encodeCall(IERC20Minimal.transfer, (to, amount)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "DistributionMarket: push");
    }
}
