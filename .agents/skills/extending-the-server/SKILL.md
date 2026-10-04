---
# SPDX-License-Identifier: EUPL-1.2
name: extending-the-server
description: Use when adding an HTTP endpoint, a job kind, an asys CLI subcommand, a config or environment variable, a log line or a telemetry attribute in apps/server.
---

# Extending the server

## Overview

`apps/server` is one bundled ESM CLI, `asys`, with the subcommands `serve`, `signup-link`, `openapi` and `migrate`. It is built on Effect v4.

- **Services** use `Context.Service<Self, Shape>()('asys/Name')` with a `static layer`.
- **Flows** are written with `Effect.gen` or `Effect.fnUntraced`.
- **Database failures** are defects (`Effect.orDie`). Typed errors are few and live in `libs/contract`.
- **The API definition** lives in `libs/contract/src/lib/api.ts`, not in the server. It is the single source of the handlers and of the OpenAPI document.

## Privacy rules (all of them)

- Never put a value into a log message, an error message or a span attribute. Drizzle error messages carry query parameters, so describe errors only through `logging/describe-error.ts` (`_tag`, SQLSTATE and constraint).
- Telemetry is an allowlist in `telemetry/scrub.ts`. A new span or log attribute is added there on purpose, with a spec.
- SQL text holds only bound parameters, because `db.query.text` is exported.
- A successful `/health` writes no log line.

## HTTP endpoint

1. In `libs/contract/src/lib/api.ts`, add an `HttpApiEndpoint.get/post(name, path, { payload, success, error })` to a group, or add a new group to `Api`. Keep it under `/v1` (the group's `.prefix('/v1')`, or `/v1/auth`). The `no-store` header, request tracing, the dev and e2e proxies (`apps/pwa/proxy*.conf.json`) and the service worker's `navigationUrls` all key off `/v1`; `/health` is the only other API path. Put the schemas and errors in `libs/contract/src/lib/*.ts`, with `identifier` annotations, and add specs in `api.spec.ts`.
2. Put the logic in `src/<area>/<name>.ts`: `withOwner(ownerId, ...)`, with `lockCounter` first for writes.
3. Add the handler to `src/http/<group>.ts` with `HttpApiBuilder.group(Api, '<group>', (h) => h.handle(...))`, and read the owner with `yield* CurrentOwner`. Provide a new group in `src/http/app.ts`, with `AuthenticationLive` if it uses the `Authentication` middleware.
4. Spec it through `src/test/http.ts` (`makeHttp`, or `startServer` for a real socket). Cover 401 without a cookie and an empty 500 on a database failure. For a method other than GET, HEAD or OPTIONS, also cover 403 for a foreign, missing or trailing-slash Origin. Safe methods are not Origin-guarded.
5. Wire it into the PWA with `building-pwa-ui`, starting from `pnpm exec nx run pwa:api-client`.

Domain writes are not endpoints. They are Commands (`adding-a-domain-command`).

## Job kind (ADR 0012)

1. Add the kind to an enum (`CoreJobKind` in `jobs/prune.ts`, or a new file).
2. Write `const handler: JobHandler = (job) => ...`. It runs in the owner's transaction, inside a savepoint. Use `job.now`. A failure retries with backoff (up to 8 attempts) and stores only `describeError` in `last_error`.
3. Register it with `registry.register(kind, handler)` in a layer composed in `src/worker-layer.ts`. Registering a kind twice is a defect.
4. Schedule it with `scheduleJob(ownerId, { id, kind, payload, runAt, cron, dedupeKey })` inside `withOwner`, after `lockCounter`. For a per-owner job, also schedule it in `owners/create-owner.ts`, and plan a backfill for existing owners.
5. Add a spec modelled on `jobs/prune.spec.ts`. Claim tests use the 1900 `run_at` band and assert only on their own rows.

## CLI command

1. Write `Command.make('<name>', flags, Effect.fnUntraced(function* (...) {...}))` in `src/cli/commands.ts`, and append it to `Command.withSubcommands([...])`. Validate the flags before touching Config or the database, and provide only the layers it needs.
2. Spec it in `cli/commands.spec.ts` with `ConfigProvider.fromEnvRecord` and `TestConsole`.
3. Document it in the README's "Running the server" list.

## Config variable

Read it with Effect `Config` in `src/config.ts` (`Config.Redacted` for secrets), and prefer `Config.withDefault` for an optional setting. Add it to the README, and to `deploy/compose.yaml` plus the `deploy/.env` table in the README if production needs it.

A variable with no default must also be added in two more places:

- `E2eEnv` and `loadE2eEnv` in `apps/pwa-e2e/src/support/e2e-env.ts`, because the e2e API gets no `.env`;
- the composite action `.github/actions/prepare-stack`, which writes `deploy/.env` for the `migrate-image` and `e2e-image` jobs, and the `deploy/.env` block in the README's "Against the image" recipe, when `deploy/compose.yaml` requires it (`${VAR:?}`). The built CLI does not read `.env`, so locally run it with `node --env-file=.env dist/apps/server/main.js`.

## Verify

```bash
pnpm exec nx test server --skip-nx-cache
```

```bash
pnpm exec nx run-many -t lint typecheck build -p contract server
```

Run `pnpm exec nx run server:openapi` too. Stop `nx serve server` before testing.
