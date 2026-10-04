<!-- SPDX-License-Identifier: EUPL-1.2 -->
# End-to-end tests against the image

This plan makes CI run the Playwright suite against the production image, the same bytes that `push-image` ships.
- It splits the `image` job into one job per concern: a revision job, a build, a migration check and an e2e run.
- It removes `scripts/smoke-image.mts`, and moves the checks that nothing else covers into the e2e suite as an image-only spec.

It was drawn up on 2026-10-05, reviewed adversarially the same day with the confirmed findings folded in, and is one piece, committed on its own.

**What is not covered today.** The suite runs only against the dev stack: the API bundle on port 3100 and `nx serve` on port 4300. The `image` job builds the image, starts it twice and checks it with the smoke script. So no test drives a browser through:
- the production Angular build;
- the static file server and its CSP;
- the pruned production `node_modules`;
- the read-only, `cap_drop: ALL` container.

## Working agreements

These are slice 1's agreements, in short:

- **One piece, one commit,** after review and full verification. Nothing is pushed unless the maintainer asks. A push to `main` deploys.
- **Test-first where there is behaviour to pin.** The image spec in unit 3 is seen to fail once for the right reason before it counts.
- **One builder per checkout.** The dev-stack suite and the image suite both use Chromium and the Docker daemon, so run them one after the other, never side by side.
- **SPDX headers.** Every new file carries `SPDX-License-Identifier: EUPL-1.2` in its comment form: `//` for `.ts` and `.mts`, `#` for `.yaml`. Each unit's check includes `node scripts/check-spdx.mts`.

## Decisions

### 1. The image pipeline is four jobs, one concern each

| Job | Needs | Does |
| --- | --- | --- |
| `revision` | nothing | Works out the commit SHA and its 12-character short form, as job outputs |
| `build-image` | `audit`, `revision` | Builds the image, saves it as a tar and uploads the tar as the artefact `asys-image`, on every run |
| `migrate-image` | `build-image` | Loads the image, migrates an empty database, then starts the stack again to prove `migrate` passes on a migrated database |
| `e2e-image` | `build-image` | Loads the image, starts the stack with the app published, and runs the Playwright suite |

`migrate-image` and `e2e-image` run side by side. `push-image` needs both, and it pushes the tar that `build-image` uploaded, so the image that passed is the image that ships. `push-image` and `deploy` read the tags from `revision`'s outputs.

**`revision` is its own job, as in Deals' `get_sha`.** The tag is decided once, before anything is built, and every later job reads it from the same place.

**`build-image` only builds.**
- It runs `docker build` from the repository root, not `docker compose build`. Compose interpolates the whole file, so a compose build needs a full `deploy/.env`. `deploy/compose.yaml`'s `build:` is only `context: ..`, so `docker build .` builds the same image.
- It needs no Node, no pnpm and no `deploy/.env`. The `pnpm/setup` step it has today existed only for the smoke script.

**`migrate-image` is separate from `e2e-image`.** `e2e-image` migrates an empty database too, because `asys` depends on `migrate`. But a failure there reads as "the e2e job failed". `migrate-image` gives migrations their own red or green, and the second start on a migrated database is checked only there.

**Why not one job that builds and tests (Option A)?**
- The build job would need pnpm dependencies and Chromium.
- A flaky spec could not be re-run without rebuilding the image.

**What this costs.**
- The deploy path gains the tar's upload and download. On `main` it was already uploaded and downloaded for `push-image`.
- The tar, 483 MB per slice 1's verification notes, now goes up on every run, pull requests included, and is downloaded twice.
- A same-repository branch with an open pull request runs the workflow twice per commit, because `push` and `pull_request` use different concurrency groups. So the tar goes up twice. This is accepted here; trimming the `push` trigger is a separate change.

### 2. The image artefact is kept for 7 days, never pushed to the registry

`build-image` saves and uploads `asys-image` on every run, pull requests included. When a check fails, anyone can download the exact image that failed and inspect it:
- `docker load -i asys-image.tar`
- `docker run --rm -it --entrypoint sh ghcr.io/ionaru/asys:latest`

**Retention is 7 days,** the same as the Playwright report, so the image and the traces of a failure expire together. One day is too short to inspect a failure from a Friday.

Only `push-image`, on `main` after every check, puts an image in GHCR. A pull request's image never reaches the registry: fork pull requests cannot get `packages: write`, and untested images would sit next to the deploy tags.

### 3. A second Playwright config and an explicit Nx target

`apps/pwa-e2e/playwright.image.config.mts` spreads the default config and overrides only what differs:
- `baseURL` points at the image;
- it has no `webServer`;
- it blocks service workers;
- it sets the stack option of decision 4;
- it has no `testIgnore`.

The target `pwa-e2e:e2e-image` runs it.

