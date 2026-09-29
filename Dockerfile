# syntax=docker/dockerfile:1.7
#
# TrackMyPocket API — one image, two jobs:
#
#   docker run trackmypocket-api                          the API (processes/api-gateway)
#   docker run trackmypocket-api node-pg-migrate up       the schema migrations
#
# The API runs in "direct" mode, the way `pnpm dev:api` does: repositories call Postgres
# themselves, BullMQ is the queue provider, and there is no Kafka. processes/worker is not
# needed to serve requests. What it adds is draining two BullMQ queues (activity-log,
# scheduled-report) and the cron jobs (exchange rates, activity-log partitions); an
# API-only deployment should set ACTIVITY_LOG_ENABLED=false so jobs do not pile up in
# Redis with nothing consuming them.
#
# pnpm, from pnpm-lock.yaml. package-lock.json is not the source of truth here: CI
# installs with pnpm --frozen-lockfile, and so does this.
#
# Node 20 to match .nvmrc and CI. Bump all three together.

ARG NODE_IMAGE=node:20-alpine

FROM ${NODE_IMAGE} AS base
WORKDIR /app
# The pnpm version comes from package.json's packageManager field.
RUN corepack enable
ENV CI=true

# ── build: full install (dev deps included), then tsc + tsc-alias ─────────────────────
FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY config ./config
COPY processes ./processes
COPY scripts ./scripts
RUN pnpm run build

# ── prod-deps: production dependencies only ────────────────────────────────────────────
# A separate stage so none of the build toolchain (typescript, jest, eslint…) reaches the
# final image. bcrypt ships a musl prebuild, so there is no compiler here either.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# ── runtime ─────────────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PATH=/app/node_modules/.bin:$PATH

COPY --from=prod-deps --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/dist ./dist
COPY package.json .pg-migraterc ./
# node-pg-migrate reads the SQL files from here (dir: 'migrations' in .pg-migraterc).
COPY migrations ./migrations

# Owned by root, run as node: the app cannot rewrite its own code. It writes nothing to
# disk it needs later (logs go to stdout).
USER node
EXPOSE 3000

# Plain node, no npm wrapper: signals reach the process directly, and there is no extra
# ~40 MB npm process sitting beside it. Heap is capped by NODE_OPTIONS from the
# environment (see the compose file), not here, so it can be tuned without a rebuild.
CMD ["node", "dist/processes/api-gateway/index.js"]
