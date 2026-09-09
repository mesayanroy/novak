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
(component breakdown + diagram), `docs/protocol-spec.md` (data shapes +
finalized protocol decisions), `docs/threat-model.md` (adversary list),
`docs/SPEC_AND_TASKS.md` (milestone-by-milestone deliverables checklist —
the authoritative "what's actually done" tracker).

## The one rule that must never be broken

**Applications depend on the Event Bus, never directly on a resolver, the
Registry, or the Composer.** `derivatives/Market.sol` holds only a
`Settlement` reference, and `derivatives/Settlement.sol` holds only an
`IEventBus` reference. This is enforced by a regression test:
`test/unit/Market.t.sol::test_market_onlyHoldsSettlementReference`. If you add
a new consumer contract, add an equivalent guard test. Same principle applies
on the TS side: the frontend and SDK read event state through
`eventBus`/`settlement`/`market` ABI calls only, never through a resolver's
internals.

## Event lifecycle (the thing everything else hangs off)

```
CREATE -> OPEN -> OBSERVATIONS SUBMITTED -> PROPOSED OUTCOME -> DISPUTE WINDOW
       -> FINALIZED (or VOIDED) -> AVAILABLE TO CONSUMERS
```

- **Registry** (`contracts/EventRegistry.sol`) owns this state machine:
  `createEvent`, `submitObservation` (quorum-gated auto-proposal),
  `dispute`/`resolveDispute` (bonded, owner-arbitrated for the MVP),
  `finalize`. Fully implemented.
- **Resolver network** (`resolver/`) — independent off-chain processes that
  fetch source data (adapters), hash it into evidence, encode a boolean
  outcome, and submit directly to `EventRegistry.submitObservation`.
- **Composer** (`contracts/EventComposer.sol`) — builds composite events from
  primitive event IDs (AND/OR/NOT/BEFORE/WITHIN), deterministically, without
  duplicating Registry state. `tryResolve` caches its result forever once
  computed.
- **Bus** (`contracts/EventBus.sol`) — the only pull-based read surface
  consumers should use. Transparently serves both primitive (Registry) and
  composite (Composer) event outcomes.
- **SubscriptionManager** — stub only, by design. MVP is pull-only; do not
  build push/callback delivery (that's the deferred relayer, Issue #13 in
  `docs/SPEC_AND_TASKS.md`).

## Repo layout

```
contracts/       Foundry workspace: EventRegistry, EventBus, EventComposer,
                  SubscriptionManager + interfaces/ (I*.sol)
derivatives/      Market (parimutuel pools), PositionManager, Settlement —
                  IEventBus consumers only (via Settlement)
resolver/         Node/TS resolver daemon: node/ adapters/ evidence/ consensus/
sdk/              @novak/sdk — TS client wrapping contract calls (viem-based)
frontend/         Next.js + Tailwind + wagmi/viem demo UI
test/             unit/ integration/ fuzz/ adversarial/ (Foundry) — 44 tests, all passing
script/           Deploy.s.sol (Registry -> Composer -> Bus -> Settlement -> Market)
examples/         end-to-end-flow.ts — canonical create->compose->settle demo,
                  verified running against a live local anvil chain
docs/             architecture.md, protocol-spec.md, threat-model.md,
                  SPEC_AND_TASKS.md (living)
```

## Current status: backend is MVP-complete, verified end-to-end

`forge test` → 44/44 passing (unit/integration/fuzz/adversarial). The full
canonical flow (create two events → resolvers reach quorum → dispute window
elapses → finalize → compose WITHIN(48h) → resolve composite → create market
→ two opposing deposits → settle → claim) runs successfully against a live
local anvil chain via `examples/end-to-end-flow.ts` — this was actually
executed and verified, not just written.

**What's still genuinely incomplete** (see `docs/SPEC_AND_TASKS.md` for the
full checklist with reasoning per item):

- **No relayer/push-trigger service** (Issue #13, P1) — zero code exists for
  this. Pull-based consumption (Bus reads) is what's implemented.
- **No real testnet deployment** — `script/Deploy.s.sol` is testnet-ready but
  has only been run against local anvil in this environment (no funded
  testnet key/RPC available). See `docs/SPEC_AND_TASKS.md` Issue #20 for the
  exact command to run once you have one.
- **Resolver adapters are mocked** — `PriceFeedAdapter` reads a price from an
  env var, not a real API. There's also no on-chain event-discovery/indexer;
  a resolver is told which event IDs to watch via
  `RESOLVER_WATCHED_EVENT_IDS`.
- **Dispute arbitration is owner-controlled**, not decentralized — a
  deliberate MVP simplification, not a bug. Don't "fix" this without
  discussing the staking/jury design it would require first.
- **No fees, no market expiry/cancellation path** in the derivatives market.

**Protocol semantics that were open TODOs are now FINALIZED** — event ID
derivation, composite ID derivation (operand-order sensitive, not
canonicalized), outcome payload schema (`abi.encode(bool)`, specVersion 1),
quorum model (N-of-M exact-match, authorized resolvers, no staking), temporal
op timestamp source (`Outcome.finalizedAt` for primitives, resolution-time
for nested composites). See `docs/protocol-spec.md` for the reasoning behind
each. **If you need to change one of these, update both the code and that
doc together** — they're cross-referenced.

## MVP scope boundaries

**In scope (implemented):** Event Registry, event spec format, resolver
network with multiple observations, quorum, dispute mechanism, finalization,
pull-based on-chain Event Bus (primitive + composite), AND/OR/NOT +
BEFORE/WITHIN composition, derivatives market with event-based settlement, TS
SDK, local deployment scripts, end-to-end demo.

**Explicitly out of scope — do not add complexity for these:** cross-chain
events, ZK oracle proofs, permissionless resolver marketplace (staking
tokens), MEV mechanisms, high-frequency event streams, perpetual
derivatives, complex liquidation systems, production-scale token economics,
decentralized dispute arbitration.

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
- `derivatives/*.sol` is NOT under Foundry's `src` (`contracts/`) — it's
  picked up purely because `test/` files import it directly. If you add a new
  top-level derivatives contract that nothing in `test/` imports yet, add at
  least one test import or it won't get compiled by `forge build`.
- The frontend's `next.config.mjs` aliases out `@x402/*` modules — these are
  optional transitive deps of wagmi's Coinbase Smart Wallet connector that
  aren't installed and aren't used (the demo only wires up the `injected`
  connector). Don't remove that alias without checking `next build` still
  passes.
- **`vm.prank` + inline value expressions in Foundry tests**: writing
  `vm.prank(x); registry.dispute{value: registry.DISPUTE_BOND()}(id)` is a
  bug — `registry.DISPUTE_BOND()` is itself an external call that consumes
  the prank before `dispute()` runs. Always hoist the value into a local
  variable first. This bit three tests during the backend completion pass;
  see the git history on `test/unit/EventRegistry.t.sol` /
  `test/adversarial/MaliciousResolver.t.sol` if you need the worked example.

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

# Deploy locally
anvil
forge script script/Deploy.s.sol --rpc-url local --broadcast --private-key $DEPLOYER_PRIVATE_KEY

# Run the full canonical demo against that local deployment
pnpm example:e2e   # needs DEPLOYER_PRIVATE_KEY + the deployed addresses in your env
```

See `README.md` for the full setup walkthrough and `.env.example` for every
environment variable consumed across `resolver/`, `frontend/`, and deploy
scripts.