**Why a second file, not an environment switch in `playwright.config.mts`?**
- The default config must stay static, because Nx loads it for the project graph (its own comment, line 3).
- The `@nx/playwright` plugin only infers targets from `**/playwright.config.{js,ts,cjs,cts,mjs,mts}`. The second file therefore gets no inferred `e2e` target that would pull in `reset-db`, so the target is declared by hand with no `dependsOn`.
- The image suite needs no build, no `reset-db` and no host database. The stack is started outside Nx, by CI or by hand.

### 4. The stack is a Playwright fixture option

`fixtures.ts` gains an option fixture `stack`, defaulting to `Stack.Dev`, which the image config sets to `Stack.Image`. `Stack` is an `as const` object, because `apps/pwa-e2e` allows only erasable syntax.

The option decides one thing: how the fixture gets a Sign-up link.
- On the dev stack, nothing changes: the host bundle runs against `asys_e2e`.
- On the image stack, the fixture runs `docker compose exec -T asys node /app/main.js signup-link` against the image's own database, which has no published port. The smoke script did the same (`scripts/smoke-image.mts:143`).

A fixture option is used rather than reading `process.env` in the fixture because the config file then holds the whole difference between the two runs.

### 5. The origin comes from the run, not from a constant

Two places compare against or send `E2E_ORIGIN` (`http://localhost:4300`):
- the Sign-up link check in `fixtures.ts:32`;
- the `Origin` header in `seed.ts:40`.

Both follow the run instead. The link check uses Playwright's `baseURL` fixture. `command()` sends `new URL(page.url()).origin`, which is always the app's origin, because the `page` fixture leaves every test on `/now`. `E2E_ORIGIN` stays in `e2e-env.ts` for the dev API's `ASYS_PUBLIC_ORIGIN`.

### 6. The image listens on `http://localhost:3200`, published on loopback

`deploy/compose.e2e.yaml` publishes `127.0.0.1:3200:3000` for `asys`, and the e2e stack's `deploy/.env` sets:
- `ASYS_PUBLIC_ORIGIN=http://localhost:3200`
- `ASYS_RP_ID=localhost`

**Why port 3200.** It stays clear of the dev ports: 3000 for `nx serve server`, 4200 for `nx serve pwa`, and 3100 and 4300 for the dev-stack suite.

**Why the host must be `localhost`.**
- The app's Origin guard accepts plain `http` only for `localhost` (`apps/server/src/config.ts:18-25`).
- WebAuthn does not allow an IP address as the RP ID.
- A compose host name such as `asys` is not a secure context.

So Playwright runs on the host and reaches the container through the published port, as in Deals. The binding is loopback-only, so a local run exposes nothing to the LAN. If Chromium resolves `localhost` to `::1` and fails to connect, add a second loopback binding, `'[::1]:3200:3000'`. Do not publish on all interfaces. The file is used only for e2e, and production never loads it.

### 7. The e2e stack's compose project is `asys-e2e`

`deploy/compose.yaml` sets `name: asys`. The root `compose.yaml` sets no name, so in a checkout folder called `asys` its project is also `asys`. Under its default name, the deploy stack would therefore share the project with the dev database:
- Compose would warn about the dev `postgres` container as an orphan;
- `up --remove-orphans` would remove it.

A separate project also keeps `ps`, `logs` and `down -v` to the e2e stack alone.

So `e2e-image`, the README recipe and the fixture's `exec` all pass `-p asys-e2e`. The project name and the two compose files are constants in `e2e-env.ts`. `migrate-image` uses the default project, because it never runs beside a dev stack.

### 8. Service workers are blocked, and image-only specs are `*.image.spec.ts`

The image config sets `serviceWorkers: 'block'`. Two reasons:
- Registration in the production build waits for the app to become stable (`registerWhenStable:30000`), so whether a worker is active varies from test to test.
- `two-tabs.spec.ts:18` holds `/v1/changes` back with `page.route`, which misses requests a service worker handles.

Specs that only make sense against the image are named `*.image.spec.ts` and use only the `request` fixture. The default config ignores them, because the dev server serves no `ngsw.json`. The image config runs everything.

### 9. Two smoke checks move to the image spec, and the rest go

| Smoke check | After this piece |
| --- | --- |
| Every `ngsw.json` file served, one chunk immutable | **Moves** to `static-files.image.spec.ts`, and also compares each file's SHA-1 |
| `/` headers (`no-cache`, CSP, `nosniff`) | **Moves** to `static-files.image.spec.ts` as well. `origin-guard.spec.ts:120-131` also covers it over a socket, but against a scratch static root, not the image's `/app/pwa` |
| `/health` 200 | The compose healthcheck and `up --wait` |
| Manifest content type | `apps/server/src/http/static-files.spec.ts:140-143`. The manifest's presence is covered by the first row, because `/manifest.webmanifest` is in the `app` prefetch group (`apps/pwa/ngsw-config.json`) |
| `/v1/meta` 401 | `origin-guard.spec.ts:158-160` |
| `/v1/nope` 404 | `origin-guard.spec.ts:175-177`, `static-files.spec.ts:252` |
| `signup-link` shape | The fixture runs it for every test on the image stack and uses the link |

