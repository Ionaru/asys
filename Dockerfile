# SPDX-License-Identifier: EUPL-1.2
ARG NODE_IMAGE=node:24.21.0-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe

FROM ${NODE_IMAGE} AS base
WORKDIR /src
COPY package.json ./
# The pnpm version comes from package.json so the image and the repo cannot drift.
RUN npm install --global "$(node -p "require('./package.json').packageManager")"

FROM base AS build
# Nx needs no daemon, cloud or terminal UI inside a build.
ENV NX_DAEMON=false NX_NO_CLOUD=true NX_TUI=false
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --config.store-dir=/pnpm/store
COPY . .
# The server build also writes the pruned package.json, pnpm-lock.yaml and
# pnpm-workspace.yaml next to main.js (generatePackageJson). The separate
# server:prune-lockfile target is not used: it fails on this layout because
# apps/server has no package.json.
RUN pnpm exec nx build pwa && pnpm exec nx build server

FROM base AS deps
WORKDIR /app
COPY --from=build /src/dist/apps/server/package.json /src/dist/apps/server/pnpm-lock.yaml /src/dist/apps/server/pnpm-workspace.yaml ./
# Hoisted, production-only node_modules: no pnpm and no symlink store at runtime.
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --config.node-linker=hoisted --config.store-dir=/pnpm/store

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /src/dist/apps/server/main.js /src/dist/apps/server/package.json ./
COPY --from=build /src/dist/apps/pwa/browser ./pwa
COPY --from=build /src/apps/server/drizzle ./drizzle
ENV ASYS_STATIC_ROOT=/app/pwa ASYS_MIGRATIONS_FOLDER=/app/drizzle PORT=3000
# Links the image to its repository at publish time, so the GHCR package takes the
# repository's access permissions. Its visibility is still set to Public once by
# hand (README, "First deployment").
LABEL org.opencontainers.image.source=https://github.com/Ionaru/asys
# After every COPY, so a new revision does not bust the copy layers. The label is
# the standard provenance slot; the variable shows the revision inside the container.
ARG ASYS_GIT_REVISION
LABEL org.opencontainers.image.revision=${ASYS_GIT_REVISION}
ENV ASYS_GIT_REVISION=${ASYS_GIT_REVISION}
USER node
EXPOSE 3000
ENTRYPOINT ["node", "/app/main.js"]
CMD ["serve"]
