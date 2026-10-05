# CLAUDE.md

Orientation doc for any LLM/agent working in this repo. Read this before
making changes — it tells you what exists, what's deliberately unfinished,
and the invariants you must not break.

## What this project is

**Novak (Neural Event Network / NEN)** — the event layer for tokenized stocks
on **Robinhood Chain** (Arbitrum Orbit L2), entered in the Colosseum Crypto
World's Fair **Robinhood Chain track** (deadline 2026-10-12). Positioning:
"Chainlink tells your contract the price. Novak tells it what happened."
Real-world facts about Robinhood Stock Tokens (corporate actions, trading
status, price-at-time conditions) are resolved, finalized and stored once,
composed (AND/OR/NOT, BEFORE/WITHIN), and consumed by many contracts.
Chainlink is a Novak **data source**, never framed as a competitor. Two
consumers ship: `DistributionMarket` (LMSR range markets over threshold-
event ladders), a USDG yes/no `Market`, and `StockLendingGuard`. Novak is
pitched as a **dispute layer** other prediction markets integrate
(`docs/INTEGRATE.md`). The **TreasuryVault** splits every fee per event in
thirds: correct resolvers, correct committee voters (or insurance), and the
treasury.

Deployment: **testnet only (46630)**. Resolvers READ Robinhood Chain mainnet
(4663) — Chainlink stock feeds and ERC-8056 stock tokens exist only there —
and WRITE to testnet. Verified facts + the build plan:
`docs/ROBINHOOD_CHAIN_PLAN.md`.

Full narrative context: `README.md` (setup/commands), `docs/architecture.md`
(component breakdown + diagram), `docs/protocol-spec.md` (data shapes +
finalized protocol decisions), `docs/threat-model.md` (adversary list),
`docs/SPEC_AND_TASKS.md` (milestone-by-milestone deliverables checklist —
the authoritative "what's actually done" tracker).

## The one rule that must never be broken

**Applications depend on the Event Bus, never directly on a resolver, the
Registry, or the Composer.** `derivatives/Market.sol` holds only a
`Settlement` reference, `derivatives/Settlement.sol` and
`consumers/StockLendingGuard.sol` hold only an `IEventBus` reference.
Enforced by regression tests:
`test/unit/Market.t.sol::test_market_onlyHoldsSettlementReference`,
`test/unit/DistributionMarket.t.sol::test_holdsOnlySettlementReference`,
`test/unit/StockLendingGuard.t.sol::test_guard_onlyHoldsEventBusReference` and
`test/unit/ExternalPredictionMarket.t.sol::test_holdsOnlyEventBusReference`.
Consumers may also *push* fees into `ITreasuryVault`. The vault (protocol
infrastructure) is the one that reads the Registry/DisputeManager to pay people.
If you add a new consumer contract, add an equivalent guard test. Consumers
that hold funds must handle `IEventBus.Availability.Voided` (Market refunds). Same principle applies
on the TS side: the frontend and SDK read event state through
`eventBus`/`settlement`/`market` ABI calls only, never through a resolver's
internals.

## Event lifecycle (the thing everything else hangs off)

```
CREATE -> OPEN -> OBSERVATIONS SUBMITTED -> PROPOSED OUTCOME -> DISPUTED
       -> FINALIZED (or VOIDED / EXPIRED) -> AVAILABLE TO CONSUMERS
```

- **Registry** (`contracts/EventRegistry.sol`) owns this state machine:
  `createEvent`, `submitObservation` (quorum-gated auto-proposal; rejected
  before `openTimestamp`; v2 payloads validated), `finalize`
  (undisputed path), `expire` (nobody ever observed it). It deliberately
  knows nothing about committees or bonds — dispute-side transitions
  (`escalateToDispute`/`finalizeFromDispute`/`voidEvent`) are gated
  `onlyDisputeManager`.
- **DisputeManager** (`contracts/DisputeManager.sol`) — bonded, two-tier
  committee escalation ladder: `dispute`/`escalateNonConvergence` open
  Tier-1 (≤7 resolvers, ≥66% agreement); failing to converge escalates to
  Tier-2 (≤15); failing there marks the event permanently `Voided` (bonds
  refunded) — **never** a token-weighted vote. Payouts are **pull-based**
  (`pendingWithdrawals` + `withdraw()`) so a reverting recipient can't
  freeze a dispute. Fully implemented.
