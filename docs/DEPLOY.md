# Deploying Novak

Three independent pieces. None of them needs a database: every market, event,
observation, dispute vote and payout is an on-chain transaction, so the chain
*is* the record (and its history). The frontend and SDK read it back from
contract state and logs.

| Piece | Where | What it needs |
|---|---|---|
| Contracts | Robinhood Chain testnet (46630) | `bash script/deploy-testnet.sh` (already deployed — see README) |
| Frontend (Next.js + `/api` routes) | Vercel | `NEXT_PUBLIC_CHAIN_ID=46630` (default), `NEXT_PUBLIC_RESOLVER_URL` (the Render service URL — powers /network and the evidence viewer), optional `RESOLVER_SOURCE_RPC_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` |
| Resolver network (the backend) | Render (`render.yaml`) | resolver keys + two RPC URLs |

## Resolvers on Render

`render.yaml` is a Blueprint for one web service, `novak-resolvers`, that runs
every team resolver key in its **own child process** (`resolver/node/multi.ts`):
separate account, nonce, event index, evidence store and crash domain, with
automatic restarts. One node (`RESOLVER_KEEPER_INDEX`, default r2) also runs the
keeper duties: finalize, escalate, tryResolve, settle markets, vault
allocate/sweep.

1. Push the repo, then in Render: **New → Blueprint** → pick the repo.
2. When asked for the secret env vars:
   - `RESOLVER_KEYS` — `r1Key,r2Key,r3Key` (comma-separated, `0x` optional, in that order).
   - `RESOLVER_SOURCE_RPC_URL` — an Alchemy Robinhood Chain **mainnet** URL
     (recommended; the public endpoint is rate-limited). Leave empty to use the public one.
3. Deploy. Build: `pnpm install --filter novak-resolver...` → SDK build →
   resolver build. Start: `node resolver/dist/node/multi.js`.
4. Check `https://<service>.onrender.com/health` — one entry per node with
   `authorized: true`, a recent `lastLoopAt` and a rising `scannedToBlock`.

Endpoints: `/health` (all nodes), `/r1/health` etc. (one node), and
`/evidence/<hash>` (the JSON behind an on-chain `evidenceHash`). Put the
service URL in Vercel as `NEXT_PUBLIC_RESOLVER_URL` so /network shows live node
status and every observation's evidence opens in the event explorer.

**Evidence survives restarts.** `RESOLVER_EVIDENCE_DIR` writes each record to
disk; on boot every node also re-derives any missing evidence from the source
and keeps it only if its hash matches the one committed on-chain. Each node
also withdraws its own returned dispute bonds automatically.

**Plan.** `starter` keeps the service awake. Render's free plan sleeps after
15 minutes without HTTP traffic, which stops resolution and the keeper; only
use it with an uptime monitor hitting `/health` every ~5 minutes.

**Funding.** Each resolver key needs testnet ETH for gas and committee bonds
(faucet: faucet.testnet.chain.robinhood.com). With the testnet bond unit of
0.0005 ETH, a full Tier-1 dispute costs a voter 0.0015 ETH, so 0.01 ETH per key
is enough for several disputes.

**Independent operators** run a single node instead:
`RESOLVER_PRIVATE_KEY=… RESOLVER_HTTP_PORT=8787 pnpm --filter novak-resolver start`
(after `pnpm --filter @novakoracle/sdk build && pnpm --filter novak-resolver build`).
The Registry owner must authorize their address first.

## Why the resolvers are not on Vercel

Resolvers are long-running daemons: a 15-second loop that keeps an event index
in memory, scans logs, signs transactions with a private key and holds
evidence. Vercel runs request-scoped serverless functions (time-limited, no
background process, cold starts), so it fits the frontend and its `/api`
routes but not the resolver network. Render (or any always-on host) runs it as
a normal process.

## Frontend on Vercel

Root directory `frontend`; the build script compiles the SDK first. After a
contract redeploy, commit the regenerated `sdk/src/deployments.ts` (and
`deployments/46630.json`) and redeploy so the site points at the new addresses.

## After a contract redeploy

```bash
bash script/deploy-testnet.sh                       # deploy, verify, export, regenerate SDK
NOVAK_CHAIN_ID=46630 SEED_OPEN_DELAY_SECONDS=172800 \
  pnpm tsx examples/seed-demo.ts                    # fresh demo markets (T = +48h)
```

`DEPLOYER_PRIVATE_KEY` must be in the environment for the seed script; the
deploy script reads `.env` itself.