**Why compare the SHA-1.** That is the check the service worker itself makes when it installs. A file that is missing or changed keeps the worker inactive while the app still works online, so nothing else would notice.

### 10. A composite action prepares the stack

`migrate-image` and `e2e-image` both write `deploy/.env` and create the external networks `edge` and `telemetry`. `.github/actions/prepare-stack/action.yaml` does both, with one input, `public-origin`. A new `${VAR:?}` in `deploy/compose.yaml` is then added in one place. The `extending-the-server` skill (line 56) names the step that does this today, and is updated to name the action.

### 11. The dev-stack `e2e` job stays

The two runs catch different things:
- The dev-stack suite keeps Angular's dev-mode checks and readable traces, and it stays the local default with no Docker build.
- The image suite adds the production build and the container.

Revisit this once the image suite has run for a few weeks. If the dev-stack job never catches anything the image job misses, that is the time to drop it from CI.

## The piece

| Unit | Delivers | Check |
| --- | --- | --- |
| 1. Harness | The stack option, the origin from the run, the image config, the `e2e-image` target, `testIgnore` for image specs, the tsconfig include | `nx typecheck pwa-e2e`, `nx lint pwa-e2e`, and the dev suite still green |
| 2. Compose override | `deploy/compose.e2e.yaml` | `docker compose -p asys-e2e -f deploy/compose.yaml -f deploy/compose.e2e.yaml config` shows the port; the stack starts and `curl http://localhost:3200/health` answers 200 |
| 3. Image spec | `apps/pwa-e2e/src/static-files.image.spec.ts` | Passes against the image, fails against a tampered static root, and is listed only by the image config |
| 4. Full suite on the image | Fixes for any spec that relied on the dev stack | `pnpm exec nx run pwa-e2e:e2e-image` green locally |
| 5. CI | `revision`, `build-image`, `prepare-stack`, `migrate-image`, `e2e-image`; `push-image` and `deploy` rewired | A pull request run with all four jobs green; a deliberately broken run goes red where expected |
| 6. Removal and docs | `scripts/smoke-image.mts` deleted; README, AGENTS.md and skills updated | `tsc -p scripts/tsconfig.json`, `check-spdx`, `format:check` |

### Unit 1: harness

Files:
- `apps/pwa-e2e/src/support/e2e-env.ts`, `fixtures.ts` and `seed.ts`;
- `apps/pwa-e2e/playwright.config.mts`, the new `apps/pwa-e2e/playwright.image.config.mts`;
- `apps/pwa-e2e/project.json` and `apps/pwa-e2e/tsconfig.json`.

**`e2e-env.ts`** gains the following, with only `node:` builtins and nothing read at import, as its header comment requires:
- `E2E_IMAGE_PORT = 3200`
- `E2E_IMAGE_ORIGIN = 'http://localhost:3200'`
- `E2E_IMAGE_PROJECT = 'asys-e2e'`
- `E2E_IMAGE_COMPOSE_FILES = ['deploy/compose.yaml', 'deploy/compose.e2e.yaml']`
- `Stack = { Dev: 'dev', Image: 'image' } as const`
- `export type StackName = (typeof Stack)[keyof typeof Stack];`

**`fixtures.ts`.** `test = base.extend<{ owner: Owner; stack: StackName }>` with `stack: [Stack.Dev, { option: true }]`. The `page` fixture takes `stack` and `baseURL`.
- If `baseURL` is undefined, the fixture throws `the e2e config sets no baseURL`.
- On `Stack.Dev`, the Sign-up link comes from today's code path, unchanged.
- On `Stack.Image`, it comes from `docker compose -p asys-e2e -f deploy/compose.yaml -f deploy/compose.e2e.yaml exec -T asys node /app/main.js signup-link`, run with `cwd` the workspace root and no `loadE2eEnv`, so no root `.env` is needed.
  - The call closes the child's stdin at once: `const pending = run(...); pending.child.stdin?.end();`. Node's `execFile` always opens a stdin pipe, and `compose exec` attaches it.
- In both modes the link must start with `${baseURL}/`, or the fixture throws `signup-link printed no Sign-up link for the e2e origin`, the message it throws today.
- The link is never printed or logged, because it carries a secret token.

**`seed.ts`.** `command()` sends `Origin: new URL(page.url()).origin`. If `page.url()` is not `http:` or `https:` (for example `about:blank`), it throws `seed: the page is not on the app`.

**`playwright.config.mts`** gains `testIgnore: ['**/*.image.spec.ts']`. Nothing else changes.