- **Resolver network** (`resolver/`) — independent daemons that discover
  events from logs, observe real sources via adapters
  (`chainlink.price-at.v1`, `rh.corporate-action.v1`,
  `rh.trading-status.v1`), submit outcome + evidence hash, vote in dispute
  committees, and (one node, `RESOLVER_KEEPER=true`) poke permissionless
  transitions (finalize/escalate/tryResolve/settle). Serves
  `/health` + `/evidence/:hash`.
- **Composer** (`contracts/EventComposer.sol`) — builds composite events from
  primitive event IDs (AND/OR/NOT/BEFORE/WITHIN), deterministically, without
  duplicating Registry state. Composite identity is canonicalized for every
  order-independent operator (not `BEFORE`); composition depth/fan-in are
  structurally bounded; a `Voided`/`Expired` operand propagates instead of
  stalling a dependent composite forever. `tryResolve` caches its result
  forever once computed.
- **Bus** (`contracts/EventBus.sol`) — the only pull-based read surface
  consumers should use. Transparently serves both primitive (Registry) and
  composite (Composer) event outcomes; `getAvailability` returns
  Pending/Available/Voided.
- **Market** (`derivatives/Market.sol`) — USDG (ERC-20) parimutuel markets
  with `tradingClosesAt` (deposits AND withdrawals stop there — this fixed a
  real fund-loss bug), refunds on Voided, a protocol fee, and on-chain
  enumeration. `contracts/mocks/MockUSDG.sol` is the testnet collateral.
- **TreasuryVault** (`contracts/TreasuryVault.sol`) — fee thirds per event
  (resolvers whose `observedOutcome` matches; the deciding tier's members who
  voted the outcome, else the insurance reserve, which tops up later disputed
  events; treasury), pull claims, and `sweepDisputeProceeds` for the
  DisputeManager's ETH treasury third. The Registry records each resolver's
  observed boolean for this.
- **DistributionMarket** (`derivatives/DistributionMarket.sol`) — LMSR bucket
  AMM over N−1 ascending threshold events; winning bucket = number of TRUE
  boundaries. Any voided or inconsistent boundary voids the market (1/N per
  share). It re-checks `reserve ≥ C(q)` on every trade, and trading stops
  at close or once any boundary is decided. Math comes from vendored Solady
  (`contracts/vendor/`, fmt-ignored).
- **SubscriptionManager** — stub only, by design. MVP is pull-only; do not
  build push/callback delivery (that's the deferred relayer, Issue #13 in
  `docs/SPEC_AND_TASKS.md`).

## Repo layout

```
contracts/       Foundry workspace: EventRegistry, DisputeManager, EventBus,
                  EventComposer, SubscriptionManager + interfaces/ (I*.sol)
derivatives/      Market (USDG parimutuel pools), PositionManager, Settlement —
                  IEventBus consumers only (via Settlement)
consumers/        StockLendingGuard — second IEventBus consumer
deployments/      <chainId>.json (addresses + startBlock), from
                  script/export-deployment.mjs — the single address source
resolver/         daemon: node/ (discovery, resolve, keeper, voter, server)
                  adapters/ evidence/ consensus/ lib/ scripts/probe-sources.ts
sdk/              @novak/sdk — GENERATED abis.ts + deployments.ts (scripts/gen.mjs),
                  chains, source-spec encoders, NovakClient (viem ≥ 2.56)
frontend/         Next.js: /, /markets, /markets/[id], /calendar, /guard, /docs;
                  api/rh-assets route; Robinhood Wallet via WalletConnect
test/             unit/ integration/ fuzz/ adversarial/ (Foundry) — 138 tests, all passing
script/           Deploy.s.sol (Registry -> DisputeManager -> Composer -> Bus
                  -> Settlement -> Market)
examples/         end-to-end-flow.ts (scripted canonical flow), seed-demo.ts
                  (seeds live-priced demo events/markets/guard rule on any chain)
docs/             architecture.md, protocol-spec.md, threat-model.md,
                  SPEC_AND_TASKS.md (living)
```

