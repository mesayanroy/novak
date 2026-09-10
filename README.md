# Novak — Neural Event Oracle Network.

[![CI](https://github.com/mesayanroy/novak/actions/workflows/ci.yml/badge.svg)](https://github.com/mesayanroy/novak/actions/workflows/ci.yml)
[![Built with Foundry](https://img.shields.io/badge/built%20with-Foundry-4a4a4a)](https://book.getfoundry.sh/)
[![pnpm workspaces](https://img.shields.io/badge/pnpm-workspaces-f9ad00)](https://pnpm.io/workspaces)

A decentralized, composable event bus for Ethereum. On-chain and real-world
events are resolved, finalized, and stored once, then composed (AND/OR/NOT,
BEFORE/WITHIN) and consumed by many independent smart contracts — instead of
every application building its own oracle integration. The first application
built on top of it is a derivatives market that settles against composite
events.

Built for ETHOnline.

## Contents

- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Status](#status)
- [Setup](#setup)
- [Testing & CI](#testing--ci)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [License](#license)

## Architecture

```
CREATE -> OPEN -> OBSERVATIONS SUBMITTED -> PROPOSED OUTCOME -> DISPUTED
       -> FINALIZED (or VOIDED / EXPIRED) -> AVAILABLE TO CONSUMERS

  resolver network  →  EventRegistry  →  EventComposer  →  EventBus  →  apps
  (off-chain nodes)    + DisputeManager   (AND/OR/NOT,       (pull-only     (Market /
                        (canonical state   BEFORE/WITHIN)     read API)      PositionManager /
                        machine + bonded                                     Settlement)
                        committee ladder)
```

**Hard invariant: applications depend on the Event Bus, never directly on a
resolver, the Registry, the DisputeManager, or the Composer.** This is
enforced by a regression test
(`test/unit/Market.t.sol::test_market_onlyHoldsSettlementReference`); any new
consumer contract should add an equivalent guard. See `docs/architecture.md`
for the full component breakdown, `docs/threat-model.md` /
`docs/protocol-spec.md` for the adversary list and finalized protocol
decisions, and `docs/SPEC_AND_TASKS.md` for the milestone-by-milestone
deliverables checklist.

## Repository layout

```
novak/
├── contracts/            Foundry workspace: EventRegistry, DisputeManager, EventBus,
│                          EventComposer, SubscriptionManager + interfaces/
├── resolver/              Node/TypeScript resolver daemon: adapters, evidence,
│                          consensus (quorum)
├── derivatives/           Market, PositionManager, Settlement — consume events
│                          only through IEventBus
├── sdk/                   @novak/sdk — TypeScript client wrapping contract calls
├── frontend/               Next.js + Tailwind + wagmi/viem/RainbowKit demo site:
│                          landing page, a full /docs hub, /markets + /markets/[id]
├── test/                   unit/ integration/ fuzz/ adversarial/ (Foundry)
├── docs/                   architecture.md, protocol-spec.md, threat-model.md,
│                          SPEC_AND_TASKS.md (deliverables checklist),
│                          FRONTEND_SPEC.md (frontend stack/route map)
├── examples/               end-to-end-flow.ts walking the canonical demo flow
├── script/                 Foundry deployment scripts
└── .github/workflows/      CI pipeline (contracts + TS workspaces)
```

## Status

The backend is MVP-complete and verified end-to-end: event creation,
multi-resolver quorum (with a defined escalation path for a non-converging
quorum), bonded two-tier committee dispute escalation (`DisputeManager`),
finalization, terminal `Voided`/`Expired` states with propagation through
composition, AND/OR/NOT/BEFORE/WITHIN composition with canonicalized
identity, and a settling parimutuel derivatives market are all implemented
and tested — `forge test` → **80/80 passing** across unit/integration/fuzz/
adversarial suites. The full canonical demo runs successfully against a local
Anvil chain — see [End-to-end demo script](#end-to-end-demo-script) below.

The frontend MVP is also built out: a landing page, a nine-page `/docs` hub,
and `/markets` + `/markets/[id]` wired to the real `@novak/sdk` ABIs wherever
a live read/write is possible (mock data is used only where the contracts
have no enumeration getter, and is always visibly badged as mock). See
`docs/FRONTEND_SPEC.md` for the exact route map and live/mock data
breakdown.

**Still open**, tracked in detail in `docs/SPEC_AND_TASKS.md`:

- A real public testnet deployment (needs a funded deployer key/RPC).
- The push/relayer execution layer (zero code — pull-based `EventBus` reads
  are what's implemented).
- Real (non-mocked) resolver data sources and on-chain event discovery.
- `resolver/node/index.ts` daemon wiring for `DisputeManager`'s Tier-1/Tier-2
  escalation events (the on-chain mechanism and off-chain quorum math are
  done; the daemon doesn't yet auto-vote).
- `NovakClient` SDK write methods for the tiered dispute flow.
- On-chain market discovery/indexing (`/markets`' list is structurally mock
  until an indexer exists) and a live API server behind `/docs/api`'s
  REST-style reference.
- Full stake-weighted, VRF-selected dispute arbitration — the bonded
  committee ladder is a real structural improvement over single-owner
  arbitration, not the final design.

## Setup

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`,
  `anvil`, `cast`):
  ```bash
  curl -L https://foundry.paradigm.xyz | bash
  foundryup
  ```
- Node.js 20+ and [pnpm](https://pnpm.io/) 9+ (`corepack enable` will provide
  pnpm on modern Node installs).

### Install

```bash
# One-time: pull in forge-std for contracts/tests
forge install foundry-rs/forge-std --no-commit

# TypeScript workspaces (resolver, sdk, frontend)
pnpm install

cp .env.example .env   # fill in RPC URLs / keys as needed
```

### Contracts

```bash
forge build          # compile contracts/ + derivatives/ + test/
forge test -vvv       # unit + integration + fuzz + adversarial suites
forge fmt             # format
```

Deploy to a local chain:

```bash
anvil                                                     # in one terminal
forge script script/Deploy.s.sol \
  --rpc-url local --broadcast \
  --private-key $DEPLOYER_PRIVATE_KEY                     # in another
```

Copy the printed contract addresses into `.env`, including
`DISPUTE_MANAGER_ADDRESS` (deployed but not exercised by the undisputed demo
path below).

### Resolver

```bash
pnpm --filter novak-resolver dev     # watch mode
pnpm --filter novak-resolver test
```

### SDK

```bash
pnpm --filter @novak/sdk build
pnpm --filter @novak/sdk test
```

### Frontend

```bash
pnpm --filter novak-frontend dev     # http://localhost:3000
```

### Everything at once

```bash
pnpm build     # builds resolver, sdk, frontend (sdk first — resolver depends on it)
pnpm test      # forge test + resolver/sdk TS tests
```

### End-to-end demo script

After deploying contracts locally and populating `.env` with the deployed
addresses (`EVENT_REGISTRY_ADDRESS`, `EVENT_BUS_ADDRESS`,
`EVENT_COMPOSER_ADDRESS`, `SUBSCRIPTION_MANAGER_ADDRESS`,
`SETTLEMENT_ADDRESS`, `POSITION_MANAGER_ADDRESS`, `MARKET_ADDRESS`, plus
`DEPLOYER_PRIVATE_KEY`):

```bash
pnpm example:e2e
```

This runs the full canonical flow live against your local chain: create two
primitive events, authorize resolvers and reach quorum on both, advance past
the dispute window and finalize, compose `WITHIN(48h)`, resolve the
composite, create a market, take two opposing positions, settle, and claim.
The script doesn't exercise `DisputeManager` (the demo stays on the
undisputed path), so `DISPUTE_MANAGER_ADDRESS` isn't required for it.

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
