# CLAUDE.md

Orientation doc for any LLM/agent working in this repo. Read this before
making changes — it tells you what exists, what's deliberately unfinished,
and the invariants you must not break.

## What this project is

**Novak (Neural Event Network / NEN)** — a decentralized, composable event bus
for Ethereum, built for ETHOnline. On-chain and real-world events are
resolved, finalized, and stored once, then composed (AND/OR/NOT,
BEFORE/WITHIN) and consumed by many independent smart contracts, instead of
every app building its own oracle integration. The first consumer application
is a derivatives market that settles against composite events.

Full narrative context: `README.md` (setup/commands), `docs/architecture.md`
(component breakdown + diagram), `docs/protocol-spec.md` (data shapes + open
protocol decisions), `docs/threat-model.md` (adversary list).

## The one rule that must never be broken

**Applications depend on the Event Bus, never directly on a resolver, the
Registry, or the Composer.** `derivatives/Market.sol` and
`derivatives/Settlement.sol` must only ever hold an `IEventBus` reference.
This is enforced by a regression test:
`test/unit/Market.t.sol::test_market_onlyHoldsEventBusReference`. If you add a
new consumer contract, add an equivalent guard test. Same principle applies
on the TS side: the frontend and SDK read event state through
`eventBus`/`market` ABI calls only, never through a resolver's internals.

## Event lifecycle (the thing everything else hangs off)

```
CREATE -> OPEN -> OBSERVATIONS SUBMITTED -> PROPOSED OUTCOME -> DISPUTE WINDOW
       -> QUORUM/RESOLUTION -> FINALIZED -> AVAILABLE TO CONSUMERS
```

- **Registry** (`contracts/EventRegistry.sol`) owns this state machine and is
  the canonical source of event definitions/outcomes.
- **Resolver network** (`resolver/`) — independent off-chain processes that
  fetch source data (adapters), hash it into evidence, and reach quorum
  before an outcome is proposed on-chain.
- **Composer** (`contracts/EventComposer.sol`) — builds composite events from
  primitive event IDs (AND/OR/NOT/BEFORE/WITHIN), deterministically, without
  duplicating Registry state.
- **Bus** (`contracts/EventBus.sol`) — the only pull-based read surface
  consumers should use.
- **SubscriptionManager** — stub only. MVP is pull-only; do not build push/
  callback delivery.

## Repo layout

```
contracts/       Foundry workspace: EventRegistry, EventBus, EventComposer,
                  SubscriptionManager + interfaces/ (I*.sol)
derivatives/      Market, PositionManager, Settlement — IEventBus consumers only
resolver/         Node/TS resolver daemon: node/ adapters/ evidence/ consensus/
sdk/              @novak/sdk — TS client wrapping contract calls (viem-based)
frontend/         Next.js + Tailwind + wagmi/viem demo UI
test/             unit/ integration/ fuzz/ adversarial/ (Foundry)
script/           Deploy.s.sol (Registry -> Composer -> Bus -> derivatives)
examples/         end-to-end-flow.ts — canonical create->compose->settle demo
docs/             architecture.md, protocol-spec.md, threat-model.md (living)
```

## Current status: scaffold, not a working protocol

Everything **compiles and its tests pass** (14/14 Foundry tests; SDK and
resolver vitest suites pass; frontend `next build` succeeds), but core
business logic is intentionally NOT implemented yet:

- `EventRegistry` has no `submitObservation` / `proposeOutcome` /
  `openDispute` / `finalize` methods — only `createEvent` and read paths
  exist. The resolver <-> Registry write path is entirely TODO.
- `EventComposer.tryResolve` always returns `(false, false)` — per-op
  resolution logic (AND/OR/NOT/BEFORE/WITHIN against finalized primitive
  outcomes) is unimplemented.
- `resolver/consensus/quorum.ts` implements a placeholder "all observations
  must exactly match" rule — not real quorum math.
- `derivatives/Settlement.sol` computes a payout of `0` always — no
  collateral/token model exists yet (deferred per MVP scope).
- `test/adversarial/` has one placeholder test; real adversarial coverage
  (conflicting resolvers, dispute spam, etc.) needs the above logic first.

**Do not silently implement these.** Several are marked
`TODO(protocol semantics)` in the Solidity comments because they lock in
irreversible on-chain identity/economic decisions (event ID derivation,
composite ID derivation + operand-order sensitivity, quorum threshold model,
temporal-op timestamp source, outcome payload schema). If asked to build on
top of them, either point to the relevant section in `docs/protocol-spec.md`
and ask for a decision, or explicitly flag the assumption you're making and
why — don't guess quietly.

## MVP scope boundaries

**In scope:** Event Registry, event spec format, resolver network with
multiple observations, basic quorum, dispute mechanism, finalization,
pull-based on-chain Event Bus, AND/OR/NOT + basic temporal composition,
derivatives market with event-based settlement, TS SDK, testnet deployment,
end-to-end demo.

**Explicitly out of scope — do not add complexity for these:** cross-chain
events, ZK oracle proofs, permissionless resolver marketplace, MEV
mechanisms, high-frequency event streams, perpetual derivatives, complex
liquidation systems, production-scale token economics.

## Toolchain / environment notes

- **Foundry** (`forge`, `anvil`, `cast`) is required for `contracts/`,
  `derivatives/`, and `test/`. Installed via `foundryup`; `lib/forge-std` is a
  git submodule (`forge install foundry-rs/forge-std --no-commit`) — it is
  gitignored except for `.gitmodules`, so a fresh clone must re-run that
  install step.
- **pnpm workspaces** (not Turborepo) tie together `resolver/`, `sdk/`,
  `frontend/`. Root `package.json` scripts (`build`, `test`, `test:contracts`,
  `build:contracts`) drive everything.
- `derivatives/*.sol` is NOT under Foundry's `src` (`contracts/`) — it's
  picked up purely because `test/` files import it directly. If you add a new
  top-level derivatives contract that nothing in `test/` imports yet, add at
  least one test import or it won't get compiled by `forge build`.
- The frontend's `next.config.mjs` aliases out `@x402/*` modules — these are
  optional transitive deps of wagmi's Coinbase Smart Wallet connector that
  aren't installed and aren't used (the demo only wires up the `injected`
  connector). Don't remove that alias without checking `next build` still
  passes.

## Commands

```bash
# Contracts
forge build
forge test -vvv

# TS workspaces
pnpm install
pnpm build            # resolver + sdk + frontend
pnpm test             # forge test + all TS tests
pnpm --filter novak-resolver dev
pnpm --filter novak-frontend dev

# Deploy locally
anvil
forge script script/Deploy.s.sol --rpc-url local --broadcast --private-key $DEPLOYER_PRIVATE_KEY
```

See `README.md` for the full setup walkthrough and `.env.example` for every
environment variable consumed across `resolver/`, `frontend/`, and deploy
scripts.
