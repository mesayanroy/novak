# Novak Resolver Node

A resolver is an independent process that:

1. Watches for open events on the `EventRegistry` that it knows how to serve
   (matched by `sourceId`).
2. Uses a **source adapter** (`adapters/`) to fetch the underlying real-world or
   on-chain data and turn it into an `Observation`.
3. Hashes the evidence (`evidence/`) so only a commitment — not raw data — needs
   to go on-chain.
4. Participates in **quorum** (`consensus/`) with other resolvers watching the
   same event: if enough resolvers agree, an outcome is proposed on-chain.
5. The proposed outcome then sits in the dispute window before the Registry can
   finalize it.

Resolvers never talk to consumer contracts (like the derivatives `Market`)
directly — consumers only ever read finalized events through the `EventBus`.
See `docs/architecture.md` for the full lifecycle.

## Layout

- `node/` — daemon entrypoint (`index.ts`), polls adapters and drives submission.
- `adapters/` — one module per event source class (e.g. price feeds). Implement
  `SourceAdapter` (`adapters/types.ts`) to add a new source.
- `evidence/` — hashing/encoding helpers so evidence and outcome data are
  committed deterministically.
- `consensus/` — quorum evaluation logic (currently a placeholder — see
  `consensus/quorum.ts` for the exact-agreement TODO).

## Running

```bash
pnpm install
pnpm --filter novak-resolver dev     # watch mode
pnpm --filter novak-resolver build   # compile to dist/
pnpm --filter novak-resolver test    # vitest
```

Configure via `.env` (see root `.env.example`): `RESOLVER_ID`,
`RESOLVER_PRIVATE_KEY`, `RESOLVER_POLL_INTERVAL_MS`, and an RPC URL.

## Status

This is a scaffold. The daemon currently logs the fetch → hash → quorum flow
without submitting to `EventRegistry`, because the on-chain
`submitObservation`/`proposeOutcome`/`finalize` methods are not implemented yet
(see `contracts/EventRegistry.sol` TODOs). Wire up the actual contract write
once that lands.
