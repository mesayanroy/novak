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
resolver.** See `docs/architecture.md` for the full breakdown and
`docs/threat-model.md` / `docs/protocol-spec.md` for the adversary list and
open protocol decisions.

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
├── docs/                architecture.md, protocol-spec.md, threat-model.md
├── examples/             end-to-end-flow.ts walking the canonical demo flow
└── script/               Foundry deployment scripts
```

## Status

This is a scaffold: interfaces and contract shapes are wired up and compile
(once dependencies are installed — see below), but resolver
submission/quorum/dispute logic and composite resolution are intentionally
left as `TODO`s pending protocol-semantic decisions tracked in
`docs/protocol-spec.md`. Do not guess these — resolve them there first.

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
addresses:

```bash
pnpm tsx examples/end-to-end-flow.ts
```

See the script's header comment for exactly which steps are live today vs.
pending resolver/quorum implementation.

## Contributing to the protocol design

Several protocol semantics are intentionally left as `TODO` rather than
guessed at (quorum math, composite/event ID derivation, outcome payload
schema, temporal-op timestamp source). See `docs/protocol-spec.md` for the
full list of open decisions before implementing around them.
