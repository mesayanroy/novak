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
CREATE -> OPEN -> OBSERVATIONS SUBMITTED -> PROPOSED OUTCOME -> DISPUTED
       -> FINALIZED (or VOIDED / EXPIRED) -> AVAILABLE TO CONSUMERS
```

- **Registry** (`contracts/EventRegistry.sol`) owns this state machine:
  `createEvent`, `submitObservation` (quorum-gated auto-proposal), `finalize`
  (undisputed path), `expire` (nobody ever observed it). It deliberately
  knows nothing about committees or bonds — dispute-side transitions
  (`escalateToDispute`/`finalizeFromDispute`/`voidEvent`) are gated
  `onlyDisputeManager`.
- **DisputeManager** (`contracts/DisputeManager.sol`) — bonded, two-tier
  committee escalation ladder: `dispute`/`escalateNonConvergence` open
  Tier-1 (≤7 resolvers, ≥66% agreement); failing to converge escalates to
  Tier-2 (≤15); failing there marks the event permanently `Voided` (bonds
  refunded) — **never** a token-weighted vote. Fully implemented.
- **Resolver network** (`resolver/`) — independent off-chain processes that
  fetch source data (adapters), hash it into evidence, encode a boolean
  outcome, and submit directly to `EventRegistry.submitObservation`.
- **Composer** (`contracts/EventComposer.sol`) — builds composite events from
  primitive event IDs (AND/OR/NOT/BEFORE/WITHIN), deterministically, without
  duplicating Registry state. Composite identity is canonicalized for every
  order-independent operator (not `BEFORE`); composition depth/fan-in are
  structurally bounded; a `Voided`/`Expired` operand propagates instead of
  stalling a dependent composite forever. `tryResolve` caches its result
  forever once computed.
- **Bus** (`contracts/EventBus.sol`) — the only pull-based read surface
  consumers should use. Transparently serves both primitive (Registry) and
  composite (Composer) event outcomes.
- **SubscriptionManager** — stub only, by design. MVP is pull-only; do not
  build push/callback delivery (that's the deferred relayer, Issue #13 in
  `docs/SPEC_AND_TASKS.md`).

## Repo layout

```
contracts/       Foundry workspace: EventRegistry, DisputeManager, EventBus,
                  EventComposer, SubscriptionManager + interfaces/ (I*.sol)
derivatives/      Market (parimutuel pools), PositionManager, Settlement —
                  IEventBus consumers only (via Settlement)
resolver/         Node/TS resolver daemon: node/ adapters/ evidence/ consensus/
sdk/              @novak/sdk — TS client wrapping contract calls (viem-based)
frontend/         Next.js + Tailwind + wagmi/viem demo UI
test/             unit/ integration/ fuzz/ adversarial/ (Foundry) — 80 tests, all passing
script/           Deploy.s.sol (Registry -> DisputeManager -> Composer -> Bus
                  -> Settlement -> Market)
examples/         end-to-end-flow.ts — canonical create->compose->settle demo,
                  verified running against a live local anvil chain
docs/             architecture.md, protocol-spec.md, threat-model.md,
                  SPEC_AND_TASKS.md (living)
```

## Current status: backend is MVP-complete, verified end-to-end

`forge test` → 80/80 passing (unit/integration/fuzz/adversarial). The full
canonical flow (create two events → resolvers reach quorum → dispute window
elapses → finalize → compose WITHIN(48h) → resolve composite → create market
→ two opposing deposits → settle → claim) runs successfully against a live
local anvil chain via `examples/end-to-end-flow.ts` — this was actually
executed and verified (in a prior pass; the flow itself is unaffected by the
`DisputeManager` addition below, since it never disputes).

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
- **Dispute arbitration is a bonded committee ladder, not full
  decentralization.** This changed: single-owner arbitration
  (`resolveDispute`) is gone, replaced by `DisputeManager`'s two-tier
  committee escalation (see above) — a real structural change, not a
  relabeling, and it never falls back to a token-weighted vote. What's
  still genuinely missing: committee selection is block-data
  pseudo-randomness (not VRF-based), and there's no on-chain
  staking/reputation token behind committee membership (every member posts
  the same flat bond). Don't present this as "solved" — see
  `docs/protocol-spec.md` and `docs/threat-model.md` item 10 for the
  precise residual gap before changing it further.
- **The resolver daemon (`resolver/node/index.ts`) doesn't yet drive
  `DisputeManager`** — the on-chain tiered-escalation mechanism and its pure
  off-chain quorum math (`evaluateEscalationQuorum`) are done, but nothing
  listens for `TierOpened` events and auto-submits committee votes yet.
- **No fees, no market expiry/cancellation path** in the derivatives market.

**Protocol semantics that were open TODOs are now FINALIZED** — event ID
derivation, composite ID derivation (**canonicalized/sorted for every
order-independent operator** — `AND`, `OR`, `NOT`, `WITHIN` — except
`BEFORE`, where operand order is semantic and deliberately preserved),
outcome payload schema (`abi.encode(bool)`, specVersion 1), quorum model
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
network with multiple observations, quorum (incl. the ambiguous-split
escalation path), bonded two-tier committee dispute escalation
(`DisputeManager`), finalization, terminal non-outcomes (`Voided`/`Expired`)
with propagation through composition, structural DAG bounds, pull-based
on-chain Event Bus (primitive + composite), AND/OR/NOT + BEFORE/WITHIN
composition with canonicalized identity, derivatives market with
event-based settlement, TS SDK, local deployment scripts, end-to-end demo.

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

# Deploy locally
anvil
forge script script/Deploy.s.sol --rpc-url local --broadcast --private-key $DEPLOYER_PRIVATE_KEY

# Run the full canonical demo against that local deployment
pnpm example:e2e   # needs DEPLOYER_PRIVATE_KEY + the deployed addresses in your env
```

See `README.md` for the full setup walkthrough and `.env.example` for every
environment variable consumed across `resolver/`, `frontend/`, and deploy
scripts.
