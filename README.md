<!-- SPDX-License-Identifier: EUPL-1.2 -->

# ASYS

ASYS (Assisting System) is a personal task manager that answers "what should I do now?". It holds the work that can be done at any time, ranks what fits now, and keeps an Inbox for what needs a decision. It is an installable Angular PWA on an Effect server, with PostgreSQL row-level security keeping each User's data apart. It runs at <https://tasks.saturnserver.org>; sign-up is by invitation link only.

Slice 1 (the Task loop: capture, triage, Now, Areas and Settings, passkey sign-in and deployment) is complete. What comes next is in [`docs/mvp-plan.md`](docs/mvp-plan.md).

## Documentation

- [`CONTEXT.md`](CONTEXT.md): the domain language. Every term the code and the app use (Task, Available from, Due, Picker, Voice, ...) is defined there.
- [`docs/adr/`](docs/adr): the architecture decisions.
- [`docs/mvp-plan.md`](docs/mvp-plan.md): the slices and stages, and what each holds.
- [`docs/scenarios.md`](docs/scenarios.md): the real-life acceptance scenarios, mirrored by `libs/domain/src/scenarios/`.
- [`docs/slice-1-plan.md`](docs/slice-1-plan.md): how slice 1 was built, its decisions and its known limits.
- [`docs/research/`](docs/research): the studies behind some decisions.
- [`AGENTS.md`](AGENTS.md): the conventions for working in this repository, for people and coding agents alike. Task recipes live in [`.agents/skills/`](.agents/skills).

## Workspace

