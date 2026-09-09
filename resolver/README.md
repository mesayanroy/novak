# Novak Resolver Node

A resolver is an independent process that:

1. Is told which event IDs to watch (see "Known limitation" below).
2. Uses a **source adapter** (`adapters/`) to fetch the underlying real-world or
   on-chain data and turn it into a boolean `Observation`.
3. Hashes the evidence (`evidence/`) so only a commitment — not raw data — needs
   to go on-chain, and encodes the outcome per the MVP schema
   (`abi.encode(bool)`).
4. Submits the observation directly to `EventRegistry.submitObservation`. The
   Registry itself counts matching submissions from *authorized* resolvers and
   auto-proposes an outcome once `EventSpec.quorumThreshold` of them agree —
   see `consensus/quorum.ts` for the local mirror of that same rule and
   `contracts/EventRegistry.sol` for the on-chain enforcement.
5. The proposed outcome then sits in the dispute window before anyone can call
   `finalize()`.

Resolvers never talk to consumer contracts (like the derivatives `Market`)
directly — consumers only ever read finalized events through the `EventBus`.
See `docs/architecture.md` for the full lifecycle.

## Layout

- `node/` — daemon entrypoint (`index.ts`): for each watched event ID, runs
  every adapter and submits the resulting observation on-chain.
- `adapters/` — one module per event source class (e.g. price feeds). Implement
  `SourceAdapter` (`adapters/types.ts`) to add a new source.
- `evidence/` — hashing/encoding helpers so evidence and outcome data are
  committed deterministically.
- `consensus/` — quorum evaluation logic, mirroring the on-chain rule (exact
  agreement, N-of-M authorized resolvers — see `consensus/quorum.ts`).

## Running

A resolver's address must first be authorized by the Registry owner
(`EventRegistry.setResolverAuthorization(resolverAddress, true)`) before it
can submit anything — `submitObservation` reverts otherwise.

```bash
pnpm install
pnpm --filter novak-resolver dev     # watch mode
pnpm --filter novak-resolver build   # compile to dist/
pnpm --filter novak-resolver test    # vitest
```

Configure via `.env` (see root `.env.example`): `RESOLVER_PRIVATE_KEY`,
`EVENT_REGISTRY_ADDRESS`, `RESOLVER_WATCHED_EVENT_IDS` (comma-separated),
`RESOLVER_POLL_INTERVAL_MS`, an RPC URL, and (for the example price adapter)
`PRICE_FEED_THRESHOLD` / `PRICE_FEED_MOCK_PRICE`.

## Known limitation: no event discovery

There is no on-chain indexer/subgraph here — a resolver is told exactly which
event IDs to watch via `RESOLVER_WATCHED_EVENT_IDS` rather than scanning the
Registry for all `Open` events matching its adapters' `sourceId`s. Building a
real indexer is deferred (it would only change how the watched-event list is
populated, not the submission logic in `node/index.ts`).

## Status

Submission is wired end-to-end: `submitObservation` is a real on-chain write.
What's still a deliberate MVP simplification:

- The `PriceFeedAdapter` reads a mock price from an env var instead of a real
  price API (see the TODO in `adapters/priceFeedAdapter.ts`).
- `consensus/quorum.ts` mirrors the Registry's exact-match rule locally but
  doesn't drive submission timing — the daemon submits unconditionally on
  every poll; the Registry itself is the source of truth on whether quorum
  was reached.
