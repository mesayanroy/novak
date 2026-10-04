# Novak Resolver Node

An independent process that turns live Robinhood Chain data into finalized
Novak events. Every poll interval it:

1. **Discovers** events — scans the Registry's `EventCreated` and the
   Composer's `CompositeEventCreated` logs from the deployment's `startBlock`
   (`node/discovery.ts`). No hand-maintained watch list.
2. **Resolves** (`node/resolve.ts`) — for each event whose `sourceId` it has
   an adapter for, once `openTimestamp` has passed: the adapter observes the
   source, the node builds an evidence record, and submits
   `(outcome[, occurredAt])` + the evidence hash to
   `EventRegistry.submitObservation`. Quorum, proposal and the dispute window
   are enforced on-chain.
3. **Votes in disputes** (`node/voter.ts`) — if drawn onto a Tier-1/Tier-2
   committee, it re-observes with the same adapter and votes, posting the tier
   bond. Abstains when its adapter abstains.
4. **Keeps** (`node/keeper.ts`, `RESOLVER_KEEPER=true` on ONE node) — calls
   every permissionless transition as soon as it's valid: `finalize`,
   `expire`, `escalateNonConvergence`, `escalateTier2`,
   `voidAfterTier2Timeout`, `tryResolve` (only when it would change state),
   `Market.settle`, and `withdraw` of its own credited bonds. This is not push
   delivery — consumers still pull from the Bus.
5. **Claims rewards** (`node/rewards.ts`, every node). It claims its
   TreasuryVault share: the resolver third for events it reported correctly,
   and the committee third for disputes where it voted with the decision.
   The keeper also settles DistributionMarkets, allocates vault fees and
   sweeps dispute proceeds into the vault.
6. **Serves** `GET /health` and `GET /evidence/:hash` (`RESOLVER_HTTP_PORT`),
   so anyone can check exactly what a resolver saw behind an on-chain
   evidence hash.

It **writes** to the chain Novak is deployed on (Robinhood Chain testnet
46630, or anvil 31337) and **reads** its data from Robinhood Chain **mainnet**
— Chainlink stock feeds and ERC-8056 stock tokens only exist there. Reads are
free; no mainnet funds are involved.

## Adapters (the event catalog)

| sourceId | Spec (SDK encoder) | Source | Outcome / occurredAt |
|---|---|---|---|
| `chainlink.price-at.v1` (v2) | `encodePriceAtSpec` — feed, threshold, ≥/≤, `at`, `maxStaleness` | Chainlink `Robinhood <TICKER> / USD` on mainnet; binary search for the round in effect at `at` | comparison result / `at`. Abstains if the round is staler than `maxStaleness` |
| `rh.corporate-action.v1` (v2) | `encodeCorporateActionSpec` — stock token, window, `minChangeBps` | the token's ERC-8056 `UIMultiplierUpdated(old, new, effectiveAt)` logs (logs, not state: the public RPC isn't an archive node) | a qualifying change took effect in the window / its `effectiveAt`; false after the window / `windowEnd` |
| `macro.fomc.v1` (v2) | `encodeFedRateSpec` — day D, upper-bound bps, ≥/≤ | FRED `DFEDTARU` public CSV (no key) | comparison on day D / D. Abstains until FRED publishes D |
| `rh.trading-status.v1` (v1) | `encodeTradingStatusSpec` — symbol, session | `api.robinhood.com/rhj/assets` `tradingCapabilities` | session NOT tradable when observed |

Adapters must be **deterministic** (quorum is exact-match on the full
payload): derive `occurredAt` from the source, never the local clock. Return
`null` to abstain — always safe; a wrong vote is not. Add a source by
implementing `SourceAdapter` (`adapters/types.ts`), registering it in
`adapters/index.ts`, and adding its spec encoder to `sdk/src/sources.ts`.

## Running

```bash
pnpm --filter @novak/sdk build && pnpm --filter novak-resolver build
RESOLVER_ID=r1 RESOLVER_PRIVATE_KEY=0x... RESOLVER_KEEPER=true RESOLVER_HTTP_PORT=8787 \
  pnpm --filter novak-resolver start
```

Run three nodes with different keys for a 2-of-3 quorum. Each key must be
authorized (`RESOLVER_ADDRESSES` at deploy time, or
`setResolverAuthorization`) and hold a little testnet ETH for gas — plus the
Tier-1 bond (0.03 ETH) to vote in disputes.

| Env | Default | |
|---|---|---|
| `NOVAK_CHAIN_ID` | `46630` | chain to write to (`31337` = anvil) |
| `RPC_URL_ROBINHOOD_TESTNET` / `RPC_URL_LOCAL` | public endpoints | write RPC |
| `RESOLVER_SOURCE_RPC_URL` | `https://rpc.mainnet.chain.robinhood.com` | read-only data RPC (an Alchemy URL avoids rate limits) |
| `RESOLVER_PRIVATE_KEY` | — | required |
| `RESOLVER_KEEPER` | `false` | enable keeper duties on one node |
| `RESOLVER_VOTER` | `true` | vote in dispute committees |
| `RESOLVER_HTTP_PORT` | off | `/health`, `/evidence/:hash` |
| `RESOLVER_POLL_INTERVAL_MS` | `15000` | |
| `RESOLVER_LOG_CHUNK` | `500000` | log-scan chunk; halves automatically on RPC limits |

Addresses come from `deployments/<chainId>.json` via `@novak/sdk` — no
per-contract env vars.

## Tools

```bash
pnpm --filter novak-resolver probe   # run every adapter against live sources, print what it would vote
pnpm --filter novak-resolver test    # decision logic, evidence determinism, quorum mirrors
```

`consensus/quorum.ts` mirrors the on-chain exact-match quorum and the
DisputeManager's 66%-of-committee rule for local sanity checks; the chain is
the source of truth.
