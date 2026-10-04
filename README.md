<!-- SPDX-License-Identifier: EUPL-1.2 -->

# Asys

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ Your new, shiny [Nx workspace](https://nx.dev) is ready ✨.

[Learn more about this workspace setup and its capabilities](https://nx.dev/getting-started/intro#learn-nx?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or run `npx nx graph` to visually explore what was created. Now, let's get you up to speed!

## Run tasks

To run tasks with Nx use:

```sh
npx nx <target> <project-name>
```

For example:

```sh
npx nx build myproject
```

These targets are either [inferred automatically](https://nx.dev/concepts/inferred-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or defined in the `project.json` or `package.json` files.

[More about running tasks in the docs &raquo;](https://nx.dev/features/run-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Add new projects

While you could add new projects to your workspace manually, you might want to leverage [Nx plugins](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) and their [code generation](https://nx.dev/features/generate-code?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) feature.

To install a new plugin you can use the `nx add` command. Here's an example of adding the React plugin:

```sh
npx nx add @nx/react
```

Use the plugin's generator to create new projects. For example, to create a new React app or library:

```sh
# Generate an app
npx nx g @nx/react:app demo

# Generate a library
npx nx g @nx/react:lib some-lib
```

You can use `npx nx list` to get a list of installed plugins. Then, run `npx nx list <plugin-name>` to learn about more specific capabilities of a particular plugin. Alternatively, [install Nx Console](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) to browse plugins and generators in your IDE.

[Learn more about Nx plugins &raquo;](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) | [Browse the plugin registry &raquo;](https://nx.dev/plugin-registry?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Running the server

The server is one CLI, `asys`, built into `dist/apps/server/main.js`.

1. Start the database and migrate it: `docker compose up -d --wait`, then `pnpm exec drizzle-kit migrate --config apps/server/drizzle.config.ts`.
2. Put the server's keys in `.env`, next to the database ones. For development:
   - `PORT=3000`;
   - `ASYS_PUBLIC_ORIGIN=http://localhost:4200`, the exact origin the browser uses;
   - `ASYS_RP_ID=localhost`, the WebAuthn relying party id: the origin's host or a parent domain of it.
3. `pnpm exec nx serve server` builds the bundle and runs `asys serve`: the HTTP API on `PORT` and the job worker. Nx loads `.env` into the task.
4. The built CLI does not read `.env` by itself, so run it as `node --env-file=.env dist/apps/server/main.js <command>`:
   - `signup-link [--expires-in-days 7]` prints a Sign-up link for a new Owner, valid for 1 to 30 days;
   - `openapi` prints the OpenAPI document, which `pnpm exec nx run server:openapi` writes to `dist/apps/server/openapi.json`;
   - `migrate` applies the migrations in `ASYS_MIGRATIONS_FOLDER` (default `apps/server/drizzle`) as `asys_owner` (`DATABASE_URL_OWNER`), recording them exactly as `drizzle-kit migrate` does, so either can migrate the same database;
   - `serve` runs the server, as `nx serve` does.

Optional settings for `serve`:

- `ASYS_STATIC_ROOT`, an absolute path such as `/app/pwa`, serves the built PWA from that directory on the same origin as the API, with an SPA fallback. Content-hashed bundles and fonts are cached as `immutable`, everything else is `no-cache`, and static responses carry a Content-Security-Policy. Unset, the server serves the API only, as in development.
- `OTEL_EXPORTER_OTLP_ENDPOINT`, the base URL of an OTLP/HTTP collector such as `http://signoz-ingester:4318`, turns on the export of traces and logs (no metrics) over protobuf. `OTEL_SERVICE_NAME` defaults to `asys`, and `OTEL_RESOURCE_ATTRIBUTES` is read as usual. Unset or empty, nothing is exported.

Logs go to stderr and never contain error messages or query parameters. With an OTLP endpoint, each log line is also exported with the same redacted message and only allowlisted attributes, and only `/v1` requests and job runs are traced; an allowlist scrubber drops URLs, query strings, headers, client addresses, error messages and stacks before anything leaves the process. A successful `/health` writes no log line. Stop `nx serve server` before running the server tests: they share the dev database, and its worker would claim their due jobs.

## Running the PWA

The PWA is the Angular app in `apps/pwa`. Its API client is generated from the server's OpenAPI document by ng-openapi-gen into `apps/pwa/src/generated/api` (gitignored, target `pwa:api-client`), and its token CSS comes from `design-tokens:css`; the build, serve and test targets run both first, and typecheck runs `pwa:api-client`.

1. `pnpm exec nx serve pwa` serves it on `http://localhost:4200` and proxies `/v1` and `/health` to the server on port 3000, passing `Origin` and the session cookie through unchanged. Start it before `nx serve server`: generating the client runs `server:openapi`, which rebuilds the server bundle that a running server uses. With the server already running, use `pnpm exec nx serve pwa --exclude-task-dependencies` (the generated client and the token CSS must exist then).
   Nx loads the root `.env` into every task, and the Angular dev server prefers its `PORT` (the API's port) over its own port option, so `apps/pwa/.env.serve` sets `PORT=4200` for the serve target.
2. Open it at `http://localhost:4200` exactly. On `http://127.0.0.1:4200` the Origin guard answers 403 and passkeys do not match the relying party id `localhost`.
3. The `__Host-` session cookie works over `http://localhost` in Chrome and Firefox, not in Safari.
4. `nx serve` runs no service worker. `pnpm exec nx run pwa:serve-sw` builds for production and serves `dist/apps/pwa/browser` with `scripts/serve-pwa.mts` on port 4200 (it fails if the port is busy), with the same proxy and a fallback to `index.html` for paths without a file extension, so the service worker, the manifest and the update prompt can be tried.
5. `pnpm exec nx test pwa` runs the unit tests (`@angular/build:unit-test`, Vitest and jsdom).

A Sign-up link from `node --env-file=.env dist/apps/server/main.js signup-link` opens the sign-up screen; a passkey needs a browser with an authenticator (Chrome 138 or later on this setup).

## End-to-end tests

`apps/pwa-e2e` runs Playwright in Chromium against the real stack. Each test signs up a new Owner with a WebAuthn virtual authenticator (over the Chrome DevTools Protocol), so passkeys work without a person.

- **Prerequisites.** The database from `compose.yaml` is up (`docker compose up -d --wait`), `.env` holds its passwords and URLs, and Chromium is installed once with `pnpm exec playwright install chromium`.
- **Run.** `pnpm exec nx e2e pwa-e2e` is the only supported entry point: its `reset-db` dependency recreates the database first. Pass Playwright arguments after `--`, for example `pnpm exec nx e2e pwa-e2e -- src/now.spec.ts`. Reports and traces land in `dist/.playwright/apps/pwa-e2e`.
- **An isolated stack.** The API runs on port 3100 and the PWA dev server on 4300 (`pwa:serve:e2e`, with `apps/pwa/.env.serve.e2e` and `apps/pwa/proxy.e2e.conf.json`), against a database `asys_e2e` in the same Postgres container. `reset-db` drops and recreates `asys_e2e`, migrates it, and copies the server bundle to `dist/pwa-e2e/server`, so a rebuild during a run cannot change the API under it. The scripts refuse to run unless both database URLs point at `asys_e2e`.
- **`prebundle` is off** for `pwa:serve:e2e`, so it does not share the Vite prebundle cache with a running `nx serve pwa`.
- **Beside a running dev stack.** `nx e2e pwa-e2e` rebuilds `dist/apps/server` and `apps/pwa/src/generated`, which the dev stack uses. With `nx serve server` and `nx serve pwa` running, build once while they are down (`pnpm exec nx run-many -t build -p server pwa`), then run `pnpm exec nx run pwa-e2e:reset-db --exclude-task-dependencies` and `pnpm exec nx e2e pwa-e2e --exclude-task-dependencies`.

## CI

CI is `.github/workflows/cd.yaml`: on every push and pull request an `audit` job (`pnpm audit --prod`, against the lockfile without installing dependencies) runs first, then the jobs `lint`, `typecheck`, `build`, `test`, `e2e`, `format`, `licences` and `palettes` run in parallel, without Nx Cloud. Each job's steps live in `cd.yaml`. The `build` job also writes the server's OpenAPI document (`nx run server:openapi`), which proves that the server bundle loads without a `.env`. Each of these jobs except `audit` starts with the composite action `.github/actions/setup`, which runs `.github/actions/checkout` and then sets up pnpm with Node 24 and installs from the frozen lockfile. Each job's commands can be run locally in the same way; the `test` and `e2e` jobs need the database from `compose.yaml` (`docker compose up -d --wait`) and a `.env` with its passwords, and the `e2e` job installs Chromium with its system dependencies and uploads `dist/.playwright` when it fails.

Three more jobs build and ship the image:

- **`image`** runs on every push and pull request, in parallel with the checks. It builds the image from the root `Dockerfile` through `deploy/compose.yaml`, starts the whole stack on an empty database with throwaway passwords, runs `node scripts/smoke-image.mts`, then runs `up --wait` again to prove that `migrate` passes on a migrated database. On a push to `main` it saves the image as a one-day artifact.
- **`push-image`** (pushes to `main` only, after every check and `image`) tags the image with the 12-character commit and `latest` and pushes both to `ghcr.io/ionaru/asys`.
- **`deploy`** (pushes to `main` only) logs in to the VPS over SSH, checks out the deployed commit, sets `ASYS_GIT_REVISION` in `deploy/.env`, and runs `docker compose pull` and `up --wait`. It prints `docker compose ps` and the `migrate` logs, and the app's logs only when the deploy fails, because the repository's Actions logs are public.

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

   `/health` is for the container healthcheck and the smoke script, which reach the app directly; drop that line if an outside monitor should see it. Removing the trace headers keeps a client from joining or steering ASYS's traces. Keep Caddy's access log off for this site (it is off unless a `log` directive is present). The Android share target puts the shared text in the query string of `/capture`, so an access log would hold it; if you need one, filter it with `format filter`, at least `request>headers>Referer delete` and a filter that removes the query from `request>uri`.

4. In the repository's `production` environment, which the `deploy` job runs in, add the variables `DEPLOY_HOST` (the VPS host name) and `DEPLOY_USER`, and the secrets `DEPLOY_KEY` (a private key whose public half is in the deploy user's `authorized_keys`) and `DEPLOY_PATH` (the checkout).
5. Push to `main`. After the first `push-image`, set the `ghcr.io/ionaru/asys` package to Public (a first GHCR package is private even for a public repository), confirm with an anonymous `docker pull ghcr.io/ionaru/asys:latest`, and run the workflow on `main` again with `workflow_dispatch`, which builds, pushes and deploys.
6. Check the stack with `docker compose ps` in `deploy/`. To check the collector, `docker run --rm --network telemetry curlimages/curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/x-protobuf' --data-binary '' http://signoz-ingester:4318/v1/traces` should print `200`, and SigNoz should list the service `asys` with traces and logs after a few requests.
7. Print the first Sign-up link with `docker compose exec asys node /app/main.js signup-link` and open it on the phone.

### Rolling back

In `deploy/`, run `git checkout <sha>`, set `ASYS_GIT_REVISION` in `.env` to that commit's 12-character tag, and run `docker compose pull && docker compose up -d --wait`. Migrations only go forward, so every migration must keep working with the previous release's code.

## Install Nx Console

Nx Console is an editor extension that enriches your developer experience. It lets you run tasks, generate code, and improves code autocompletion in your IDE. It is available for VSCode and IntelliJ.

[Install Nx Console &raquo;](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Useful links

Learn more:

- [Learn more about this workspace setup](https://nx.dev/getting-started/intro#learn-nx?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Releasing Packages with Nx release](https://nx.dev/features/manage-releases?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [What are Nx plugins?](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

And join the Nx community:

- [Discord](https://go.nx.dev/community)
- [Follow us on X](https://twitter.com/nxdevtools) or [LinkedIn](https://www.linkedin.com/company/nrwl)
- [Our Youtube channel](https://www.youtube.com/@nxdevtools)
- [Our blog](https://nx.dev/blog?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