**`playwright.image.config.mts`:**
- It is `defineConfig<{ stack: StackName }>({ ...base, testIgnore: [], webServer: [], use: { ...base.use, baseURL: E2E_IMAGE_ORIGIN, serviceWorkers: 'block', stack: Stack.Image } })`.
- Without the generic, the `stack` key fails to typecheck (TS2769).
- Its first comment says two things:
  - it needs the stack from `deploy/compose.e2e.yaml` running;
  - `base` is spread into a single `defineConfig` argument on purpose, because the multi-argument form concatenates `webServer` and would keep the dev servers.
- It keeps the preset's `outputDir`. Both targets therefore write to `dist/.playwright/apps/pwa-e2e`, and each run replaces the other's report and traces.

**`project.json`.** The target is `"e2e-image": { "executor": "nx:run-commands", "cache": false, "options": { "command": "playwright test -c apps/pwa-e2e/playwright.image.config.mts", "cwd": "{workspaceRoot}" } }`, with no `dependsOn`. Arguments after `--` reach Playwright, as with `e2e`.

**`tsconfig.json`.** `include` replaces `playwright.config.mts` with `playwright*.config.mts`. Its list is explicit, so `nx typecheck pwa-e2e` would otherwise never compile the image config.

**Unchanged:** `pnpm exec nx e2e pwa-e2e` runs the same specs as today against the same stack, and no image spec runs there.

### Unit 2: compose override

`deploy/compose.e2e.yaml`:

```yaml
# SPDX-License-Identifier: EUPL-1.2
# For the end-to-end tests only: publishes the app on loopback so a browser on the
# host reaches it as http://localhost:3200, a secure context. Never used in production.
# Keep the port in step with E2E_IMAGE_PORT in apps/pwa-e2e/src/support/e2e-env.ts.
services:
  asys:
    ports:
      - '127.0.0.1:3200:3000'
```

Compose appends `ports` across `-f` files, so `deploy/compose.yaml` keeps its "no published port" comment and stays unchanged.

### Unit 3: the image spec

`apps/pwa-e2e/src/static-files.image.spec.ts` uses only the `request` fixture, never `page`, so no Owner is signed up.

**Test 1, "serves every file the service worker installs, unchanged":**
1. `GET /ngsw.json` answers 200, and its `hashTable` has at least one key.
2. For every key in `hashTable`, `GET <key>` answers 200.
3. Each body's SHA-1, as lowercase hex, equals the table's value. Use `node:crypto` `createHash('sha1')` over `await response.body()`.
4. At least one key that starts with `/chunk-` answers `cache-control: public, max-age=31536000, immutable`.

Failures list every failing path with its reason (`/chunk-AB12.js: 404`, `/main-XY.js: hash differs`), so one run shows them all.

**Test 2, "serves the app shell with its security headers":** `GET /` with `accept: text/html` answers 200 with:
- `content-type` starting with `text/html`;
- `cache-control: no-cache`;
- a non-empty `content-security-policy`;
- `x-content-type-options: nosniff`.

**Proving it can fail.** This is a local check, recorded under Verification and not committed:
- Copy `dist/apps/pwa/browser` to a scratch directory.
- Append a comment to one prefetch `.js` file, and delete one `/chunk-*` file.
- Start the stack with a throwaway third compose file that mounts that directory read-only at `/app/pwa`.
- Test 1 fails and names both paths: one for the hash, one for the 404.

For test 2, set the throwaway file's `ASYS_STATIC_ROOT` to a directory with no `index.html`. It fails on the status.

**Listed only by the image config:**
- `node_modules/.bin/nx show project pwa-e2e --json` has no `e2e-ci--src/static-files.image.spec.ts` target.
- `pnpm exec playwright test -c apps/pwa-e2e/playwright.image.config.mts --list` lists the spec.

### Unit 4: the full suite on the image

Run the whole suite with `pnpm exec nx run pwa-e2e:e2e-image` against a locally built image. Each spec that fails gets one of these:
- a fix in the spec, if it relied on the dev server's behaviour;
- a fix in the app, if the production build is wrong. That is a finding, and it is recorded here.

No spec is skipped on the image stack without an entry under Known limits.

**Running it locally.** This becomes the README recipe in unit 6. Never run it in the deployed checkout, where `deploy/.env` holds the production values.
1. `docker network inspect edge >/dev/null 2>&1 || docker network create edge`, and the same for `telemetry`.
2. If `deploy/.env` exists, move it aside and restore it after step 5. Write `deploy/.env` with three random passwords, `ASYS_PUBLIC_ORIGIN=http://localhost:3200`, `ASYS_RP_ID=localhost` and `ASYS_OTLP_ENDPOINT=`.
3. `docker build --tag ghcr.io/ionaru/asys:latest .`, then `docker compose -p asys-e2e -f deploy/compose.yaml -f deploy/compose.e2e.yaml up -d --wait --no-build`
4. `pnpm exec nx run pwa-e2e:e2e-image`
5. `docker compose -p asys-e2e -f deploy/compose.yaml -f deploy/compose.e2e.yaml down -v`