## Current status

`forge test` → 138/138. v2 (2026-10-04): TreasuryVault + DistributionMarket +
Fed-rate adapter + rewards duty verified live on anvil from real mainnet
data: six range markets settled on the correct range, fee thirds were
claimed, and the winner redeemed 1 USDG per share. Verified in the 2026-09-25 pass: full-stack deploy
simulates on the live Robinhood testnet; `pnpm example:e2e` runs on anvil;
three resolver processes + keeper resolved seeded events from LIVE mainnet
data, finalized, resolved a composite, settled markets, paused NVDA
liquidations in the guard, and handled a filed dispute end to end.

**Still genuinely incomplete:**

- **Deployed to Robinhood testnet 2026-10-05** (all contracts verified on
  Blockscout; addresses in README / deployments/46630.json; run
  `bash script/deploy-testnet.sh` to redeploy). Only TWO resolvers so far
  (r1 + the deployer as r2) — add independent operators. Previously: the team
  needed funded faucet keys (deployer + 3 resolvers). `deployments/46630.json` must only ever come
  from a real broadcast via `export-deployment.mjs`. A previous copy of the
  anvil addresses there pointed the frontend at addresses with no code. The
  frontend shows badged preview markets ONLY when no deployment exists.
- **Frontend not click-tested in a browser** — builds, typechecks, serves
  200s, API route verified with real data.
- **Committee selection is block-data pseudo-randomness**, weaker on
  Arbitrum chains (`prevrandao` = 1, `blockhash` insecure) and Chainlink VRF
  is not on Robinhood Chain. Mitigation plan: commit-reveal; keep the
  resolver pool ≤ 7 meanwhile. See `docs/threat-model.md` items 10, 16.
- **No push/relayer delivery** (Issue #13) — the keeper only calls
  permissionless functions; consumers still pull.
- **No staking/reputation token** behind resolver authorization or
  committee membership (flat bonds).

**Protocol semantics that were open TODOs are now FINALIZED** — event ID
derivation, composite ID derivation (**canonicalized/sorted for every
order-independent operator** — `AND`, `OR`, `NOT`, `WITHIN` — except
`BEFORE`, where operand order is semantic and deliberately preserved),
outcome payload schema (`abi.encode(bool)` specVersion 1;
`abi.encode(bool, uint64 occurredAt)` specVersion 2 — temporal ops use
`occurredAt`), consumer availability (`getAvailability`), market trading
window + void refunds, quorum model
(N-of-M exact-match, authorized resolvers, no staking, with a defined
escalation path for a non-converging/ambiguous quorum), temporal op
timestamp source (`Outcome.finalizedAt` for primitives, resolution-time for
nested composites), structural DAG bounds (`MAX_CHILDREN_PER_NODE` = 10,
`MAX_DAG_DEPTH` = 8) with a stated cycle-impossibility proof, and
terminal-state (`Voided`/`Expired`) propagation through composition. See
`docs/protocol-spec.md` for the reasoning behind each. **If you need to
change one of these, update both the code and that doc together** — they're
cross-referenced.

## MVP scope boundaries

**In scope (implemented):** Event Registry, event spec format, resolver
network with real Robinhood Chain adapters, event discovery, keeper and
dispute voter, multiple observations, quorum (incl. the ambiguous-split
escalation path), bonded two-tier committee dispute escalation
(`DisputeManager`), finalization, terminal non-outcomes (`Voided`/`Expired`)
with propagation through composition, structural DAG bounds, pull-based
on-chain Event Bus (primitive + composite), AND/OR/NOT + BEFORE/WITHIN
composition with canonicalized identity, derivatives market with
event-based settlement (USDG), StockLendingGuard, TS SDK with generated
ABIs, Robinhood testnet deployment scripts, live-data frontend, end-to-end demo.

**Explicitly out of scope — do not add complexity for these:** cross-chain
events, ZK oracle proofs, permissionless resolver marketplace (staking
tokens), MEV mechanisms, high-frequency event streams, perpetual
derivatives, complex liquidation systems, production-scale token economics,
*full* stake-weighted/VRF-selected decentralized dispute arbitration (the
bonded committee ladder above is real progress on this, not the final
design — see `docs/protocol-spec.md`).

## Toolchain / environment notes

- **Foundry** (`forge`, `anvil`, `cast`) is required for `contracts/`,
  `derivatives/`, and `test/`. Installed via `foundryup`; `lib/forge-std` is a
  git submodule (`forge install foundry-rs/forge-std --no-commit`) — it is
  gitignored except for `.gitmodules`, so a fresh clone must re-run that
  install step.
- **pnpm workspaces** (not Turborepo) tie together `resolver/`, `sdk/`,
  `frontend/`. `resolver/` depends on `@novak/sdk` (workspace link) for
  shared ABIs and the outcome codec — build `sdk/` before `resolver/` on a
  clean install (`pnpm --filter @novak/sdk build` first).
- `derivatives/*.sol` and `consumers/*.sol` are NOT under Foundry's `src`
  (`contracts/`) — they're picked up because `test/` files (and
  `script/Deploy.s.sol`) import them directly. A new contract nothing imports
  won't be compiled by `forge build`.
