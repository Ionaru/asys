<!-- SPDX-License-Identifier: EUPL-1.2 -->

# AGENTS.md

ASYS (Assisting System) is a personal task manager that answers "what should I do now?". It is an installable Angular PWA on an Effect v4 server, with PostgreSQL row-level security keeping each User's data apart. It runs at https://tasks.saturnserver.org. Slice 1 (the Task loop, sign-in and deployment) is complete. Slice 2 comes next, per `docs/mvp-plan.md`.

## Read first

- `CONTEXT.md` is the domain language. Use its terms exactly and capitalised (Task, Estimate, Available from, Due, Picker, Now, Inbox, Review item, Area, Voice) in code, tests, UI copy and docs. Never use the words on its _Avoid_ lines, such as "to-do", "event", "deadline" or "project".
- `docs/adr/` holds the decisions that bind the code. Read the ADR before changing what it governs.
- `docs/mvp-plan.md` says what each slice and stage holds. `docs/scenarios.md` holds the acceptance examples, mirrored one-to-one by `libs/domain/src/scenarios/s<N>.spec.ts`.
- `docs/slice-1-plan.md` records how slice 1 was built: its decisions, known limits and dated "Facts checked" notes. Counts and versions in it are historical, so check the code.
- `README.md` covers running the stack, the end-to-end tests, CI and the deploy runbook.

## Projects

| Project         | Path                   | Tag              | Licence  | Holds                                                                    |
| --------------- | ---------------------- | ---------------- | -------- | ------------------------------------------------------------------------ |
| domain          | `libs/domain`          | `scope:domain`   | MPL-2.0  | Pure rules: time, Tasks, the Picker, commands. No I/O.                   |
| contract        | `libs/contract`        | `scope:contract` | MPL-2.0  | The Effect Schema wire contract and the `HttpApi` definition.            |
| effect-passkeys | `libs/effect-passkeys` | `scope:passkeys` | MIT      | `@ionaru/effect-passkeys`, WebAuthn ceremonies for Effect (unpublished). |
| design-tokens   | `libs/design-tokens`   | `scope:design`   | EUPL-1.2 | DTCG tokens, curated palettes, fonts.                                    |
| server          | `apps/server`          | `scope:server`   | EUPL-1.2 | The `asys` CLI: HTTP API, job worker, `migrate`, `signup-link`.          |
| pwa             | `apps/pwa`             | `scope:pwa`      | EUPL-1.2 | The Angular 22 zoneless PWA.                                             |
| pwa-e2e         | `apps/pwa-e2e`         | `scope:e2e`      | EUPL-1.2 | Playwright tests against the real stack.                                 |

`scripts/*.mts` are Node scripts (checks, palettes, a static server for the service worker). They are not an Nx project.

## Commands

Use Node 24 and pnpm 11. `package.json` has no scripts, so everything runs through `pnpm exec nx` or `node scripts/<name>.mts`.

- **Database:** `docker compose up -d --wait`, then `pnpm exec drizzle-kit migrate --config apps/server/drizzle.config.ts`. The root `.env` holds the passwords and `DATABASE_URL_OWNER` / `DATABASE_URL_APP` (see `README.md`).
- **Dev stack:** start `pnpm exec nx serve pwa` before `pnpm exec nx serve server`, because generating the PWA's API client rebuilds the server bundle. Open `http://localhost:4200` exactly. On `127.0.0.1`, the Origin guard answers 403 and passkeys fail.
- **One project:** `pnpm exec nx <target> <project>`, for example `pnpm exec nx test domain` or `pnpm exec nx typecheck pwa`. **One spec:** `pnpm exec nx test domain -- src/lib/picker/picker.spec.ts`.
- **JSON from Nx:** `pnpm exec` prints "Already up to date" first, so for JSON run `node_modules/.bin/nx show project <name> --json`.

CI (`.github/workflows/cd.yaml`) runs each check below as its own job. Run the ones your change touches before you call it done:

| Check       | Command                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| lint        | `pnpm exec nx run-many -t lint`                                                                                          |
| typecheck   | `pnpm exec nx run-many -t typecheck`, then `pnpm exec tsc -p scripts/tsconfig.json`                                      |
| build       | `pnpm exec nx run-many -t build`, then `pnpm exec nx run server:openapi`                                                 |
| test        | `pnpm exec nx run-many -t test --skip-nx-cache` (database up and migrated)                                               |
| e2e         | `pnpm exec nx e2e pwa-e2e` (database up, Chromium installed, ports 3100 and 4300 free)                                   |
| e2e (image) | `pnpm exec nx run pwa-e2e:e2e-image` (the stack from the `README.md` recipe running, Chromium installed, port 3200 free) |
| format      | `pnpm exec nx format:check --all`; fix with `pnpm exec nx format:write --all`                                            |
| licences    | `node scripts/check-spdx.mts`, `pipx run reuse==6.2.0 lint`, `node scripts/check-licenses.mts`                           |
| palettes    | `node scripts/palettes.mts --check`                                                                                      |

