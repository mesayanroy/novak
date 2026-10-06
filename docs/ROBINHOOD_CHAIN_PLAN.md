# Novak on Robinhood Chain — Build Plan & Checklist

Target: **Robinhood Chain** (testnet deployment; mainnet as read-only data source).
Team target: feature-complete by **Oct 10, 2026**.
Written: Sep 25, 2026, from a full pass over `contracts/`, `derivatives/`,
`script/`, `resolver/`, `sdk/`, `frontend/`, and `docs/`.

Priority key: **P0** = without it the submission loses points on
Functionality or looks broken · **P1** = the difference between "works" and
"wins" · **P2** = stretch goal.

**Deployment decision:** **testnet only (chain 46630)**. Mainnet is used
only as a free, read-only *data source* for resolvers: Chainlink feeds,
ERC-8056 stock tokens, and the Robinhood assets API.

## v2 (Oct 4): dispute layer + distribution markets

The approved v2 plan adds the TreasuryVault (fee thirds), the
DistributionMarket (LMSR ranges over threshold ladders), the Fed-rate
adapter, live feeds, insights and integration docs. All of it is built and
verified on anvil; see the README "What's verified" section. Remaining: the
real testnet broadcast with team keys, hosting, a browser click-test, and
the video.

## Work tracker (build order)

**A: Contracts**
- [x] A1 Registry: reject observations before `openTimestamp` (§3.1)
- [x] A2 EventBus `getAvailability` (Pending / Available / Voided) + `Settlement.getSettlement` (§3.1)
- [x] A3 Market v2: USDG collateral, `tradingClosesAt`, known-outcome backstop, refund mode, fee, question, enumeration, exploit regression test (§3.1, §3.2)
- [x] A4 PositionManager: only the Market can record positions (§3.1)
- [x] A5 `MockUSDG` for testnet (§3.2)
- [x] A6 DisputeManager pull payments + reverting-disputer test (§3.4)
- [x] A7 `StockLendingGuard` consumer + invariant guard test (§3.5)
- [x] A8 Deploy script (MockUSDG on 46630, treasury, resolver auth, `deployments/<chainId>.json`), foundry.toml, .env.example (§4)
- [x] A9 specVersion 2 `occurredAt` for temporal ops (§3.3, P1)

- [x] **B: SDK**: ABIs generated from `forge build`, chains + deployments, USDG approve/deposit, `listMarkets`/`listEvents`, spec encoders (§6)

- [x] **C: Resolver + keeper**: daemon loop, event discovery, sourceId dispatch, read-mainnet/write-testnet, openTimestamp guard, adapters (`chainlink.price-at`, `rh.corporate-action`, `rh.trading-status`), keeper, dispute voter (§5)

- [x] **D: Frontend**: Robinhood chains + WalletConnect, live data instead of mocks, remove fake "live" numbers, rebrand, market templates, `/calendar`, `/guard`, `/events` (§7, §8)

- [x] **E: Docs**: protocol-spec, threat-model, architecture, README, CLAUDE.md, SPEC_AND_TASKS, in-app docs (§9)

- [ ] **F: Ship**: faucet ETH for deployer + 3 resolvers (team supplies keys), deploy + verify, host resolvers/keeper/frontend, video, submit (§10)

---

## 0. Verified environment facts (checked Sep 25, 2026 with `cast` and public APIs)

| Question | Answer | Consequence |
|---|---|---|
| Is USDG on testnet? | **No canonical one.** The mainnet USDG address (`0x5fc5…d168`, symbol `USDG`, 6 decimals) has **no code on testnet**. Testnet Blockscout shows three third-party tokens named "USDG" (`0x915E…03ec`, `0x7E95…802F`, `0x4339…b907` "Mock USDG"), none marked official. | **Deploy our own `MockUSDG` (6 decimals, public `mint`)** on testnet. Use the real USDG on mainnet. |
| Are Chainlink stock feeds on testnet? | **No.** Chainlink's own chain config lists only "Robinhood Chain Mainnet" for data feeds. Mainnet has 58 feeds, e.g. `Robinhood NVDA / USD` = `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15`, `TSLA` = `0x4A1166a659A55625345e9515b32adECea5547C38`, `AAPL` = `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0`, `USDG / USD` = `0x61B7e5650328764B076A108EFF5fa7282a1B9aD2`. All have 8 decimals and a 24h heartbeat. A live read returned NVDA = $224.41. | Resolvers **read mainnet feeds** and write observations to testnet. |
| Is there an L2 sequencer-uptime feed? | **Not in Chainlink's Robinhood feed directory** (no "uptime"/"sequencer" entry), even though Robinhood's docs recommend one. | Use staleness checks only, and ask in the Robinhood/Chainlink Discord. |
| Do testnet stock tokens support ERC-8056? | **No.** The testnet "NVIDIA (Testnet - No Real Value)" token `0x2C00…37BA` reverts on `uiMultiplier()`, `newUIMultiplier()`, `effectiveAt()` and `oraclePaused()`. | The corporate-action adapter **reads mainnet tokens**. |
| Do mainnet stock tokens support ERC-8056? | **Yes.** NVDA `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC`: `uiMultiplier` = 1.000775…e18 (dividend reinvestment), `effectiveAt` = 1788998430, `oraclePaused` = false. | The `rh.corporate-action` adapter works against real data. |
| Is Chainlink VRF on Robinhood Chain? | **No.** VRF v2.5 supports Arbitrum One and Arbitrum Sepolia only. | Committee randomness uses a commit-reveal or future-block seed (§3.4), documented as a residual gap. |
| **Bonus:** is there an off-chain asset registry? | `GET https://api.robinhood.com/rhj/assets` returns all **195** stock tokens (all on chain 4663). Each entry has `contractAddress`, `currentMultiplier`, `pendingMultiplier`, and `tradingCapabilities` per session (market / extended / overnight). No asset had a pending multiplier at check time. | The source for the `/calendar` page (§8.4) and a **second, independent source** for the corporate-action and trading-status adapters (§5.2). |