### Unit 5: CI

**`.github/actions/prepare-stack/action.yaml`** is a composite action with one input, `public-origin`.
- Its single `run` step sets `shell: bash`, because the workflow's `defaults.run` does not apply inside a composite action.
- It reads the input through `env: PUBLIC_ORIGIN: ${{ inputs.public-origin }}`, never by interpolating it into the script.
- It writes `deploy/.env` under `umask 077`:
  - three passwords from `openssl rand -hex 32`;
  - `ASYS_PUBLIC_ORIGIN=${PUBLIC_ORIGIN}`;
  - `ASYS_RP_ID=localhost`;
  - `ASYS_OTLP_ENDPOINT=`.
- It then creates the networks `edge` and `telemetry`.
- It writes the relative path `deploy/.env`, so it runs after a checkout, as it does in both jobs.

**The jobs** replace today's `image` job:

```yaml
  revision:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    outputs:
      sha: ${{ steps.revision.outputs.sha }}
      short: ${{ steps.revision.outputs.short }}
    steps:
      - name: Work out the revision
        id: revision
        run: |
          echo "sha=${GITHUB_SHA}" >> "$GITHUB_OUTPUT"
          echo "short=${GITHUB_SHA::12}" >> "$GITHUB_OUTPUT"

  build-image:
    needs: [audit, revision]
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - name: Check out
        uses: $/.github/actions/checkout
      - name: Build the image
        run: docker build --build-arg ASYS_GIT_REVISION="${{ needs.revision.outputs.short }}" --tag ghcr.io/ionaru/asys:latest .
      - name: Save the image
        run: docker save -o asys-image.tar ghcr.io/ionaru/asys:latest
      - name: Upload the image
        # On every run, so the exact image behind a failed check can be downloaded and inspected.
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: asys-image
          path: asys-image.tar
          retention-days: 7
          if-no-files-found: error

  migrate-image:
    needs: build-image
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - name: Check out
        uses: $/.github/actions/checkout
      - name: Prepare the stack
        uses: $/.github/actions/prepare-stack
        with:
          public-origin: http://localhost:3000
      - name: Download the image
        uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
        with:
          name: asys-image
      - name: Load the image
        run: |
          docker load -i asys-image.tar
          rm asys-image.tar
      - name: Migrate an empty database
        # Pull Postgres only; --pull never then fails rather than fetch :latest from GHCR.
        run: |
          docker compose -f deploy/compose.yaml pull asys-postgres
          docker compose -f deploy/compose.yaml up -d --wait --pull never --no-build
      - name: Start again on the migrated database
        # The migrate container runs again and must exit 0; asys must stay healthy.
        run: docker compose -f deploy/compose.yaml up -d --wait --pull never --no-build
      - name: Show the stack state and logs
        if: failure()
        run: |
          docker compose -f deploy/compose.yaml ps -a
          docker compose -f deploy/compose.yaml logs --no-color

  e2e-image:
    needs: build-image
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - name: Set up
        uses: $/.github/actions/setup
      - name: Prepare the stack
        uses: $/.github/actions/prepare-stack
        with:
          public-origin: http://localhost:3200
      - name: Download the image
        uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
        with:
          name: asys-image
      - name: Load the image
        run: |
          docker load -i asys-image.tar
          rm asys-image.tar
      - name: Start the stack from the loaded image
        run: |
          docker compose -p asys-e2e -f deploy/compose.yaml -f deploy/compose.e2e.yaml pull asys-postgres
          docker compose -p asys-e2e -f deploy/compose.yaml -f deploy/compose.e2e.yaml up -d --wait --pull never --no-build
      - name: Install Chromium for Playwright
        run: pnpm exec playwright install --with-deps chromium
      - name: End-to-end tests against the image
        run: pnpm exec nx run pwa-e2e:e2e-image
      - name: Show the stack state and logs
        if: failure()
        run: |
          docker compose -p asys-e2e -f deploy/compose.yaml -f deploy/compose.e2e.yaml ps -a
          docker compose -p asys-e2e -f deploy/compose.yaml -f deploy/compose.e2e.yaml logs --no-color
      - name: Upload the Playwright report and traces
        if: failure()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: playwright-image
          path: dist/.playwright
          include-hidden-files: true
          if-no-files-found: warn
          retention-days: 7
```

**`push-image`.** `needs` becomes `[audit, lint, typecheck, build, test, e2e, format, licences, palettes, revision, build-image, migrate-image, e2e-image]`. Its tag reads `needs.revision.outputs.short`. It still downloads `asys-image`.