- **ABIs are generated, never hand-edited:** after any contract change run
  `forge build && pnpm --filter @novak/sdk gen && pnpm --filter @novak/sdk build`.
  Addresses come from `deployments/<chainId>.json`
  (`node script/export-deployment.mjs <chainId>` after a deploy).
- **Arbitrum/Orbit quirks:** inside contracts `block.number` is an L1
  estimate (don't use it for log scanning — the export script reads L2 block
  numbers from broadcast receipts); `prevrandao` is 1.
- **Local anvil + resolvers:** anvil only mines on transactions, so resolvers
  never see time pass — run `cast rpc evm_setIntervalMining 2`.
- The public Robinhood mainnet RPC is not an archive node (no historical
  `eth_call`); adapters read logs instead. Topic-filtered `getLogs` over
  ~1.5M blocks works.
- The frontend's `next.config.mjs` aliases out `@x402/*` modules — these are
  optional transitive deps of wagmi's Coinbase Smart Wallet connector that
  aren't installed and aren't used (the demo only wires up the `injected`
  connector). Don't remove that alias without checking `next build` still
  passes.
- **`vm.prank` + inline value expressions in Foundry tests**: writing
  `vm.prank(x); disputeManager.dispute{value: disputeManager.DISPUTE_BOND()}(id)`
  is a bug — `disputeManager.DISPUTE_BOND()` is itself an external call that
  consumes the prank before `dispute()` runs, so `dispute()` actually
  executes as the default test-contract caller, not `x`. Always hoist the
  value into a local variable first. This has bitten tests across two
  separate passes now (originally on `EventRegistry.dispute`, again on
  `DisputeManager.dispute` during the Gap 1–5 protocol-layer pass); see the
  git history on `test/unit/EventRegistry.t.sol` /
  `test/adversarial/MaliciousResolver.t.sol` / `test/unit/EventComposer.t.sol`
  (`_createVoidedPrimitive`) if you need a worked example.

## Commands

```bash
# Contracts
forge build
forge test -vvv

# TS workspaces
pnpm install
pnpm --filter @novak/sdk build   # build sdk first — resolver depends on it
pnpm build                        # resolver + sdk + frontend
pnpm test                         # forge test + all TS tests
pnpm --filter novak-resolver dev
pnpm --filter novak-frontend dev

# Deploy (testnet; MockUSDG auto-deployed) and export addresses
forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast --verify
node script/export-deployment.mjs 46630 && pnpm --filter @novak/sdk gen

# Resolvers (3 keys; one with RESOLVER_KEEPER=true), live-source probe, demo seed
pnpm --filter novak-resolver start
pnpm --filter novak-resolver probe
NOVAK_CHAIN_ID=46630 pnpm tsx examples/seed-demo.ts

# Local: anvil + deploy with RPC http://127.0.0.1:8545, export 31337, then
pnpm example:e2e
```

See `README.md` for the full setup walkthrough and `.env.example` for every
environment variable consumed across `resolver/`, `frontend/`, and deploy
scripts.
