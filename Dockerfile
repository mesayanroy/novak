# syntax=docker/dockerfile:1.7
#
# Novak — container images for the two long-running services:
#
#   resolver   the resolver network (one process per key, keeper + market lister
#              on one of them, /health and /evidence/:hash on $PORT)
#   frontend   the Next.js app (markets, disputes, explorer, docs) as a
#              self-contained standalone server
#
#   docker build --target resolver -t novak-resolver .
#   docker build --target frontend -t novak-frontend \
#     --build-arg NEXT_PUBLIC_RESOLVER_URL=https://resolvers.example.com .
#
# Or run both with `docker compose up --build` (see docker-compose.yml and
# docs/DOCKER.md). Contracts are not in these images: they are already deployed,
# and their ABIs/addresses ship inside @novakoracle/sdk.

ARG NODE_VERSION=20
ARG PNPM_VERSION=9.0.0

# ---------------------------------------------------------------------------
# base: Node + pnpm (via corepack, pinned to the repo's packageManager)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /repo

# ---------------------------------------------------------------------------
# deps: install the whole workspace once from the lockfile (cached layer —
# only invalidated when a manifest or the lockfile changes)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY sdk/package.json sdk/
COPY resolver/package.json resolver/
COPY frontend/package.json frontend/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# sdk: build @novakoracle/sdk (generated ABIs + deployments are committed)
# ---------------------------------------------------------------------------
FROM deps AS sdk
COPY sdk/ sdk/
RUN pnpm --filter @novakoracle/sdk build

# ---------------------------------------------------------------------------
# resolver-build: compile, then `pnpm deploy` a self-contained production
# folder (its node_modules + the built SDK, nothing else)
# ---------------------------------------------------------------------------
FROM sdk AS resolver-build
COPY resolver/ resolver/
RUN pnpm --filter novak-resolver build \
 && pnpm --filter novak-resolver deploy --prod /out/resolver

# ---------------------------------------------------------------------------
# resolver: runtime image
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS resolver
LABEL org.opencontainers.image.title="novak-resolver" \
      org.opencontainers.image.description="Novak resolver network: observes real sources, reports outcomes, votes in dispute committees, keeps and lists markets" \
      org.opencontainers.image.source="https://github.com/mesayanroy/novak" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
    NOVAK_CHAIN_ID=46630 \
    PORT=8787 \
    RESOLVER_EVIDENCE_DIR=/data/evidence
WORKDIR /app
COPY --from=resolver-build --chown=node:node /out/resolver ./
RUN mkdir -p /data/evidence && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
# Aggregated /health of every resolver process.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# RESOLVER_KEYS (comma-separated keys) is required; see docs/DOCKER.md.
CMD ["node", "dist/node/multi.js"]

# ---------------------------------------------------------------------------
# frontend-build: Next.js standalone build. NEXT_PUBLIC_* values are baked
# into the client bundle at build time, so they are build args.
# ---------------------------------------------------------------------------
FROM sdk AS frontend-build
ARG NEXT_PUBLIC_CHAIN_ID=46630
ARG NEXT_PUBLIC_RESOLVER_URL=""
ARG NEXT_PUBLIC_ALCHEMY_API_KEY=""
ARG NEXT_PUBLIC_RPC_URL=""
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=""
ENV NEXT_OUTPUT=standalone \
    NEXT_PUBLIC_CHAIN_ID=${NEXT_PUBLIC_CHAIN_ID} \
    NEXT_PUBLIC_RESOLVER_URL=${NEXT_PUBLIC_RESOLVER_URL} \
    NEXT_PUBLIC_ALCHEMY_API_KEY=${NEXT_PUBLIC_ALCHEMY_API_KEY} \
    NEXT_PUBLIC_RPC_URL=${NEXT_PUBLIC_RPC_URL} \
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}
COPY frontend/ frontend/
RUN pnpm --filter novak-frontend exec next build \
 && cp -r frontend/.next/static frontend/.next/standalone/frontend/.next/static \
 && cp -r frontend/public frontend/.next/standalone/frontend/public

# ---------------------------------------------------------------------------
# frontend: runtime image (standalone server only — no dev deps, no sources)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS frontend
LABEL org.opencontainers.image.title="novak-frontend" \
      org.opencontainers.image.description="Novak web app: range and yes/no markets, Dispute Center, event explorer, docs" \
      org.opencontainers.image.source="https://github.com/mesayanroy/novak" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=frontend-build --chown=node:node /repo/frontend/.next/standalone ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "frontend/server.js"]