To rerun these checks:

```bash
# USDG: mainnet address has code? (no output / 0 on testnet)
cast codesize 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 --rpc-url https://rpc.testnet.chain.robinhood.com
# Chainlink feeds for Robinhood (mainnet only)
curl -s https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json
cast call 0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15 "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url https://rpc.mainnet.chain.robinhood.com
# ERC-8056 on the canonical mainnet NVDA token
cast call 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC "uiMultiplier()(uint256)" --rpc-url https://rpc.mainnet.chain.robinhood.com
# Asset registry
curl -s https://api.robinhood.com/rhj/assets
# VRF: search "Robinhood" on https://docs.chain.link/vrf/v2-5/supported-networks
```

---

## 1. Positioning (read this first; every page and the pitch follow from it)

> **Chainlink tells your contract the price. Novak tells it what happened.**
>
> Novak is the **event layer for Robinhood Chain**. It turns real-world
> facts about tokenized stocks (corporate actions, trading halts, earnings,
> Fed decisions, price-at-close conditions) into finalized, disputable,
> composable on-chain events. Each fact is resolved once and read by every
> lending market, perp, and prediction market on the chain.

### Why this is a real gap on Robinhood Chain (with sources)

| Gap | Evidence |
|---|---|
| Chainlink is the **only** oracle Robinhood Chain documents, and it covers **prices**. It has no market-status feeds and no corporate-action event feed. | [Robinhood Chain docs: Oracles & Price Feeds](https://docs.robinhood.com/chain/oracles-and-price-feeds/) |
| "Chainlink does **not** provide corporate-action calendar data or automated pause triggers; pause timing and multiplier updates are coordinated by Robinhood." | [Chainlink docs: Robinhood Tokenized Equities](https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood) |
| The stock token's `oraclePaused()` flag is "**advisory and not enforced on-chain**". Staleness checks are the only safeguard. | [Robinhood Chain docs: Oracles & Price Feeds](https://docs.robinhood.com/chain/oracles-and-price-feeds/) |
| Stock-token feeds update **24/5** and "may hold the last published price" off-hours, with no heartbeats. On-chain trading runs 24/7. | Chainlink docs (above) |
| Splits, reverse splits and ETF distributions change `uiMultiplier` (ERC-8056). Data platforms have mis-reported supply by 10–100× because they can't see *why* the multiplier changed. | [RWA.xyz: The Good, The Bad, and The Fix](https://app.rwa.xyz/blog/robinhoods-tokenized-stocks-the-good-the-bad-and-the-fix) |
| Integrators are told to "subscribe to `UIMultiplierUpdated`" and "handle multiplier changes in lending collateral calculations". Every protocol builds that listener itself. | [Robinhood Chain docs: Building with Stock Tokens](https://docs.robinhood.com/chain/building-with-stock-tokens/) |
| Prediction markets are Robinhood's fastest-growing revenue line, but they run off-chain. Nothing on-chain can settle a condition like "NVDA beats earnings AND the Fed cuts". | [CryptoSlate](https://cryptoslate.com/robinhoods-expanding-crypto-bet-meets-a-faster-moving-prediction-market-boom/) |

### Novak vs Chainlink: complementary, never "vs"

| | Chainlink (on Robinhood Chain) | Novak |
|---|---|---|
| Answers | "What is NVDA's price *now*?" | "Did NVDA split? Was TSLA halted between T1 and T2? Did earnings beat AND the Fed cut within 48h?" |
| Data shape | Continuous number, 24/5 | Discrete fact that becomes final: true/false plus when it happened |
| History | Current round only | A **historical fact** is finalized once and readable forever. Contracts can't read past state on-chain, so this is new capability. |
| Disagreement | Not applicable | Bonded two-tier committee dispute. **Never a token-weighted vote** (the known weak point of optimistic oracles). |
| Composition | None | AND / OR / NOT / BEFORE / WITHIN, each with a canonical ID |
| Relationship | **A data source Novak resolvers read** | Consumes Chainlink as one adapter |

Never say "replace Chainlink" anywhere: not on the landing page, not in the video,
not in the docs. Robinhood lists Chainlink as its official oracle partner.

---

## 2. What the judges score, and what moves each score

| Criterion | Current state | What moves it |
|---|---|---|
| Functionality / code quality | 80/80 tests pass, but **all on anvil**. The market has a **proven fund-loss bug** (§3.1). The frontend runs on mock data. The resolver uses a mocked price. | Fix the P0 contract bugs, deploy to Robinhood Chain, use real adapters, show live data |
| Potential impact | Generic "event bus for Ethereum" pitch | The event layer for ~95 tokenized stocks and every protocol that holds them |
| Novelty | Composition plus a committee dispute ladder is already novel | Corporate-action calendar and a finalized-history consumer demo |
| UX | RainbowKit on anvil only. Users paste raw hex IDs to create a market. | Robinhood Wallet via WalletConnect, USDG, market templates, sponsored gas |
| Open-source / composability | MIT, clean interfaces | **Two different consumers read the same event** (market + lending guard) |
| Business plan | No fees at all | Settlement fee, event-creation fee, paid event classes for protocols |

---

## 3. Contracts checklist

### 3.1 P0: correctness bugs (the first two fix a proven fund-loss path)

- [ ] **Losers can withdraw after the outcome is known.**
  [Market.sol](../derivatives/Market.sol) `closePosition` and `depositCollateral`
  only check `!m.settled`. After the event finalizes but before anyone calls
  `settle()`, the losing side withdraws its full stake and the winner gets
  nothing. **Verified** with a throwaway Foundry test (loser balance back to
  1 ETH; winner claims only their own 1 ETH).
  Fix: add a `tradingClosesAt` to `MarketDef`, set at `createMarket`. Deposits
  and withdrawals revert at or after it. It must be ≤ the underlying event's
  `openTimestamp`, which the frontend enforces for composites. Add a
  regression test that reproduces the exploit.
- [ ] **Late deposits after the outcome is known** is the same root cause
  and gets the same fix. Cover it in the same test.
- [ ] **Voided/Expired events lock market funds forever.**
  `Market.settle` requires `available == true`. A `Voided` or `Expired` event,
  or a composite that propagated `Voided`, never becomes available, so pool
  funds are stuck. Fix:
  - Add `IEventBus.getStatus(bytes32) → {Pending, Available, Voided}`, which
    reads the Registry `Voided`/`Expired` status and the Composer
    `Status.Voided`.
  - `Settlement.resolveOutcome` returns a tri-state.
  - `Market.settle` enters **refund mode** on `Voided`, and everyone claims
    their own stake.
  - Keep the invariant: Market → Settlement → IEventBus only. Extend
    `test_market_onlyHoldsSettlementReference` if the signatures change.
- [ ] **Observations accepted before the event happens.**
  [EventRegistry.sol:78](../contracts/EventRegistry.sol#L78) `submitObservation`
  never checks `block.timestamp >= openTimestamp`. A quorum can resolve
  "NVDA beats Q3 earnings" to `false` the day it is created. Add the check
  and a unit test.
- [ ] **`PositionManager.recordPosition` is unauthenticated.**
  [PositionManager.sol](../derivatives/PositionManager.sol): anyone can write
  fake positions for any trader, which poisons the "my positions" view.
  Restrict it to the Market address (set once at deploy).

### 3.2 P0: Robinhood Chain fit

- [ ] **Collateral: switch from ETH to USDG (ERC-20).** USDG is the stablecoin
  Robinhood Chain's bridge routes deliver
  (mainnet `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, per
  [docs](https://docs.robinhood.com/chain/contracts)). Make
  `Market` take `IERC20 collateral` in its constructor and use a safe-transfer
  helper (forge-std only today; either vendor a minimal `SafeTransferLib` or
  add OpenZeppelin). **Checked (§0): there is no canonical USDG on testnet.**
  Deploy a `MockUSDG` (6 decimals) with a public `mint` for the demo.
- [ ] **Market metadata and enumeration.** Add `string question`, a
  `bytes32 ticker` or `metadataURI`, and `bytes32[] allMarketIds` with a
  paginated getter, or rely on `MarketCreated` logs. Without one of these the
  frontend has to stay on mock data, and the code in
  [mock-data.ts](../frontend/src/lib/mock-data.ts) says so itself.
- [ ] **Protocol fee** for the business-plan score. Take `feeBps` (e.g. 100 = 1%) from the
  losing pool at settlement and send it to `treasury`. Test that solvency
  still holds (payouts + fee ≤ deposits).

### 3.3 P1: temporal semantics (matters for the flagship composite)

- [ ] **`WITHIN`/`BEFORE` compare *finalization* times, not *occurrence*
  times.** For "earnings beat WITHIN 24h of the price crossing $X", each
  timestamp depends on resolver latency plus dispute window length, not on
  when the thing happened. Introduce **specVersion 2** with outcome payload
  `abi.encode(bool outcome, uint64 occurredAt)`. Resolvers must agree on
  both values (exact-match quorum already hashes the full payload). The
  Composer uses `occurredAt` when an event is v2 and falls back to
  `finalizedAt` for v1, and `Settlement` decodes by version. This changes a
  **finalized protocol decision**, so update
  [protocol-spec.md](protocol-spec.md) in the same PR (CLAUDE.md rule).

### 3.4 P1: DisputeManager on an Arbitrum chain

- [ ] **Committee selection randomness is weaker on Robinhood Chain.**
  [DisputeManager.sol:604](../contracts/DisputeManager.sol#L604) seeds from
  `blockhash(block.number - 1)` and `block.timestamp`. On Arbitrum chains,
  `block.number` is an *estimate of the L1 block number*, `blockhash` is "a
  cryptographically insecure, pseudo-random hash", and `prevrandao` is the
  constant 1
  ([Arbitrum docs](https://docs.arbitrum.io/build-decentralized-apps/arbitrum-vs-ethereum/solidity-support)).
  Many L2 transactions share one L1 block number, so a disputer can
  precompute the committee before calling `dispute()`. The demo won't hit
  this, because with ≤7 resolvers everyone is on the committee. Still:
  (a) update [threat-model.md](threat-model.md) item 10 with the
  Arbitrum-specific wording and the sequencer-ordering trust, and (b) if
  time allows, switch to a commit-then-select-later scheme (seed from a
  block after the dispute transaction, plus the committee's revealed
  salts). **Checked (§0): Chainlink VRF is not available on Robinhood
  Chain**, so VRF is not an option.
- [ ] **Push payments can leave a dispute stuck forever.** `_send` does
  `require(sent)`. `dispute()` is permissionless, so a disputer contract
  that reverts on receive makes `voidAfterTier2Timeout`, and any
  convergence that pays the disputer, revert every time. The event stays
  `Disputed` forever, and so does every composite and market depending on
  it. Found by reading the code, not yet tested. Fix: credit balances and
  add a `withdraw()` (pull payments). Add an adversarial test with a
  reverting disputer.
- [ ] Make bond sizes constructor parameters instead of constants so the
  demo can use realistic USD-equivalent values. P2.

### 3.5 P1: a second consumer contract (the "resolve once, consume many" proof)

- [ ] **`derivatives/StockLendingGuard.sol`** (or `consumers/`): a small
  consumer holding **only an `IEventBus` reference**. It answers
  `canLiquidate(stockToken)` = `NOT(corporate action pending for ticker)
  AND NOT(trading halted)` by reading finalized Novak events. This addresses
  the exact integrator burden Robinhood's docs describe ("handle multiplier
  changes in lending collateral calculations"). It reads the **same**
  corporate-action event a market settles on.
  - [ ] Add an invariant guard test like `test_market_onlyHoldsSettlementReference`
    (required by CLAUDE.md for every new consumer).
  - [ ] Add a test import so `forge build` compiles it (derivatives are
    outside Foundry's `src` directory).

### 3.6 P2

- [ ] Include `block.chainid` in event-ID derivation. The docs say IDs aren't
  collision-hardened across chains, and the project will now live on anvil,
  testnet and possibly mainnet.
- [ ] `SubscriptionManager` stays a stub. Don't build push delivery (CLAUDE.md).

---

## 4. Deploy and infrastructure checklist

Network facts (verified Sep 25): mainnet **4663**,
`https://rpc.mainnet.chain.robinhood.com`, explorer
`https://robinhoodchain.blockscout.com`. Testnet **46630**,
`https://rpc.testnet.chain.robinhood.com`, explorer
`https://explorer.testnet.chain.robinhood.com`, faucet
`faucet.testnet.chain.robinhood.com`. Gas is paid in ETH. It's an Arbitrum
Orbit chain, and Alchemy RPCs are available for both networks.

- [ ] **P0** [foundry.toml](../foundry.toml): add `robinhood_testnet` and
  `robinhood` rpc_endpoints. Replace the `[etherscan]` block with Blockscout
  verification:
  `forge verify-contract --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/ ...`
- [ ] **P0** [Deploy.s.sol](../script/Deploy.s.sol):
  - `TREASURY_ADDRESS` from the environment (it currently reuses the deployer).
  - Collateral token address from the environment, or deploy `MockUSDG` when `block.chainid == 46630`.
  - Authorize `RESOLVER_ADDRESSES` (comma-separated) in the same script run.
  - Write `deployments/<chainId>.json` via `vm.writeJson` so the SDK and
    frontend import addresses instead of copying 8 environment variables.
- [ ] **P0** Deploy to **testnet**, verify every contract on Blockscout, and
  put the explorer links in the README.
- [ ] **P0 data-source split (required, see §0):** Chainlink stock feeds and
  ERC-8056 stock tokens exist **only on mainnet**. Resolvers *read* mainnet
  (reads are free) and *write* observations to the testnet contracts. That
  gives real data with no mainnet funds at risk. Use two RPC env vars:
  `RESOLVER_SOURCE_RPC_URL` (mainnet, read-only) and `RPC_URL_ROBINHOOD_TESTNET`
  (writes).
- [ ] [.env.example](../.env.example): replace the Sepolia/Infura lines with Robinhood
  testnet/mainnet RPCs, `ALCHEMY_API_KEY`, `TREASURY_ADDRESS`,
  `RESOLVER_ADDRESSES`, `COLLATERAL_TOKEN_ADDRESS`, and
  `NEXT_PUBLIC_CHAIN_ID=46630`.
- [ ] [ci.yml](../.github/workflows/ci.yml): no change needed. Optionally add a
  `forge script` dry run against the testnet RPC.

---

## 5. Backend servers (resolver network + keeper) checklist

### 5.1 P0: make the daemon an actual daemon

- [ ] [resolver/node/index.ts](../resolver/node/index.ts) is hard-coded to
  `foundry` and **runs once, then exits**. `RESOLVER_POLL_INTERVAL_MS` is
  logged but never used. Switch to `robinhoodTestnet` / `robinhood` from
  `viem/chains` (built in since viem 2.56; the repo also resolves an old
  2.23.2, so bump `viem` to `^2.56.0` in `sdk`, `resolver` and `frontend`).
  Then add a real poll loop.
- [ ] **Event discovery.** Replace `RESOLVER_WATCHED_EVENT_IDS` with a
  `getLogs(EventCreated)` scan from the deployment block, filtered to the
  `sourceId`s this node has adapters for.
- [ ] **Dispatch by `sourceId`.** Today *every* event goes through
  `PriceFeedAdapter` regardless of source. Add a `Map<sourceId, adapter>`.
- [ ] **Decode `spec` bytes.** Adapters currently receive `null`. Define an
  ABI-encoded spec struct per `sourceId` (document it in protocol-spec.md,
  with encoders in the SDK).
- [ ] **Pre-submission guards.** Skip unless `now >= openTimestamp`, status is
  `Open` or `ObservationsSubmitted`, and this resolver hasn't already
  submitted. This is the off-chain half of the §3.1 `openTimestamp` fix.
- [ ] **Run 3 resolvers with separate keys** (quorum = 2) as separate
  processes. Host them on Railway, Fly or Render, not a laptop, so the demo
  stays live during judging.

### 5.2 P0/P1: real adapters (the Robinhood event catalog)

Each adapter defines a `sourceId`, a spec schema, and evidence contents.

| sourceId | Event | Real source | Priority |
|---|---|---|---|
| `rh.corporate-action.v1` | "Stock token X has a multiplier change scheduled / effective by T" | On-chain (mainnet): stock token `uiMultiplier()`, `newUIMultiplier()`, `effectiveAt()`, `UIMultiplierUpdated` logs. Independent off-chain source: `api.robinhood.com/rhj/assets` (`currentMultiplier`, `pendingMultiplier`). Context: the SEC EDGAR filing that explains *why* (split or distribution). | **P0** |
| `rh.trading-status.v1` | "Token X was not tradable in the regular session at time T" | `api.robinhood.com/rhj/assets` → `tradingCapabilities.{market,extended,overnight}` | P1 |
| `chainlink.price-at.v1` | "NVDA token price ≥ $X at time T" | Chainlink `AggregatorV3Interface` on Robinhood Chain: find the round nearest T, reject stale rounds (`updatedAt` vs heartbeat), check the L2 sequencer-uptime feed | **P0** (replaces the mocked [priceFeedAdapter.ts](../resolver/adapters/priceFeedAdapter.ts)) |
| `rh.oracle-paused.v1` | "Token X's `oraclePaused()` was true at some point in [T1, T2]" (a historical fact that can't be read on-chain) | On-chain reads and logs of the stock token | P1 |
| `sec.earnings.v1` | "Company files an 8-K Item 2.02 by T" / "reported revenue ≥ $X" | SEC EDGAR submissions API and XBRL `companyfacts` (free; a `User-Agent` header is required) | P1 |
| `nasdaq.halt.v1` | "Ticker halted (e.g. LULD) during [T1, T2]" | Nasdaq Trader trade-halts RSS | P1 |
| `macro.fomc.v1` | "Fed target upper bound cut at meeting D" | FRED series `DFEDTARU` (free API key) | P1 |

- [ ] Where possible, give resolvers **different providers** for the same fact
  (e.g. resolver A uses Alchemy, B the public RPC, C Chainstack). Independent
  sources are the argument that three resolvers are better than one.
- [ ] **P1 evidence publishing.** [evidence.ts](../resolver/evidence/evidence.ts)
  only hashes. Also publish the raw evidence JSON (IPFS/Pinata, or a simple
  `/evidence/:hash` endpoint on each resolver) so a disputer or judge can
  check the hash. Show it in the frontend.

### 5.3 P1: keeper (a permissionless "poke" bot, not push delivery)

- [ ] A small service that calls `finalize()` once dispute windows end,
  `tryResolve()` on composites whose operands finalized, and `Market.settle()`
  on settleable markets. Without it, judges have to click through each step.
  This is **not** the deferred push/subscription relayer (Issue #13): it
  delivers nothing to consumers, it only calls permissionless functions.
- [ ] **Dispute voter:** listen for `TierOpened`, and if this resolver is on
  the committee, re-run its adapter and call `submitTier1Vote` /
  `submitTier2Vote`. This closes the gap CLAUDE.md lists and enables a
  **live dispute in the demo video**, which is a strong moment.

---

## 6. SDK checklist ([sdk/](../sdk/))

- [ ] **P0** Export `robinhood` and `robinhoodTestnet`, plus a
  `deployments[chainId]` address map loaded from `deployments/*.json`.
- [ ] **P0** Generate ABIs from `forge build` output (`@wagmi/cli` with its
  `foundry` plugin) instead of the hand-written
  [abis.ts](../sdk/src/abis.ts). Every §3 contract change otherwise
  risks silent ABI drift.
- [ ] **P0** ERC-20 flow: `approveCollateral()` + `depositCollateral(amount)`
  (no more `value:`). Add `getMarket` fields for `tradingClosesAt`,
  `question`, and refund mode.
- [ ] **P1** Per-`sourceId` spec encoders (`encodeCorporateActionSpec`,
  `encodePriceAtSpec`, …) and a v2 outcome decoder (`occurredAt`).
- [ ] **P1** `listEvents()` / `listMarkets()` via `getLogs`, the replacement
  for mock data.
- [ ] Keep the consumer/resolver boundary described in
  [client.ts](../sdk/src/client.ts): no resolver writes in the consumer
  client.

---

## 7. Wallet integration checklist ([wagmi.ts](../frontend/src/lib/wagmi.ts), [providers.tsx](../frontend/src/app/providers.tsx))

- [ ] **P0** `chains: [robinhoodTestnet, robinhood]` (keep `foundry` only when
  `NODE_ENV === "development"`), with Alchemy transports.
- [ ] **P0** A **real Reown/WalletConnect project ID**. Robinhood Wallet
  connects to dapps through WalletConnect and supports Robinhood Chain
  natively ([Robinhood support](https://robinhood.com/us/en/support/articles/connect-to-dapps/)).
  The current fallback `"novak-local-dev"` breaks WalletConnect, so
  **Robinhood Wallet can't connect today**.
- [ ] **P1** Use `connectorsForWallets` with a "Recommended" group that
  puts WalletConnect first, labelled for Robinhood Wallet, then MetaMask,
  then Coinbase. Test with the actual Robinhood Wallet app on a phone
  before recording the demo.
- [ ] **P1** Handle a wrong or missing chain with `switchChain` / add-network,
  plus a testnet faucet link and a MockUSDG "mint test USDG" button.
- [ ] **P1 (big UX win)** Sponsored gas / smart accounts through **Alchemy
  Account Kit**. Robinhood's docs name Alchemy as the recommended provider,
  including gasless transactions. First deposit with no ETH needed.
- [ ] **P2** Robinhood Connect onramp (Robinhood account → wallet funding).
  It's partner-gated, so apply, but don't block on it.

---

## 8. Frontend checklist

### 8.1 P0: honesty and live data (judges check this)

- [ ] **Remove or make live** the fake hero ticker in
  [page.tsx](../frontend/src/app/page.tsx): "LIVE STREAM: BTC > $100k AND Fed
  Rate Cut → 74.7% YES Odds". Nothing live produces it.
- [ ] [BentoIdeaSection.tsx](../frontend/src/components/BentoIdeaSection.tsx):
  "+10.0 ETH locked" contradicts `DISPUTE_BOND = 0.01 ether`. Crypto-native
  examples (BTC, blob gas, ETH staked) should become Robinhood-chain
  examples.
- [ ] [SiteFooter.tsx](../frontend/src/components/SiteFooter.tsx) says
  "Deterministic addresses on Local Anvil (Chain ID 31337)". Drive it from the
  connected chain and link addresses to Blockscout.
- [ ] Replace [mock-data.ts](../frontend/src/lib/mock-data.ts) consumers
  (`/markets`, `/markets/[id]`) with SDK `listMarkets` / `listEvents`. Keep
  `ExampleDataBadge` only where something is still illustrative.
- [ ] Every ETH amount becomes USDG, with an approve → deposit flow.

### 8.2 P0: rebrand copy from "Ethereum" to "Robinhood Chain"

- [ ] [layout.tsx](../frontend/src/app/layout.tsx) metadata title and
  description, hero badge ("Ethereum Oracle Primitive v1.0"), hero
  headline, BentoIdeaSection heading, and footer tagline and copyright.
- [ ] Hero suggestion. Headline: **"The event layer for tokenized stocks."**
  Subhead: *"Chainlink prices Robinhood Chain's stock tokens. Novak finalizes
  what happens to them: splits, halts, earnings, macro. Resolved once,
  disputed by bonded committees, and composable by every protocol on the
  chain."*
- [ ] Keep the "different shape of question" comparison section, but change
  the left card to "Chainlink: what is NVDA's price right now?" and the
  right card to "Novak: did NVDA split, and was it halted within 24h of
  earnings?". Present them as complementary.
- [ ] Add a **"The gap on Robinhood Chain"** section with the three quoted
  doc lines from §1 and links. Judges trust the chain's own docs.
- [ ] Don't use Robinhood's logo or brand styling. Say "built on Robinhood
  Chain", not "by Robinhood".

### 8.3 P1: market design

- [ ] **Market templates** in [CreateMarketCard.tsx](../frontend/src/components/CreateMarketCard.tsx)
  instead of "paste a 0x composite ID":
  1. *Earnings reaction:* `sec.earnings` (beat) **WITHIN 24h**
     `chainlink.price-at` (NVDA ≥ $X)
  2. *Split watch:* `rh.corporate-action` (split effective by date D)
  3. *Macro × stock:* `macro.fomc` (cut) **BEFORE** `sec.earnings`
  4. *Halt risk:* `nasdaq.halt` (TSLA halted during week W)
- [ ] **Market card** ([MarketCard.tsx](../frontend/src/components/markets/MarketCard.tsx)):
  ticker, live stock-token price from the Chainlink feed (labelled
  "price: Chainlink"), implied odds = YES pool / total, pools in USDG,
  "trading closes in …" countdown, and a status pill that covers refund
  mode.
- [ ] **Market detail** page: the lifecycle timeline (Open → Observations
  → Proposed → dispute-window countdown → Finalized / Voided), the existing
  [CompositionTree.tsx](../frontend/src/components/markets/CompositionTree.tsx),
  and a **"Settlement sources"** panel showing which resolvers observed it,
  evidence hashes linking to raw evidence, and which leg came from Chainlink.
- [ ] Drop or fix the synthetic charts in
  [MarketAnalyticsCharts.tsx](../frontend/src/components/markets/MarketAnalyticsCharts.tsx)
  unless real `CollateralDeposited` logs feed them.

### 8.4 P1: new pages that differentiate Novak

- [ ] **`/calendar`: the corporate-action calendar Chainlink doesn't
  provide.** Load the 195 tokens from `api.robinhood.com/rhj/assets`
  (proxied through a Next.js route handler to avoid CORS), confirm each one
  on-chain with `newUIMultiplier()` / `effectiveAt()` through multicall3, and list
  upcoming multiplier changes, with a "Create Novak event" button next to
  each. Cheap to build (read-only), and it directly answers the gap in §1.
- [ ] **`/events` and `/events/[id]`**: an event explorer with sourceId,
  spec, status, observations, dispute tiers, and a **"Consumers"** list
  showing the market *and* the lending guard reading this same event.
- [ ] **`/guard`**: `StockLendingGuard` demo showing "Liquidations for NVDA:
  **PAUSED**, because event 0x… (split effective in 3h) is finalized."
- [ ] A small eligibility notice: stock tokens aren't available to U.S. or UK
  persons ([docs](https://docs.robinhood.com/chain/stock-tokens/)), and
  the markets are a testnet demo.

---

## 9. Docs checklist

### In-app `/docs` ([frontend/src/app/docs/](../frontend/src/app/docs/))

- [ ] **New page: "Robinhood Chain"**: network facts, deployed addresses,
  the sourceId catalog (§5.2) with spec encodings, and a 20-line "consume a
  corporate-action event from your lending protocol" Solidity snippet.
- [ ] **New page: "Novak + Chainlink"**: the §1 table, and how the
  `chainlink.price-at` adapter reads feeds (staleness, sequencer uptime).
- [ ] Update `lifecycle` (openTimestamp guard, refund mode), `composition`
  (occurredAt semantics), `disputes` (pull payments, Arbitrum randomness
  caveat), and `threat-model` (§10 below).
- [ ] Update the `sdk` and `api` pages with the new client methods and the USDG
  approve flow.

### Repo docs

- [ ] [README.md](../README.md): Robinhood Chain quickstart, explorer links,
  and a 60-second "what is this" leading with the §1 one-liner.
- [ ] [protocol-spec.md](protocol-spec.md): specVersion 2 payload, the
  openTimestamp rule, Bus tri-state, per-sourceId spec schemas.
- [ ] [threat-model.md](threat-model.md): Arbitrum/Orbit specifics. The
  sequencer controls ordering and `block.timestamp` within bounds, and
  `blockhash` is insecure. Sequencer downtime means dispute windows can
  expire while users can't transact, so check the L2 sequencer-uptime feed
  or extend windows. Also cover the reverting-disputer DoS and the market
  close-time exploit (now fixed).
- [ ] [architecture.md](architecture.md): add the keeper, adapters and the
  second consumer.
- [ ] [SPEC_AND_TASKS.md](SPEC_AND_TASKS.md): tick Issue #20 (deployment)
  and the Issue #4 items (real source, discovery), and add a Robinhood
  milestone that links here.
- [ ] [CLAUDE.md](../CLAUDE.md): the new chain, USDG collateral, the
  StockLendingGuard invariant test, and specVersion 2.

---

## 10. Submission package (P0)

- [ ] **3-minute video:**
  1. The gap, quoting Robinhood's and Chainlink's own docs (§1).
  2. A corporate-action event finalized live on the testnet explorer.
  3. The **same event** read by a market and by the lending guard.
  4. A composite market settling in USDG.
  5. A dispute opening Tier 1 and committee votes converging.
  6. One line on the business model.
- [ ] **Business plan slide:**
  - Settlement fee on markets.
  - Event-creation fee, or sponsored events paid for by protocols.
  - Paid event classes (corporate actions, halts) for lending/perp
    protocols on Robinhood Chain.
  - The one-liner: "Chainlink for prices, Novak for facts".
- [ ] Links in the submission: testnet explorer links for verified
  contracts, the hosted frontend (Vercel), and hosted resolvers (a public
  status endpoint).
- [ ] Make sure the repo is public, the MIT license is visible, and CI is green.

---

## 11. Schedule (17 days)

| Dates | Focus | Exit criterion |
|---|---|---|
| Sep 25–28 | §3.1 + §3.2 contract fixes with tests, and USDG / MockUSDG | `forge test` green, including new regression tests |
| Sep 28–29 | §4 deploy + verify on testnet, `deployments/46630.json` | Contracts verified on Blockscout |
| Sep 29–Oct 3 | §5.1 daemon, `rh.corporate-action` + `chainlink.price-at` adapters, keeper, 3 hosted resolvers | A real event finalizes on testnet with no manual steps |
| Oct 1–3 | §6 SDK regeneration and chain config | Frontend and resolver build against the generated ABIs |
| Oct 2–7 | §7 wallet + §8.1–8.3 frontend (live data, rebrand, templates) | Robinhood Wallet connects and deposits USDG |
| Oct 6–9 | §3.5 lending guard, §8.4 calendar/guard pages, P1 adapters, dispute voter | Same event consumed by 2 contracts on testnet |
| Oct 8–10 | §9 docs, §3.3 specVersion 2 if not already done | Docs match code |
| Oct 10–11 | §10 video and submission | **Submitted Oct 11** (a 1-day buffer) |

## 12. What not to do

- Don't pivot, add chains, or chase other tracks. It's one track.
- Don't build push subscriptions, staking tokens, AMMs, or perps (out of
  scope in CLAUDE.md, and judges won't reward half-built versions).
- Don't show fake "live" numbers. Anything illustrative gets the
  `ExampleDataBadge`.
- Don't position against Chainlink.