An [Nx](https://nx.dev) workspace with pnpm, in the classic layout with path aliases ([ADR 0010](docs/adr/0010-nx-classic-layout.md)):

| Project                | What it is                                                                   | Licence  |
| ---------------------- | ---------------------------------------------------------------------------- | -------- |
| `libs/domain`          | The domain rules as plain TypeScript: time, Tasks, the Picker, the commands. | MPL-2.0  |
| `libs/contract`        | The API contract in Effect Schema, and the HTTP API definition.              | MPL-2.0  |
| `libs/effect-passkeys` | `@ionaru/effect-passkeys`, WebAuthn sign-up and sign-in for Effect.          | MIT      |
| `libs/design-tokens`   | The design tokens (DTCG), curated palettes and fonts.                        | EUPL-1.2 |
| `apps/server`          | The `asys` CLI: the HTTP API, the job worker and the migrations.             | EUPL-1.2 |
| `apps/pwa`             | The Angular PWA.                                                             | EUPL-1.2 |
| `apps/pwa-e2e`         | Playwright end-to-end tests against the real stack.                          | EUPL-1.2 |

Run any target with `pnpm exec nx <target> <project>`, for example `pnpm exec nx test domain`; `pnpm exec nx show project <project>` lists a project's targets. The root `package.json` has no scripts.

## Development setup

You need Node 24, pnpm 11 and Docker with the Compose plugin.

1. `pnpm install`.
2. Create `.env` in the repository root. The development database and the server read it:

   ```dotenv
   POSTGRES_PASSWORD=<hex>
   ASYS_OWNER_PASSWORD=<hex>
   ASYS_APP_PASSWORD=<hex>
   DATABASE_URL_OWNER=postgresql://asys_owner:<ASYS_OWNER_PASSWORD>@127.0.0.1:5432/asys
   DATABASE_URL_APP=postgresql://asys_app:<ASYS_APP_PASSWORD>@127.0.0.1:5432/asys
   PORT=3000
   ASYS_PUBLIC_ORIGIN=http://localhost:4200
   ASYS_RP_ID=localhost
   ```

   Use hex passwords (`openssl rand -hex 24`): they go into the URLs unescaped.

3. `docker compose up -d --wait` starts PostgreSQL 18 on `127.0.0.1:5432`. On an empty volume, `docker/postgres/init/10-roles.sql` creates the roles `asys_owner` (owns the tables, runs migrations), `asys_app` (what the server uses, under row-level security) and `asys_lookup` (owns the few lookup functions) and the database `asys`.
4. `pnpm exec drizzle-kit migrate --config apps/server/drizzle.config.ts` applies the migrations.

## Running the server

The server is one CLI, `asys`, built into `dist/apps/server/main.js`.

1. The server's own settings in `.env` are:
   - `PORT`, the API's port (3000);
   - `ASYS_PUBLIC_ORIGIN`, the exact origin the browser uses (`http://localhost:4200` in development);
   - `ASYS_RP_ID`, the WebAuthn relying party id: the origin's host or a parent domain of it (`localhost`).
2. `pnpm exec nx serve server` builds the bundle and runs `asys serve`: the HTTP API on `PORT` and the job worker. Nx loads `.env` into the task.
3. The built CLI does not read `.env` by itself, so run it as `node --env-file=.env dist/apps/server/main.js <command>`:
   - `signup-link [--expires-in-days 7]` prints a Sign-up link for a new Owner, valid for 1 to 30 days;
   - `openapi` prints the OpenAPI document, which `pnpm exec nx run server:openapi` writes to `dist/apps/server/openapi.json`;
   - `migrate` applies the migrations in `ASYS_MIGRATIONS_FOLDER` (default `apps/server/drizzle`) as `asys_owner` (`DATABASE_URL_OWNER`), recording them exactly as `drizzle-kit migrate` does, so either can migrate the same database;
   - `serve` runs the server, as `nx serve` does.

Optional settings for `serve`:

- `ASYS_STATIC_ROOT`, an absolute path such as `/app/pwa`, serves the built PWA from that directory on the same origin as the API, with an SPA fallback. Content-hashed bundles and fonts are cached as `immutable`, everything else is `no-cache`, and static responses carry a Content-Security-Policy. Unset, the server serves the API only, as in development.
- `OTEL_EXPORTER_OTLP_ENDPOINT`, the base URL of an OTLP/HTTP collector such as `http://signoz-ingester:4318`, turns on the export of traces and logs (no metrics) over protobuf. `OTEL_SERVICE_NAME` defaults to `asys`, and `OTEL_RESOURCE_ATTRIBUTES` is read as usual. Unset or empty, nothing is exported.

Logs go to stderr and never contain error messages or query parameters. With an OTLP endpoint, each log line is also exported with the same redacted message and only allowlisted attributes, and only `/v1` requests and job runs are traced; an allowlist scrubber drops URLs, query strings, headers, client addresses, error messages and stacks before anything leaves the process. A successful `/health` writes no log line.

### Migrations

The schema is `apps/server/src/db/schema.ts`; migrations live in `apps/server/drizzle/`, one folder each. `pnpm exec drizzle-kit generate --config apps/server/drizzle.config.ts --name <name>` writes a migration from a schema change. drizzle-kit never emits `FORCE ROW LEVEL SECURITY` or grants, so every generated migration is followed by a hand-written one from `drizzle-kit generate --custom --name <name>_force_rls_grants` ([ADR 0007](docs/adr/0007-shared-server-owner-keys-row-level-security.md)); `apps/server/src/db/rls-tables.spec.ts` fails without it. Add the SPDX line to each new `migration.sql`. Migrations only go forward, and each must keep working with the previous release's code.

## Running the PWA

The PWA is the Angular app in `apps/pwa`. Its API client is generated from the server's OpenAPI document by ng-openapi-gen into `apps/pwa/src/generated/api` (gitignored, target `pwa:api-client`), and its token CSS comes from `design-tokens:css`; the build, serve and test targets run both first, and typecheck runs `pwa:api-client`.

1. `pnpm exec nx serve pwa` serves it on `http://localhost:4200` and proxies `/v1` and `/health` to the server on port 3000, passing `Origin` and the session cookie through unchanged. Start it before `nx serve server`: generating the client runs `server:openapi`, which rebuilds the server bundle that a running server uses. With the server already running, use `pnpm exec nx serve pwa --exclude-task-dependencies` (the generated client and the token CSS must exist then).
   Nx loads the root `.env` into every task, and the Angular dev server prefers its `PORT` (the API's port) over its own port option, so `apps/pwa/.env.serve` sets `PORT=4200` for the serve target.
2. Open it at `http://localhost:4200` exactly. On `http://127.0.0.1:4200` the Origin guard answers 403 and passkeys do not match the relying party id `localhost`.
3. The `__Host-` session cookie works over `http://localhost` in Chrome and Firefox, not in Safari.
4. `nx serve` runs no service worker. `pnpm exec nx run pwa:serve-sw` builds for production and serves `dist/apps/pwa/browser` with `scripts/serve-pwa.mts` on port 4200 (it fails if the port is busy), with the same proxy and a fallback to `index.html` for paths without a file extension, so the service worker, the manifest and the update prompt can be tried.
5. `pnpm exec nx test pwa` runs the unit tests (`@angular/build:unit-test`, Vitest and jsdom).

A Sign-up link from `node --env-file=.env dist/apps/server/main.js signup-link` opens the sign-up screen; a passkey needs a browser with an authenticator (Chrome 138 or later on this setup).

## Testing and checks

Each check below is also a CI job (see [CI](#ci)):

| Check                    | Command                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Lint (oxlint)            | `pnpm exec nx run-many -t lint`                                                                                  |
| Typecheck                | `pnpm exec nx run-many -t typecheck` and `pnpm exec tsc -p scripts/tsconfig.json`                                |
| Build                    | `pnpm exec nx run-many -t build` and `pnpm exec nx run server:openapi`                                           |
| Unit tests               | `pnpm exec nx run-many -t test --skip-nx-cache`                                                                  |
| End-to-end tests         | `pnpm exec nx e2e pwa-e2e` (see [End-to-end tests](#end-to-end-tests))                                           |
| End-to-end tests (image) | `pnpm exec nx run pwa-e2e:e2e-image`, with the image stack running (see [Against the image](#against-the-image)) |
| Format (oxfmt)           | `pnpm exec nx format:check --all`, or `pnpm exec nx format:write --all` to fix                                   |
| Licences                 | `node scripts/check-spdx.mts`, `pipx run reuse==6.2.0 lint` and `node scripts/check-licenses.mts`                |
| Palettes                 | `node scripts/palettes.mts --check`                                                                              |

- The server tests run against the development database, which must be up and migrated. They share it, so always pass `--skip-nx-cache`: Nx would otherwise replay a cached result that no longer reflects the database. Stop `nx serve server` before running them, or its job worker claims the tests' due jobs.
- `pnpm exec nx test pwa` runs the PWA's unit tests (`@angular/build:unit-test`, Vitest and jsdom) and needs no database. `nx typecheck pwa` does not check templates; `nx build pwa` and `nx test pwa` do.
- Every file with comment syntax carries an `SPDX-License-Identifier` line in its first five lines: MPL-2.0 in `libs/domain` and `libs/contract`, MIT in `libs/effect-passkeys`, EUPL-1.2 elsewhere. `scripts/check-spdx.mts` enforces it.
- The palette token files in `libs/design-tokens/src/palettes/` are generated: change `PALETTES` in `scripts/palettes.mts` and run `node scripts/palettes.mts` ([ADR 0013](docs/adr/0013-design-tokens-in-dtcg.md)).

## End-to-end tests

`apps/pwa-e2e` runs Playwright in Chromium against the real stack. Each test signs up a new Owner with a WebAuthn virtual authenticator (over the Chrome DevTools Protocol), so passkeys work without a person.

- **Prerequisites.** The database from `compose.yaml` is up (`docker compose up -d --wait`), `.env` holds its passwords and URLs, and Chromium is installed once with `pnpm exec playwright install chromium`.
- **Run.** There are two entry points. `pnpm exec nx e2e pwa-e2e` runs the suite against the dev stack, and its `reset-db` dependency recreates the database first. `pnpm exec nx run pwa-e2e:e2e-image` runs it against the production image, with the image stack from [Against the image](#against-the-image) running. Pass Playwright arguments after `--`, for example `pnpm exec nx e2e pwa-e2e -- src/now.spec.ts`. Both write reports and traces to `dist/.playwright/apps/pwa-e2e`, so each run replaces the other's.
- **An isolated stack.** The API runs on port 3100 and the PWA dev server on 4300 (`pwa:serve:e2e`, with `apps/pwa/.env.serve.e2e` and `apps/pwa/proxy.e2e.conf.json`), against a database `asys_e2e` in the same Postgres container. `reset-db` drops and recreates `asys_e2e`, migrates it, and copies the server bundle to `dist/pwa-e2e/server`, so a rebuild during a run cannot change the API under it. The scripts refuse to run unless both database URLs point at `asys_e2e`.
- **`prebundle` is off** for `pwa:serve:e2e`, so it does not share the Vite prebundle cache with a running `nx serve pwa`.
- **Beside a running dev stack.** `nx e2e pwa-e2e` rebuilds `dist/apps/server` and `apps/pwa/src/generated`, which the dev stack uses. With `nx serve server` and `nx serve pwa` running, build once while they are down (`pnpm exec nx run-many -t build -p server pwa`), then run `pnpm exec nx run pwa-e2e:reset-db --exclude-task-dependencies` and `pnpm exec nx e2e pwa-e2e --exclude-task-dependencies`.

### Against the image

The image target runs the same suite, plus the image-only specs (`apps/pwa-e2e/src/<topic>.image.spec.ts`), against the production image from the root `Dockerfile`: the production Angular build, the static file server, the pruned `node_modules` and the read-only container. It needs no host database and builds nothing, because the stack runs from `deploy/compose.yaml` and `deploy/compose.e2e.yaml` under the compose project `asys-e2e`, with the app published on `http://localhost:3200`. The image config blocks service workers, and the fixture gets each Sign-up link from `docker compose exec ... signup-link` in the image's own container.

Never run this in the deployed checkout, where `deploy/.env` holds the production values.

1. Create the external networks if they are missing: `docker network inspect edge >/dev/null 2>&1 || docker network create edge`, and the same for `telemetry`.
2. If an earlier run left the `asys-e2e` stack behind, remove it first with the step 5 command, while its `deploy/.env` is still in place: its database keeps the passwords it was created with. Then, if `deploy/.env` exists, move it aside and restore it after step 5. Write a new `deploy/.env`:

   ```ini
   POSTGRES_PASSWORD=<openssl rand -hex 32>
   ASYS_OWNER_PASSWORD=<openssl rand -hex 32>
   ASYS_APP_PASSWORD=<openssl rand -hex 32>
   ASYS_PUBLIC_ORIGIN=http://localhost:3200
   ASYS_RP_ID=localhost
   ASYS_OTLP_ENDPOINT=
   ```

3. Build and start the stack. Port 3200 must be free:

   ```bash
   docker build --tag ghcr.io/ionaru/asys:latest .
   docker compose -p asys-e2e -f deploy/compose.yaml -f deploy/compose.e2e.yaml up -d --wait --no-build
   ```

4. Run `pnpm exec nx run pwa-e2e:e2e-image`.
5. Remove the stack: `docker compose -p asys-e2e -f deploy/compose.yaml -f deploy/compose.e2e.yaml down -v`.

## CI

CI is `.github/workflows/cd.yaml`: on every push and pull request an `audit` job (`pnpm audit --prod`, against the lockfile without installing dependencies) runs first, then the jobs `lint`, `typecheck`, `build`, `test`, `e2e`, `format`, `licences` and `palettes` run in parallel, without Nx Cloud. Each job's steps live in `cd.yaml`. The `build` job also writes the server's OpenAPI document (`nx run server:openapi`), which proves that the server bundle loads without a `.env`. Each of these jobs except `audit` starts with the composite action `.github/actions/setup`, which runs `.github/actions/checkout` and then sets up pnpm with Node 24 and installs from the frozen lockfile. The `typecheck` job also typechecks `scripts/` with `tsc -p scripts/tsconfig.json`. Each job's commands can be run locally in the same way; the `test` and `e2e` jobs need the database from `compose.yaml` (`docker compose up -d --wait`) and a `.env` with its passwords, and the `e2e` job installs Chromium with its system dependencies and uploads `dist/.playwright` when it fails.

Six more jobs build, check and ship the image:

- **`revision`** works out the commit SHA and its 12-character short form as outputs, once, so every later job reads the same tag.
- **`build-image`** (after `audit` and `revision`) builds the image with `docker build` from the repository root, saves it as a tar and uploads it as the artefact `asys-image` on every run, pull requests included, kept for 7 days. It uses `.github/actions/checkout` only, with no Node or pnpm. To inspect the image behind a failed run, download `asys-image`, then `docker load -i asys-image.tar` and `docker run --rm -it --entrypoint sh ghcr.io/ionaru/asys:latest`. A pull request's image never reaches GHCR.
- **`migrate-image`** (after `build-image`) loads the image, starts the stack on an empty database with throwaway passwords, then runs `up --wait` again to prove that `migrate` passes on a migrated database.
- **`e2e-image`** (after `build-image`, in parallel with `migrate-image`) sets up like the other checks, loads the image, starts the `asys-e2e` stack, installs Chromium and runs `pnpm exec nx run pwa-e2e:e2e-image`. On failure it prints the stack state and logs and uploads `dist/.playwright` as the artefact `playwright-image`. `migrate-image` and `e2e-image` both write `deploy/.env` and create the `edge` and `telemetry` networks through the composite action `.github/actions/prepare-stack` (input `public-origin`).
- **`push-image`** (pushes to `main` only, after every check, `revision`, `build-image`, `migrate-image` and `e2e-image`) tags the image with the 12-character commit and `latest` and pushes the tar that `build-image` uploaded to `ghcr.io/ionaru/asys`, so the image that passed is the image that ships.
- **`deploy`** (pushes to `main` only, after `revision` and `push-image`, whose outputs give it the revision) logs in to the VPS over SSH, checks out the deployed commit, sets `ASYS_GIT_REVISION` in `deploy/.env`, and runs `docker compose pull` and `up --wait`. It prints `docker compose ps` and the `migrate` logs, and the app's logs only when the deploy fails, because the repository's Actions logs are public.

Runs on `main` queue instead of cancelling each other. `workflow_dispatch` runs the whole pipeline by hand; on `main` that includes `push-image` and `deploy`.

## Deploying

ASYS runs on the VPS as the Compose project `asys` from `deploy/compose.yaml`, behind the Caddy TLS proxy on the external `edge` network, and sends telemetry to SigNoz on the external `telemetry` network. The root `compose.yaml` is the development database only; run every VPS command from `deploy/`.

The stack:

- **`asys-postgres`**, PostgreSQL 18 on an internal `database` network with no published port. On an empty volume, `docker/postgres/init/10-roles.sql` creates the roles and the database. The service name is unique because the app also sits on the shared `edge` and `telemetry` networks.
- **`migrate`**, the app image running `asys migrate` as `asys_owner`, once per `up`. The app starts only after it exits 0.
- **`asys`**, the app image running `asys serve` as `asys_app`, with the built PWA in `/app/pwa`, read-only and without capabilities. Caddy reaches it as `http://asys:3000`.

### `deploy/.env`

Compose reads `deploy/.env` next to the file. Create it with `chmod 600`, and never run `git clean -x` in the checkout, which would delete it.

| Variable                 | Required | Meaning                                                                                                    |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`      | yes      | The PostgreSQL superuser's password.                                                                       |
| `ASYS_OWNER_PASSWORD`    | yes      | `asys_owner`'s password, which owns the tables and runs `migrate`.                                         |
| `ASYS_APP_PASSWORD`      | yes      | `asys_app`'s password, which the server uses under row-level security.                                     |
| `ASYS_PUBLIC_ORIGIN`     | yes      | `https://tasks.saturnserver.org`. Passkeys are bound to it, so it never changes after the first enrolment. |
| `ASYS_RP_ID`             | yes      | `tasks.saturnserver.org`.                                                                                  |
| `ASYS_GIT_REVISION`      | no       | The image tag to run, `latest` by default. The deploy job keeps it on the deployed commit.                 |
| `ASYS_OTLP_ENDPOINT`     | no       | The OTLP collector, `http://signoz-ingester:4318` by default. Set it empty to turn the export off.         |
| `ASYS_ENVIRONMENT`       | no       | `deployment.environment` in SigNoz, `production` by default.                                               |
| `ASYS_TELEMETRY_NETWORK` | no       | The collector's network, `telemetry` by default.                                                           |

Use hex passwords only (`openssl rand -hex 32`): they go into database URLs unescaped. The init script reads the passwords only on an empty volume, so to rotate one later, change it in the database first (`docker compose exec asys-postgres psql -U postgres -c "ALTER ROLE asys_app PASSWORD '<new>'"`), then in `deploy/.env`, then run `docker compose up -d --wait`. Any other change to roles or grants is a migration.

### First deployment

1. Point DNS A and AAAA records for `tasks.saturnserver.org` at the VPS.
2. On the VPS (Docker Engine 25 or newer with the Compose plugin, because the healthcheck uses `start_interval`), add the deploy user to the `docker` group, clone `https://github.com/Ionaru/asys` at the deploy path, write `deploy/.env` (`chmod 600`), and create the networks if they do not exist yet: `docker network create edge` and `docker network create telemetry`.
3. Add the site to Caddy and reload it:

   ```caddyfile
   tasks.saturnserver.org {
   	encode zstd gzip
   	respond /health 404
   	reverse_proxy asys:3000 {
   		header_up -traceparent
   		header_up -tracestate
   		header_up -b3
   		header_up -X-B3-*
   	}
   }
   ```

   `/health` is for the container healthcheck, which reaches the app directly; drop that line if an outside monitor should see it. Removing the trace headers keeps a client from joining or steering ASYS's traces. Keep Caddy's access log off for this site (it is off unless a `log` directive is present). The Android share target puts the shared text in the query string of `/capture`, so an access log would hold it; if you need one, filter it with `format filter`, at least `request>headers>Referer delete` and a filter that removes the query from `request>uri`.

4. In the repository's `production` environment, which the `deploy` job runs in, add the variables `DEPLOY_HOST` (the VPS host name) and `DEPLOY_USER`, and the secrets `DEPLOY_KEY` (a private key whose public half is in the deploy user's `authorized_keys`) and `DEPLOY_PATH` (the checkout).
5. Push to `main`. After the first `push-image`, set the `ghcr.io/ionaru/asys` package to Public (a first GHCR package is private even for a public repository), confirm with an anonymous `docker pull ghcr.io/ionaru/asys:latest`, and run the workflow on `main` again with `workflow_dispatch`, which builds, pushes and deploys.
6. Check the stack with `docker compose ps` in `deploy/`. To check the collector, `docker run --rm --network telemetry curlimages/curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/x-protobuf' --data-binary '' http://signoz-ingester:4318/v1/traces` should print `200`, and SigNoz should list the service `asys` with traces and logs after a few requests.
7. Print the first Sign-up link with `docker compose exec asys node /app/main.js signup-link` and open it on the phone.

### Rolling back

In `deploy/`, run `git checkout <sha>`, set `ASYS_GIT_REVISION` in `.env` to that commit's 12-character tag, and run `docker compose pull && docker compose up -d --wait`. Migrations only go forward, so every migration must keep working with the previous release's code.

## Licence

ASYS is licensed under the [EUPL-1.2](LICENSE). `libs/domain` and `libs/contract` are MPL-2.0, so third-party front-ends can bundle them, and `libs/effect-passkeys` is MIT ([ADR 0011](docs/adr/0011-license-eupl-and-mpl.md)). The licence texts are in [`LICENSES/`](LICENSES); [`REUSE.toml`](REUSE.toml) records which applies where.