**`deploy`.** `needs` becomes `[revision, push-image]`. `ASYS_GIT_REVISION` and `ASYS_GIT_SHA` read `needs.revision.outputs.short` and `.sha`.

**Proving the gates work.** On a throwaway branch with a pull request:
1. A commit that breaks one spec only on the image stack turns `e2e-image` red, while `build-image` and `migrate-image` stay green. Its `asys-image` artefact downloads and loads.
2. A commit that adds a migration which fails on a second run turns `migrate-image` red.
3. Revert both, and the run goes green.

`push-image` cannot be exercised off `main`, so its `needs` list is checked by reading the workflow.

### Unit 6: removal and docs

- **Delete `scripts/smoke-image.mts`.** `scripts/tsconfig.json` includes `*.mts`, so nothing else changes there.
- **`README.md`:**
  - The checks table gains an "End-to-end tests (image)" row.
  - "End-to-end tests" gains an "Against the image" part with the unit 4 recipe, including the warning about `deploy/.env`.
  - Line 122 names both entry points: `nx e2e pwa-e2e` for the dev stack, and `nx run pwa-e2e:e2e-image` with the image stack running. It notes that both write to `dist/.playwright/apps/pwa-e2e`.
  - The CI section replaces the `image` bullet (line 133) with bullets for `revision`, `build-image`, `migrate-image` and `e2e-image`, including the 7-day `asys-image` artefact and how to inspect it. `push-image`'s list gains the new jobs.
  - Line 186 reads "`/health` is for the container healthcheck, which reaches the app directly".
- **`AGENTS.md`:**
  - The CI table gains `e2e (image)`, with its command and preconditions: the stack from the recipe running, and port 3200 free.
  - The Traps line (line 55) names both entry points.
- **`.agents/skills/writing-e2e-specs/SKILL.md`:**
  - The description names `nx run pwa-e2e:e2e-image`.
  - The Overview describes the two stacks and the `stack` option.
  - "Writing a spec", step 1, says image-only specs are `<topic>.image.spec.ts` and use only `request`.
  - Line 38 names both entry points.
  - The "Expecting the service worker" row says neither stack runs one (the image config blocks it).
  - The "Running Playwright directly" row names both targets.
  - The "no need to edit `project.json`" sentence gains "for either target".
- **`.agents/skills/extending-the-server/SKILL.md:56`** names `.github/actions/prepare-stack`.
- **`.agents/skills/planning-a-slice-piece/SKILL.md`:** the full gate lists `pnpm exec nx run pwa-e2e:e2e-image`, with the stack running.
- **`docs/slice-1-plan.md`** stays as written: it is the record of how slice 1 was built.

## Built on 2026-10-05

Built on 2026-10-05 from this plan. Units 1, 2, 3, 5 and 6 were built side by side on disjoint files: unit 3 by a test-writer working from the contract alone, the rest by implementers. A fact-checker settled the GitHub Actions facts. A review workflow (five reviewers, for plan conformance, CI, the harness, the image spec and the docs, then a judge that checked every finding against the code) kept five findings, all small, and they are fixed: the README says "artefact", the local recipe removes a stack left by an earlier run before writing a new `deploy/.env`, `extending-the-server` also names the recipe's `deploy/.env` block, the proof for test 2 is corrected (see Departures), and Risks no longer claims AGENTS.md requires both suites.

Unit 4 found no spec that relied on the dev server. It did find a flake in `two-tabs.spec.ts` that depends on load and that both stacks share.

**Departures from the plan**
- `two-tabs.spec.ts` reads the NotApplicable answer in a `page2.route('**/v1/commands')` handler with `route.fetch()` and `route.fulfill({ response })`. It no longer calls `response.text()` on the `waitForResponse` result. See the unit 4 finding below.
- Test 2 was proved able to fail with `ASYS_STATIC_ROOT` set empty, which turns static serving off. Unit 3 asked for a directory with no `index.html`, but that cannot work: the server checks `<root>/index.html` at startup and fails with `StaticRootInvalid`, so the container never turns healthy and test 2 never gets a status.

**Unit 4 finding: `two-tabs.spec.ts` flaked under load.**
- **What failed.** The first repeated run on the image failed once with `response.text: Protocol error (Network.getResponseBody): No data found for resource with given identifier`, while a review workflow was loading the machine. Over three such runs it failed in 3 of 13 iterations. On a quiet machine it failed in none of 15.
- **The cause is load, not the image.** With every CPU kept busy, the original spec failed in 3 of 10 iterations on the image and in 8 of 10 on the dev stack.
- **What the trace showed.** `page2`'s `POST /v1/commands` answered 200, but its body was never captured. Chromium returns that message when it holds a record of the request but no stored body (`InspectorNetworkAgent::GetResponseBody`).
- **What was not pinned down.** Why the body is missing. Two probes, one adding event listeners and one reading the headers before `text()`, each hid the failure (none of 25 iterations failed), which points to timing.
- **The fix.** `route.fetch()` replays the request through the context's request client with the original headers, the post data and the context's cookies. The Origin guard would answer 403 if `Origin` were lost. Under the same load, the fixed spec failed in none of 10 iterations on the image and none of 10 on the dev stack.