Traps when testing:

- The server tests share the dev database `asys`, and Nx caches tests on file hashes alone. Always pass `--skip-nx-cache` to database tests, and stop `nx serve server` first, or its job worker claims the tests' due jobs.
- `pwa:typecheck` runs plain `tsc` and does not check templates. `nx build pwa` and `nx test pwa` do.
- `nx e2e pwa-e2e` (dev stack) and `nx run pwa-e2e:e2e-image` (image stack, started by hand from the `README.md` recipe) are the only supported e2e entry points. `e2e` recreates the `asys_e2e` database and rebuilds the files a running dev stack uses. To run it beside a dev stack, follow `README.md`. Both write to `dist/.playwright/apps/pwa-e2e`.
- Only one process builds or tests in a checkout at a time.

## Enforced rules

These fail lint, a test or a CI check when broken.

- **Module boundaries** (`.oxlintrc.json` and each project's `.oxlintrc.json`):
  - domain may depend only on domain, and lint bans `effect`, Drizzle and Angular there. Its lib tsconfig has no DOM or Node types, so non-spec code that uses them fails `typecheck`. By convention it imports nothing from npm but `temporal-polyfill`; the ban list is a blocklist, so a new package must be added to it.
  - contract may add `effect` and `@ionaru/effect-passkeys/api`. Never Drizzle, `@effect/sql-pg`, Node platform packages or Angular.
  - The PWA never imports `@asys/contract`, `effect` or `@ionaru/effect-passkeys/api` at runtime (type-only imports are fine). `@ionaru/effect-passkeys/server` and `/testing` are banned outright, and `/client` is the one passkeys entry it may use. It reaches the generated client (`apps/pwa/src/generated`) only from `app/core/api`.
  - Two `no-restricted-imports` overrides in the root `.oxlintrc.json` cover `apps/pwa/**` and `apps/pwa/src/app/core/api/**`. They share their passkeys and contract patterns but differ on the generated client. Because oxlint override options replace rather than merge, change a shared pattern in both, and keep each block's own generated-client pattern.
- **Row-level security** (`apps/server/src/db/rls-tables.spec.ts`): every table has `owner_id`, `ENABLE` and `FORCE ROW LEVEL SECURITY`, and the one policy from `ownerPolicy()`. The server connects as `asys_app`. Lookups before an owner is known go only through `SECURITY DEFINER` functions owned by `asys_lookup` (ADR 0007). Use the `adding-an-owned-table` skill.
- **Contract lockstep** (`libs/contract/src/lib/*.test-d.ts`): a schema's `Type` equals the plain domain type. PWA screens are kept in line by `apps/pwa/src/app/core/api/wire.ts` (`SHAPES`) and exhaustive `switch`es.
- **Licences** (`scripts/check-spdx.mts`, `reuse lint`, `scripts/check-licenses.mts`):
  - Every file that has comment syntax carries an `SPDX-License-Identifier` line in its first five lines. The ID is MPL-2.0 under `libs/domain/` and `libs/contract/`, MIT under `libs/effect-passkeys/`, and EUPL-1.2 everywhere else.
  - The forms are `// ...` (TS), `/* ... */` (CSS), `<!-- ... -->` (Markdown, HTML), `# ...` (YAML) and `-- ...` (SQL). A `SKILL.md` carries it as a YAML comment on line 2, inside the frontmatter, because the frontmatter must start on line 1.
  - JSON is exempt. A generated Drizzle `migration.sql` needs the header added by hand.
  - Production dependencies must be MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC or 0BSD (ADR 0011).
- **Generated files**, never edited by hand:
  - `apps/pwa/src/generated/` (`pnpm exec nx run pwa:api-client`)
  - `libs/design-tokens/src/palettes/*.tokens.json` and `asys.resolver.json` (`node scripts/palettes.mts`)
  - Drizzle `snapshot.json` files
  - `dist/`
- **Style:** const arrow functions, never `function` declarations (oxlint `func-style`). oxfmt formats with single quotes, except `CONTEXT.md`, `docs/` and `apps/server/drizzle/`, which it ignores.

## Conventions

- **TypeScript:**
  - Use `enum`s with string values for closed sets, `_tag` discriminators included, not string-literal unions. `scripts/` and `apps/pwa-e2e` allow only erasable syntax, so they use `as const` objects.
  - Leave a blank line between top-level declarations, because oxfmt keeps blank lines but never adds them.
  - File names are kebab-case. Specs sit next to the source as `*.spec.ts`, and type tests are `*.test-d.ts`.
- **Domain:**
  - `now`, the time zone and Settings are passed in. No clock, randomness or `Intl` inside `libs/domain`.
  - `Temporal` lives only in `time/zoned.ts` and `time/display.ts`.
  - Strings compare by UTF-16 code unit, never `localeCompare`.
  - A rule change bumps `RULES_VERSION` and `libs/domain/CHANGELOG.md` (ADR 0003). Use `changing-a-domain-rule`.
- **Server:**
  - Per-owner work runs in `withOwner(ownerId, ...)`. A write transaction for an existing owner calls `lockCounter` as its first statement. Sign-up and Sign-up link issuance are the exceptions, because the counter row does not exist yet.
  - Database failures are defects (`Effect.orDie`). Typed errors are few and live in the contract.
  - Nothing user-supplied reaches a log line, an error message or a span attribute. Telemetry attributes are allowlisted in `apps/server/src/telemetry/scrub.ts`, and SQL text carries only bound parameters.
- **Migrations** only go forward. Each one must keep working with the previous release's code, because a rollback runs the previous image on the migrated database.
- **PWA:**
  - Components use signals (`input()`, `output()`, `model()`, `inject()`), inline templates and styles, and Signal Forms. They are zoneless, with OnPush by default.
  - Colours, spacing and type come only from token CSS variables.
  - Test seams are services overridden in TestBed, because the builder refuses `vi.mock` of relative imports.
  - Use `building-pwa-ui`.
- **Files:** YAML ends in `.yaml`. Helper scripts are `.mts` files run by Node, never bash scripts. CI is parallel jobs in `cd.yaml`.
- **Dependencies:** JSR first. Pin exact versions for Effect, Drizzle, Nx, Vitest, oxlint and oxfmt, and upgrade Effect and Drizzle together (ADR 0009). Never add a `packages:` key to `pnpm-workspace.yaml` (ADR 0010). Use `adding-a-dependency`.

## Writing

- **Prose** (docs, comments, commit messages, UI copy): British spelling ("licence" as the noun, "colour", "organise") and no em-dash character. Domain terms are capitalised as in `CONTEXT.md`. Dates are ISO (2026-10-04).
- **ADRs** are only for decisions set in stone. Smaller decisions go in the slice plan's Decisions list.
  - An ADR is `docs/adr/NNNN-kebab-title.md`, numbered from 0014.
  - It has the SPDX line, an H1 that states the decision as a sentence, a short body, and optionally `## Considered Options` and `## Consequences`.
  - ADRs are amended in place.
- **Docs travel with the change.** Update `README.md` for running, CI and deploy, `CONTEXT.md` for terms, `docs/scenarios.md` and its spec for criteria, the slice plan's known limits, and the domain CHANGELOG, all in the same commit.

## Commits and releases

- **Commit message:** an imperative subject in sentence case, roughly 30 to 70 characters, with no trailing period. Then a prose body, wrapped near 72 columns, that says what changed, why, and how it was verified. No bullet lists and no trailers.
- Commit only when asked, and push only when asked. **A push to `main` deploys to production** through the `push-image` and `deploy` jobs.

## Skills

The task recipes live in `.agents/skills/<name>/SKILL.md`, each linked from `.claude/skills/`. Read the matching one before you start:

- `adding-a-domain-command`: a new or changed Command, end to end from the domain to the PWA.
- `changing-a-domain-rule`: derived rules, display formats, `RULES_VERSION`, scenario specs.
- `adding-an-owned-table`: a table, its migrations, RLS, grants and lookup functions.
- `extending-the-server`: an HTTP endpoint, a job kind, a CLI command or a config variable.
- `building-pwa-ui`: a UI component, a screen and route, wiring the generated client, palettes.
- `writing-e2e-specs`: a Playwright spec in `apps/pwa-e2e`.
- `adding-a-dependency`: a new package or an upgrade.
- `planning-a-slice-piece`: planning, building and closing a piece of a slice plan.
