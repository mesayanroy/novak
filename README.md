# Novak — the Oracle layer for tokenized stocks on Robinhood Chain

[![CI](https://github.com/mesayanroy/novak/actions/workflows/ci.yml/badge.svg)](https://github.com/mesayanroy/novak/actions/workflows/ci.yml)
[![Built with Foundry](https://img.shields.io/badge/built%20with-Foundry-4a4a4a)](https://book.getfoundry.sh/)
[![pnpm workspaces](https://img.shields.io/badge/pnpm-workspaces-f9ad00)](https://pnpm.io/workspaces)

> **Chainlink tells your contract the price. Novak tells it what happened.**

Robinhood Chain ships Chainlink price feeds for ~95 tokenized stocks. It does
**not** ship the facts around those prices: Chainlink's own docs say it
"does not provide corporate-action calendar data or automated pause
triggers", Robinhood's docs call the token's `oraclePaused()` flag "advisory
and not enforced on-chain", and every lending/DEX integrator is told to track
ERC-8056 multiplier changes on its own.

Novak turns those facts — splits and dividend adjustments, trading halts,
"NVDA ≥ $X at time T" — into **finalized on-chain events**: resolved once by
independent resolvers from live Robinhood Chain data, disputable by bonded
committees (never a token-weighted vote), composable with AND / OR / NOT /
BEFORE / WITHIN, and read by every protocol through one `EventBus`. Chainlink
is one of Novak's data sources, not a competitor.

Two consumers ship in this repo and read the **same** events:

- **`Market`** — USDG parimutuel markets that settle on any Novak event.
- **`StockLendingGuard`** — a liquidation circuit-breaker: a lending protocol
  calls `canLiquidate(stockToken)` and liquidations pause while a finalized
  corporate-action/halt event is true.

## Contents

- [What's verified](#whats-verified)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Status](#status)
- [Quickstart: Robinhood Chain testnet](#quickstart-robinhood-chain-testnet)
- [Local development](#local-development)
- [Testing & CI](#testing--ci)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [License](#license)

## What's verified

- **Contracts:** `forge test` → **112/112** passing (unit / integration / fuzz
  / adversarial), including regression tests for the market fund-loss bug
  fixed in this pass (see `docs/threat-model.md`).
- **Deployment:** the full stack simulates cleanly against the live Robinhood
  Chain testnet (46630); total cost ≈ 0.0003 ETH of faucet ETH.
- **Resolvers on live data:** the three adapters were run against Robinhood
  Chain mainnet and Robinhood's asset API (`pnpm --filter novak-resolver
  probe`): Chainlink `Robinhood NVDA / USD` rounds, NVDA's real ERC-8056
  multiplier update (effective 2026-09-10), and per-session tradability.
- **Autonomous pipeline:** on a local chain, three resolver processes +
  keeper resolved seeded events from live mainnet data, reached quorum with
  identical evidence hashes, finalized, resolved an AND composite, settled
  three markets, paused NVDA liquidations in the guard, and handled a filed
  dispute (committee re-observed and voted; bond forfeited) — no manual steps.

## Architecture

```
            Robinhood Chain MAINNET (read-only data sources)
   Chainlink stock feeds · ERC-8056 stock tokens · api.robinhood.com/rhj/assets
                                   │
                        resolver network (≥3 nodes)
          observe → evidence hash → submitObservation · vote in disputes
                                   │
   ┌─────────── Robinhood Chain TESTNET (where Novak is deployed) ────────────┐
   │ EventRegistry + DisputeManager → EventComposer → EventBus → consumers     │
   │ (state machine,  (bonded 2-tier  (AND/OR/NOT,     (pull     Market (USDG) │
   │  quorum)          committees)     BEFORE/WITHIN)   reads)   StockLending- │
   │                                                             Guard         │
   └───────────────────────────────────────────────────────────────────────────┘
                     keeper: finalize · tryResolve · settle
```

Lifecycle: `CREATE → OPEN → OBSERVATIONS SUBMITTED → PROPOSED OUTCOME →
(DISPUTED) → FINALIZED | VOIDED | EXPIRED → AVAILABLE TO CONSUMERS`.

**Hard invariant: applications depend on the Event Bus, never directly on a
resolver, the Registry, the DisputeManager, or the Composer.** Enforced by
regression tests (`test_market_onlyHoldsSettlementReference`,
`test_guard_onlyHoldsEventBusReference`). See `docs/architecture.md`,
`docs/protocol-spec.md`, `docs/threat-model.md`, and
`docs/ROBINHOOD_CHAIN_PLAN.md` (track plan + verified environment facts).

## Repository layout

```
novak/
├── contracts/     EventRegistry, DisputeManager, EventComposer, EventBus,
│                  SubscriptionManager, mocks/MockUSDG + interfaces/
├── derivatives/   Market (USDG), PositionManager, Settlement — IEventBus consumers
├── consumers/     StockLendingGuard — second IEventBus consumer
├── resolver/      resolver daemon: adapters (chainlink.price-at,
│                  rh.corporate-action, rh.trading-status), discovery,
│                  keeper, dispute voter, /health + /evidence server
├── sdk/           @novak/sdk — generated ABIs, deployments, chains, source specs
├── frontend/      Next.js app: landing, /markets, /calendar, /guard, /docs
├── deployments/   <chainId>.json — addresses + startBlock (script/export-deployment.mjs)
├── script/        Deploy.s.sol, export-deployment.mjs
├── examples/      end-to-end-flow.ts, seed-demo.ts
├── test/          unit/ integration/ fuzz/ adversarial/ (Foundry)
└── docs/          architecture, protocol-spec, threat-model, SPEC_AND_TASKS,
                   ROBINHOOD_CHAIN_PLAN
```

## Status

Implemented and tested: event registry with enforced observation windows;
N-of-M resolver quorum with a non-convergence escalation path; bonded
two-tier committee disputes with pull payments; specVersion 2 outcomes
(`occurredAt`) so BEFORE/WITHIN compare when facts *happened*; terminal
`Voided`/`Expired` propagation; `EventBus.getAvailability`
(Pending/Available/Voided); USDG markets with trading windows, refunds on
voided events and a protocol fee; `StockLendingGuard`; real resolver
adapters, on-chain event discovery, keeper and dispute voter; SDK with
generated ABIs; live-data frontend with Robinhood Wallet (WalletConnect).

Known limits (details in `docs/threat-model.md` and `docs/protocol-spec.md`):
committee selection is block-data pseudo-randomness (Chainlink VRF is not
available on Robinhood Chain); no staking/reputation token behind resolvers;
testnet only — Robinhood Chain mainnet is read, not written; no push/relayer
delivery to consumers (the keeper only calls permissionless functions).

## Quickstart: Robinhood Chain testnet

Network: chain ID **46630**, RPC `https://rpc.testnet.chain.robinhood.com`,
explorer `https://explorer.testnet.chain.robinhood.com`, faucet
`https://faucet.testnet.chain.robinhood.com` (gas is ETH).

```bash
forge install foundry-rs/forge-std --no-commit && pnpm install
cp .env.example .env    # DEPLOYER_PRIVATE_KEY, RESOLVER_ADDRESSES, ...

# 1. Deploy + verify (MockUSDG is deployed automatically on testnet)
forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast --verify
node script/export-deployment.mjs 46630          # -> deployments/46630.json
pnpm --filter @novak/sdk gen && pnpm --filter @novak/sdk build

# 2. Run 3 resolvers (different keys; one also runs the keeper)
RESOLVER_ID=r1 RESOLVER_PRIVATE_KEY=0x.. RESOLVER_KEEPER=true RESOLVER_HTTP_PORT=8787 pnpm --filter novak-resolver start
RESOLVER_ID=r2 RESOLVER_PRIVATE_KEY=0x.. pnpm --filter novak-resolver start
RESOLVER_ID=r3 RESOLVER_PRIVATE_KEY=0x.. pnpm --filter novak-resolver start

# 3. Seed the demo set (live NVDA/TSLA thresholds, a composite, markets,
#    a corporate-action event wired into the lending guard)
NOVAK_CHAIN_ID=46630 pnpm tsx examples/seed-demo.ts

# 4. Frontend (needs NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID for Robinhood Wallet)
pnpm --filter novak-frontend dev
```

See what a resolver would vote right now, against live sources, without any
deployment: `pnpm --filter novak-resolver probe`.

## Local development

```bash
anvil
RESOLVER_ADDRESSES=0x70997970C51812dc3A010C7d01b50e0d17dc79C8,0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,0x90F79bf6EB2c4f870365E785982E1f101E93b906 \
  DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
node script/export-deployment.mjs 31337 && pnpm --filter @novak/sdk gen
pnpm example:e2e                                  # canonical flow, scripted
cast rpc evm_setIntervalMining 2                  # resolvers need blocks to see time pass
NOVAK_CHAIN_ID=31337 ... pnpm --filter novak-resolver start   # as above, anvil keys #1-#3
NEXT_PUBLIC_CHAIN_ID=31337 pnpm --filter novak-frontend dev
```

(Those keys are anvil's public test keys — local use only.)

## Testing & CI

CI runs on every push to `main` and on every pull request
(`.github/workflows/ci.yml`), as two independent jobs:

| Job          | Steps                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------- |
| `contracts`  | checkout (with submodules) → install Foundry → `forge install forge-std` → `forge fmt --check` → `forge build` → `forge test -vvv` |
| `typescript` | checkout → pnpm install (`--frozen-lockfile`) → build `sdk` then `resolver` → run `resolver`/`sdk` tests (Vitest) → build `frontend` |

The `frontend` workspace currently has a build/lint step in CI but no
automated test suite (`frontend/package.json` has no `test` script yet) —
noted here rather than implied by omission.

Run the same checks locally before pushing:

```bash
forge fmt --check && forge build && forge test -vvv

pnpm install --frozen-lockfile
pnpm --filter novak-resolver build && pnpm --filter @novak/sdk build
pnpm --filter novak-resolver test && pnpm --filter @novak/sdk test
pnpm --filter novak-frontend build
```

A PR is mergeable once both jobs are green.

## Contributing

This is a 3-person ETHOnline team project. Roles and per-milestone
owners/support are tracked in `docs/SPEC_AND_TASKS.md`'s **Repository
Ownership** table — check there before assuming who to loop in on a review.
The "Owner" column reflects who's leading an area, not a gate on whether work
counts as done; `docs/SPEC_AND_TASKS.md` is checked off against actual
passing tests regardless of who touched the code.

Before opening a PR:

1. **Read `CLAUDE.md`** — it states the one invariant that must never break
   (apps depend on the Event Bus only, never on a resolver/Registry/
   DisputeManager/Composer directly) and the toolchain gotchas that have
   bitten this codebase more than once.
2. **Check `docs/SPEC_AND_TASKS.md`** for the current milestone status before
   starting work — pick up an unchecked item, or extend one already marked
   done with a note on what's still missing rather than re-claiming it.
3. **Don't touch a FINALIZED protocol semantic** (event/composite ID
   derivation, quorum model, outcome payload schema, temporal-op timestamp
   source — see `docs/protocol-spec.md`) without updating the code and that
   document together; they're cross-referenced and drifting them apart is
   worse than not changing either.
4. **Add a regression test for any new consumer contract** that mirrors
   `test_market_onlyHoldsSettlementReference`, if it should only ever read
   through the Bus.
5. **Run the [Testing & CI](#testing--ci) checks locally** — a PR only merges
   once both CI jobs are green.

A Foundry-specific pitfall worth knowing before editing tests: writing
`vm.prank(x); contract.fn{value: contract.SOME_CONSTANT()}(...)` silently
runs `fn` as the *test contract*, not `x` — the constant getter is itself an
external call that consumes the prank before `fn` executes. Always hoist the
value into a local variable first. See CLAUDE.md's "Toolchain / environment
notes" for the exact test files this has hit before.

## Documentation

| Doc                          | Covers                                                             |
| ----------------------------- | ------------------------------------------------------------------- |
| `CLAUDE.md`                    | Orientation for anyone (human or agent) working in this repo        |
| `docs/architecture.md`         | Component breakdown + diagram                                       |
| `docs/protocol-spec.md`        | Finalized data shapes and protocol-semantic decisions               |
| `docs/threat-model.md`         | Adversary list, mitigations, and residual gaps                      |
| `docs/SPEC_AND_TASKS.md`       | Milestone-by-milestone deliverables checklist and ownership          |
| `docs/FRONTEND_SPEC.md`        | Frontend stack, route map, component inventory, live/mock data map  |

## License

No license file has been added yet — this is an ETHOnline hackathon
submission. Until one is added, treat the repository as all-rights-reserved
by its authors rather than open for reuse.
