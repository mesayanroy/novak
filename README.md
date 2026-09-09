# Novak (Neural Event Network)

A decentralized, composable event bus for Ethereum. On-chain and real-world
events are resolved, finalized, and stored once, then composed (AND/OR/NOT,
BEFORE/WITHIN) and consumed by many independent smart contracts — instead of
every application building its own oracle integration. The first application
built on top of it is a derivatives market that settles against composite
events.

Built for ETHOnline.

## Architecture

```
CREATE -> OPEN -> OBSERVATIONS SUBMITTED -> PROPOSED OUTCOME -> DISPUTE WINDOW
       -> QUORUM/RESOLUTION -> FINALIZED -> AVAILABLE TO CONSUMERS

  resolver network  →  EventRegistry  →  EventComposer  →  EventBus  →  apps
  (off-chain nodes)    (canonical        (AND/OR/NOT,       (pull-only     (Market /
                        state machine)    BEFORE/WITHIN)     read API)      PositionManager /
                                                                              Settlement)
```

**Hard invariant: applications depend on the Event Bus, never directly on a
resolver.** See `docs/architecture.md` for the full breakdown,
`docs/threat-model.md` / `docs/protocol-spec.md` for the adversary list and
finalized protocol decisions, and `docs/SPEC_AND_TASKS.md` for the
milestone-by-milestone deliverables checklist.

## Repository layout

```
novak/
├── contracts/          Foundry workspace: EventRegistry, EventBus, EventComposer,
│                        SubscriptionManager + interfaces/
├── resolver/            Node/TypeScript resolver daemon: adapters, evidence,
│                        consensus (quorum)
├── derivatives/         Market, PositionManager, Settlement — consume events
│                        only through IEventBus
├── sdk/                 @novak/sdk — TypeScript client wrapping contract calls
├── frontend/            Next.js + Tailwind + wagmi/viem demo UI
├── test/                unit/ integration/ fuzz/ adversarial/ (Foundry)
├── docs/                architecture.md, protocol-spec.md, threat-model.md,
│                        SPEC_AND_TASKS.md (deliverables checklist)
├── examples/             end-to-end-flow.ts walking the canonical demo flow
└── script/               Foundry deployment scripts
```

## Status

The backend is MVP-complete and verified end-to-end: event creation,
multi-resolver quorum, bonded disputes, finalization, AND/OR/NOT/BEFORE/WITHIN
composition, and a settling parimutuel derivatives market are all implemented
and tested (`forge test` → 44/44 passing across unit/integration/fuzz/
adversarial suites). The full canonical demo runs successfully against a
local anvil chain — see "End-to-end demo script" below.

Still open: a real testnet deployment (needs your own funded key/RPC), the
push/relayer execution layer (zero code — pull-based consumption is what's
implemented), and real (non-mocked) resolver data sources. See
`docs/SPEC_AND_TASKS.md` for the full breakdown of what's done vs. deferred,
and `docs/protocol-spec.md` for the finalized protocol-semantic decisions
(event/composite ID derivation, quorum model, outcome payload schema).

## Setup

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`,
  `anvil`, `cast`) — not currently installed in this environment; install with:
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

Copy the printed contract addresses into `.env`.

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
pnpm build     # builds resolver, sdk, frontend
pnpm test      # forge test + all TS workspace tests
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

## Contributing to the protocol design

Protocol semantics that could lock in irreversible on-chain identity/economic
decisions (event/composite ID derivation, quorum model, outcome payload
schema, temporal-op timestamp source) have been finalized for the MVP — see
`docs/protocol-spec.md` for what was decided and why. If you need to change
one of these, update the code and that document together; they're
cross-referenced.