**Verification (2026-10-05)**
- **Harness.**
  - `nx typecheck pwa-e2e` and `nx lint pwa-e2e` pass.
  - `nx show project pwa-e2e --json` has `e2e-image` without `dependsOn`, and has no `e2e-ci--src/static-files.image.spec.ts` target.
  - `playwright test --list` lists the image spec under the image config only.
- **Dev stack.** `nx e2e pwa-e2e` passed 21 tests, with no image spec among them. Before the fix, on a quiet machine, `--repeat-each 3` passed 63 of 63 and `--repeat-each 10` passed 210 of 210.
- **Compose override.**
  - `config` shows the project `asys-e2e` and `127.0.0.1:3200 -> 3000`.
  - The stack came up healthy in 16 s, and `curl http://localhost:3200/health` answered 200.
  - Chromium reached the loopback-only binding through `localhost`, so the `[::1]` fallback was not needed.
- **Image suite.** `nx run pwa-e2e:e2e-image` passed 23 tests in 13 s: the 21 specs and the two image tests.
- **The image spec can fail.**
  - With a copy of `/app/pwa` mounted read-only over the original, after appending a comment to `/main-HGVXHG6N.js` and deleting `/chunk-xNCRo94W.js`, test 1 failed and listed both: `/chunk-xNCRo94W.js: 404` and `/main-HGVXHG6N.js: hash differs`. Test 2 passed.
  - With `ASYS_STATIC_ROOT` empty, test 2 failed on `GET /`: it expected 200 and received 404.
- **The CI jobs, run by hand.**
  - `docker save` wrote a 100 MB tar in 1 s.
  - After `docker image rm`, `docker load` took 4 s, and `up --pull never --no-build` started the loaded image, with the same image ID and revision label.
  - The full suite passed 23 of 23 against it.
  - `migrate-image`'s two starts ran under `-p asys-migrate-check`: `migrate` exited 0 both times and `asys` stayed healthy.
- **Gate.** `nx run-many -t lint typecheck build test --skip-nx-cache` over all seven projects, the scripts' tsc, `nx run server:openapi`, `nx format:check --all`, `check-spdx`, `check-licenses`, `palettes.mts --check` and `pnpm audit --prod` are green. `reuse lint` was not run locally (pipx is not installed); CI's `licences` job runs it.
- **CI.** CI_RESULTS

**Facts checked while building (2026-10-05)**, numbered as in "Facts to check while building":
1. **Confirmed.** After `docker image rm` and `docker load`, `up --pull never --no-build` starts the loaded image, although `asys` has `build:`.
2. **Not confirmed.** No primary source says that a fork pull request's later job can download the run's artefact. Artefacts move within a run on the runner's own token, not on `GITHUB_TOKEN` permissions, so it is expected to work. It stays unverified until a fork pull request runs (see Known limits).
3. **Confirmed.** Chromium reaches the binding on `127.0.0.1` only, through `localhost`.
4. RERUN_RESULT
5. **Settled.** `main` has no branch protection and the repository has no rulesets (`gh api`, 2026-10-05), so no required check names `image`.
6. **Partly.**
   - GitHub's billing docs say standard runners are free in public repositories, but do not say the same of artefact storage. A community discussion says public repositories' artefacts do not count. In private repositories, artefact storage shares the GitHub Packages quota.
   - The tar is 100 MB, not 483 MB: Docker 29's containerd image store saves compressed layers. CI_TAR_SIZE So `compression-level: 0` and `archive: false` (single file, and the artefact takes the file's name) are not worth it yet.
7. **Confirmed.** A `compose exec ... signup-link` with stdin closed takes about 0.66 s.
8. **Locally:** build 26 s (warm cache), save 1 s, load 4 s, start 16 s, suite 13 s. CI_TIMES

**Known limits**
- Whether a fork pull request's `migrate-image` and `e2e-image` can download `asys-image` is unverified (fact 2).
- What drops the XHR body in Chromium under load is not known. The fixed spec no longer depends on it, but any new spec that reads a response body with `response.text()` under load could hit it.
- Both e2e targets write to `dist/.playwright/apps/pwa-e2e`, so each run replaces the other's report and traces (decision 3).

## Out of scope

- **Specs that exercise the service worker.** These would allow it with `test.use({ serviceWorkers: 'allow' })` and test, for example, an offline reload of the app shell, or that `/v1` is never cached. This plan only proves that the worker can install.
- **Running the previous release on the migrated database.** AGENTS.md requires this to work, and `migrate-image` could test it by starting the previous `:latest` from GHCR after migrating. That is a follow-up.
- **Caching BuildKit layers** in CI, and tuning the artefact's compression. Measure the new jobs' times first.
- **Trimming the duplicate `push` and `pull_request` runs.**
- **Dropping the dev-stack `e2e` job** (decision 11).

