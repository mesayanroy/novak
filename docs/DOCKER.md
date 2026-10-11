# Running Novak with Docker

Two images, built from the one `Dockerfile` at the repo root:

| Image | Target | What it runs | Port |
|---|---|---|---|
| `novak-resolver` | `resolver` | The resolver network: one process per key; one of them also runs the keeper and the daily market lister. Serves `/health` and `/evidence/:hash`. | 8787 |
| `novak-frontend` | `frontend` | The Next.js app as a standalone server: markets, Dispute Center, explorer, docs. | 3000 |

Contracts are not in the images. They are already deployed (Robinhood Chain
testnet, `deployments/46630.json`), and their ABIs and addresses ship inside
`@novakoracle/sdk`.

## Quick start (both services)

```bash
cp .env.example .env     # then set RESOLVER_KEYS (see below)
docker compose up --build -d
docker compose ps        # both should turn "healthy"
```

| URL | What it is |
|---|---|
| http://localhost:3000 | Web app |
| http://localhost:8787/health | Every resolver node's status |

## One service at a time

```bash
# Resolver network
docker build --target resolver -t novak-resolver .
docker run -d --name novak-resolver --restart unless-stopped \
  -p 8787:8787 -v novak-data:/data \
  -e RESOLVER_KEYS=0xkey1,0xkey2,0xkey3 \
  -e RESOLVER_KEEPER_INDEX=2 \
  -e ALCHEMY_API_KEY=... \
  novak-resolver

# Web app (NEXT_PUBLIC_* are baked in at build time)
docker build --target frontend -t novak-frontend \
  --build-arg NEXT_PUBLIC_RESOLVER_URL=https://resolvers.example.com \
  --build-arg NEXT_PUBLIC_ALCHEMY_API_KEY=... .
docker run -d --name novak-frontend -p 3000:3000 -e ALCHEMY_API_KEY=... novak-frontend
```

## Pre-built images

`.github/workflows/docker.yml` publishes both images to GitHub Container
Registry on every push to `main` and on `v*` tags:

```bash
docker pull ghcr.io/mesayanroy/novak-resolver:latest
docker pull ghcr.io/mesayanroy/novak-frontend:latest
```

## Configuration

### Resolver (runtime environment)

| Variable | Default | Meaning |
|---|---|---|
| `RESOLVER_KEYS` | required | Comma-separated private keys of **authorized** resolvers (r1,r2,r3). Testnet keys only. |
| `RESOLVER_IDS` | `r1,r2,…` | Display names. |
| `RESOLVER_KEEPER_INDEX` | `1` (compose: `2`) | Which key also runs keeper duties and the market lister. |
| `RESOLVER_LISTER` | on for the keeper | `false` to stop the daily market listing. |
| `ALCHEMY_API_KEY` | none | Recommended. Alchemy first, with the public Robinhood RPCs as fallback. |
| `RESOLVER_SOURCE_RPC_URL` | public mainnet RPC | An explicit mainnet (data source) RPC. |
| `RESOLVER_ALERT_WEBHOOK_URL` | none | Slack/Discord webhook for low-balance alerts. |
| `NOVAK_CHAIN_ID` | `46630` | Robinhood Chain testnet. |
| `RESOLVER_EVIDENCE_DIR` | `/data/evidence` | Mount `/data` as a volume so evidence survives restarts. |

### Frontend

**Build args** (baked into the browser bundle):

| Build arg | Meaning |
|---|---|
| `NEXT_PUBLIC_RESOLVER_URL` | Public URL of the resolver service, as the visitor's browser sees it. |
| `NEXT_PUBLIC_ALCHEMY_API_KEY` | Testnet reads. Lock it to your domain in the Alchemy dashboard. |
| `NEXT_PUBLIC_CHAIN_ID` | Defaults to `46630`. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Enables Robinhood Wallet. |

**Runtime environment:**

| Variable | Meaning |
|---|---|
| `ALCHEMY_API_KEY` or `RESOLVER_SOURCE_RPC_URL` | Mainnet RPC for the live-feed API routes. |

## Notes

- **Run exactly one resolver container per set of keys.** Two copies of the
  same key race each other for nonces.
- **Both images run as the unprivileged `node` user.** Each has a
  `HEALTHCHECK`, so orchestrators (Docker, Compose, Kubernetes, Render, Fly,
  ECS) restart unhealthy containers.
- **Image sizes:** about 250 MB (resolver) and 270 MB (frontend), on
  Debian-slim Node 20.