## Facts checked on 2026-10-05

Installed: `@playwright/test` 1.63.0, `@angular/service-worker` 22.2.1, `actions/upload-artifact` v7.0.1 (`043fb46d…`), `actions/download-artifact` v8.0.1 (`3e5f45b2…`). The `v7` and `v8` tags point at those commits.

- **Playwright.**
  - `serviceWorkers` takes `'allow'` (the default) or `'block'`, is a `use` option, and can be overridden per file with `test.use`.
  - `page.route` does not see requests a service worker handles; `browserContext.route` does.
  - The `request` fixture uses the config's `baseURL`.
  - The CI docs recommend `playwright install --with-deps` and advise against caching browsers.
  - Sources: playwright.dev/docs/service-workers, /docs/api/class-testoptions, /docs/api-testing, /docs/ci.
- **Playwright typing and config merging,** checked against the installed types and source:
  - A custom `use` key needs `defineConfig<{ stack: StackName }>`. Without it, the result is TS2769.
  - `testIgnore: []` and `webServer: []` are valid.
  - The multi-argument `defineConfig` concatenates `webServer` arrays.
  - The `request` client connects dual-stack and falls back from `::1` to `127.0.0.1` (`happyEyeballsOptions` in playwright-core).
- **Nx.**
  - The `@nx/playwright` plugin infers targets only from `**/playwright.config.{js,ts,cjs,cts,mjs,mts}` (`node_modules/@nx/playwright/dist/src/plugins/plugin.js:17`).
  - Its atomised `e2e-ci--<spec>` targets honour `testIgnore`.
- **Angular service worker.**
  - `ngsw.json`'s `hashTable` holds every file of every asset group, prefetch and lazy alike (`@angular/service-worker/fesm2022/config.mjs:113-128`).
  - Each hash is the SHA-1 hex of the file's bytes (`@angular/build/src/utils/service-worker.js:65-67`).
  - A file that is missing, or whose hash still differs after one cache-busting refetch, fails the install. The worker does not activate that version and the app keeps working from the network (angular.dev/ecosystem/service-workers/devops).
- **Compose.** Merged `-f` files append `ports` entries rather than replace them (docs.docker.com/reference/compose-file/merge). `-p` takes precedence over the file's top-level `name:`.
- **Secure contexts.**
  - `localhost`, `127.0.0.0/8` and `::1` are potentially trustworthy (w3c.github.io/webappsec-secure-contexts). So `127.0.0.1` is a secure context too.
  - It is the app's Origin guard that requires the host name `localhost`.
- **GitHub Actions.**
  - A `run` step in a composite action must set `shell`, and the workflow's `defaults.run` does not apply inside it.
  - The minimum `retention-days` is 1.
  - `upload-artifact` v7 still zips by default.
  - Artefacts count toward the storage quota that is shared with GitHub Packages.
- **The session cookie** is always `Secure` (`apps/server/src/http/cookies.ts:20`). That already works on `http://localhost` in today's suite, and the image changes nothing about it.

### Facts to check while building

1. **`up --pull never --no-build` starts the loaded `ghcr.io/ionaru/asys:latest`** even though `asys` also has `build:`. The `deploy` job already relies on this after `pull` (`cd.yaml:309`). Confirm it locally after `docker load`.
2. **A later job in the same run can download the artefact on a pull request from a fork.** If not, `migrate-image` and `e2e-image` are skipped on forks, and the README says so.
3. **Chromium reaches a binding on `127.0.0.1` only, through `localhost`.** If not, use decision 6's `[::1]` fallback.
4. **Re-running a failed `e2e-image` or `migrate-image`** ("Re-run failed jobs") downloads `asys-image` from the original attempt, without rebuilding.
5. **Branch protection.** Whether any required status check names the `image` job, which this piece renames to `build-image`. If one does, update it in the repository settings in the same change.
6. **Whether artefact storage is billed for this public repository,** with 7-day retention, two runs per commit on pull request branches, and a tar of about 483 MB. If it is, consider `compression-level: 0` or `archive: false` for upload speed, and a shorter retention on pull requests.
7. **The image stack's `compose exec`** returns promptly with stdin closed: well under a second of overhead per test.
8. **How long each new job takes** (upload, download, load, start, suite) against its timeout.

## Risks

- **Specs that pass only on the dev server.** Timing on the production build, or behaviour that only dev mode has. Unit 4 finds them before CI does.
- **Two suites to keep green.** A spec author now has two targets. The `writing-e2e-specs` skill says both must pass before a change is done, and AGENTS.md lists both as checks.
