<!-- SPDX-License-Identifier: EUPL-1.2 -->
# Slice 1 build plan

This plan cuts [Slice 1 of the MVP plan](mvp-plan.md#slice-1-foundations-and-the-task-loop) into seven pieces. Each piece ends green and is committed on its own. It was drawn up on 2026-09-30.
- It is based on the ADRs, the scenarios, and the stack trial in [research/trial-effect-drizzle.md](research/trial-effect-drizzle.md).
- The installed packages were checked the same day.
- An adversarial review then checked it, and its confirmed findings are folded in.

Pieces 1 to 4 are specified in full. Pieces 5 to 7 are outlined only as far as they constrain the earlier pieces, and each gets a short re-plan before it starts.

## Working agreements

- **One piece at a time.** Each piece stops for review when it is verified, and ends with one commit. Nothing is pushed unless the maintainer asks.
- **Test-first units.** Each unit starts from a written contract:
  - the types, with the file each one goes in;
  - each behaviour as input and expected result, boundaries included, with concrete values;
  - what is out of scope.

  Tests and implementation are written separately from that contract. Each unit's tests are seen to fail for the right reason once, by breaking one covered behaviour, before the unit counts as done.
- **A review pass per piece.** Correctness against the contract and the ADRs, row-level security and security, and whether the tests prove the behaviour. It runs before the piece's full verification and its commit.
- **Uncached database tests.** They always run with `--skip-nx-cache` (ADR 0009).
- **Red checks against the database** use `psql` as `asys_owner` and are restored afterwards. They are never written as migrations, because drizzle records every migration it has run.

## Decisions

### 1. Domain rules move to the slice that uses them

Decided 2026-09-30. Each rule is still written test-first in `libs/domain` before the screens of its slice. [mvp-plan.md](mvp-plan.md) says the same.
- **To Slice 2:** Gap, Current voice, and how well an Estimate fits a Gap.
- **To Slice 3:**
  - the Offset value type and resolver, with Working-day arithmetic;
  - the delegate and close-Check-in transitions;
  - Drop's cascade to an open Check-in;
  - the next Occurrence of a Series.

### 2. Time library: `temporal-polyfill` 1.0.5 (MIT)

- **How it is used.** It is imported as `import { Temporal } from 'temporal-polyfill'`, which does not patch globals. Only `libs/domain/src/lib/time/` imports it.
- **The domain's public types stay serialisable:**
  - `LocalDate`: `'YYYY-MM-DD'`
  - `LocalTime`: `'HH:MM'`
  - `DateSpec`: `{ date, time? }`
  - `Instant`: epoch milliseconds
  - `TimeZone`: an IANA id
- **Rejected alternatives:**
  - Native Temporal: missing in Node 24 and iOS Safari.
  - `@js-temporal/polyfill`: pre-production and much larger.
  - `@date-fns/tz`: a weaker model for plain dates.

### 3. ADR 0011's dependency rule is widened to permissive licences

- **The new rule.** Dependencies may be MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC or 0BSD. A licence allowlist check in CI enforces it (`pnpm licenses list --prod`).
- **Why.** "Every dependency is MIT or Apache-2.0" is already false today:
  - Angular needs `tslib` (0BSD) at runtime.
  - `pg` brings in `split2` (ISC).
- **The edit.** Piece 1 changes one sentence of ADR 0011.

### 4. Rule defaults the scenarios leave open

These are logged in `libs/domain/CHANGELOG.md` under `RULES_VERSION` 0.1.0; later versions add to them there.

**Dates and deadlines**
- **Due instant.** A timed Due resolves to its time. A date-only Due resolves to the last millisecond of its day, which is the next local day's 00:00 minus 1 ms.
- **Overdue** holds when `now > dueInstant`:
  - S2.7 is false at 10:00:00 and true at 10:00:01;
  - S8.7 is false at 2026-12-15 23:59:59.999 and true at 2026-12-16 00:00.
- **Available from** holds when `now >= availableFromInstant`. A date-only value means the start of that day.
- **Overdue applies to Open and Delegated Tasks only.** It ignores Blocked (S5.7).
- **Effective due** is the minimum of:
  - the Task's own Due;
  - the Latest starts of the Open or Delegated Tasks it blocks, followed transitively.
- **Latest start** is Effective due minus Estimate. A missing Estimate counts as 0.
- **Urgency window.** The default is 2 calendar days in the Current time zone, inclusive. A Task is urgent when its Latest start is at or before now plus the window.
- **A recurring Task is never labelled Drop.** This is recorded now and tested in Slice 3.

**Ranking and lists**
- **Picker order:**
  1. Overdue first.
  2. Then Quadrant, in the order Do, Plan, Delegate, Drop.
  3. Then earliest Latest start, with none last.
  4. Then a stable tie-break on creation order.
- **Tasks outside their Area's Active hours** leave Now silently. They are not listed under Waiting.
- **Blockers outside the working set.** A blocker that is not in the working set is Done, Dropped or Skipped, so it does not block.

**Task fields**
- **Area is optional.**
  - A captured Task has no Area until Triage or an edit gives it one.
  - A Task without an Area has no Active-hours limit.
  - Triage requires Importance and an Estimate.
- **Log progress** sets the remaining Estimate to a positive value below the current one.
- **The Due-move counter** counts every change to an existing Due, including clearing it. Setting a first Due does not count.

**Technical choices**
- **Commands carry client-made ids** for new entities. This keeps transitions pure and gives offline capture stable ids.
- **A DST gap or overlap** resolves with Temporal's `compatible` rule.
- **Scenario tests** use `Europe/Amsterdam`.

### 5. The HttpApi definition lives in `libs/contract`

- It sits next to the schemas, so OpenAPI has one source, and the server implements it.
- Piece 5 decides whether the PWA uses `HttpApiClient` or `fetch` with the schemas. Bundle size decides.

### 6. The server build becomes bundled ESM (piece 4)

- **Settings.** `bundle: true`, `format: ["esm"]`, with npm packages external.
- **What it fixes.** Workspace libraries are inlined, so there is no runtime alias hook and no stale library build.
- **What is lost.** Only `__dirname`. The static root comes from `Config` instead.
- **Imports.** `@effect/platform-node/<Module>` is imported by subpath, because its barrel imports `NodeRedis` and with it `redis`.

### 7. WebAuthn challenges stay in memory

The one server process keeps them, with a 5-minute TTL. Each is keyed by its own value, which the client echoes back as `challengeId` and which `clientDataJSON` carries, and is taken once (piece 4).

### 8. One lock orders each owner's writes

Every per-owner write transaction takes the owner's `change_counters` row `FOR UPDATE` as its first statement. That one lock:
- numbers the change log in commit order;
- serialises the User's commands, so cycle checks, expectation checks and idempotency inserts cannot race;
- fixes the lock order for jobs: the counter first, then `jobs` rows.

### 9. Pre-owner lookup functions keep exactly ADR 0007's shape

- **Shape.** Each takes the exact key and returns only `(owner_id, id)`. The lookup role reads only the key and owner columns, and for the job functions only the job columns they use.
- **Expiry and one-time use** are checked afterwards, under `withOwner`.
- **The three functions that read across owners:**
  - `claim_jobs`, which ADR 0012 allows;
  - `oldest_due_job_age()`, which returns only an interval. Piece 3 adds a one-line note on it to ADR 0012;
  - `failing_job_count()`, which returns only a count (piece 4, also noted in ADR 0012).

### 10. SPDX headers

- **Which files.** Every file with comment syntax carries a header, including drizzle's `migration.sql`.
  - This is safe because the migrator selects migrations by name, not by hash.
  - Newly generated migrations get the header right after generation.
- **Exempt:** JSON, lockfiles, `LICENSE*`, `.gitkeep` and binary assets.
- **Licence by location:** `EUPL-1.2` everywhere, `MPL-2.0` under `libs/domain` and `libs/contract`, and `MIT` under `libs/effect-passkeys` (added 2026-10-03, ADR 0011).
- **REUSE.** Added 2026-10-01: the repository follows REUSE 3.3. The header stays the identifier line alone. A root `REUSE.toml` supplies every file's copyright notice and the licence of the exempt files, the licence texts are also kept in `LICENSES/`, and `reuse lint` runs in CI next to `scripts/check-spdx.mts`.

### 11. Dependencies come from JSR when they are published there

Decided 2026-10-03.
- **How.** `pnpm add jsr:@scope/name@x.y.z` writes `"@scope/name": "jsr:x.y.z"`; the package installs under its own name from `npm.jsr.io`.
- **Today.** Only `@simplewebauthn/server` (and in piece 5 `@simplewebauthn/browser`) comes from JSR. `effect`, `@effect/*`, `drizzle-orm`, `drizzle-kit`, `temporal-polyfill` and `fast-check` are not on JSR (checked 2026-10-03).
- **Costs.** A JSR build is ESM only and has no `license` field; `pnpm licenses list` reads the licence from its LICENSE file, so the allowlist check still works. `pnpm audit` looks a JSR package up under its `@jsr/` name and cannot see its advisories. That gap is accepted and listed under the known limits of piece 4.

## The pieces

| # | Piece | Ends with |
|---|---|---|
| 1 | Repo hygiene, CI and domain core | `nx run-many -t lint typecheck build test` green in GitHub Actions; the domain Task-loop rules and the slice 1 scenario criteria tested |
| 2 | Contract and database core | the slice 1 core tables under forced RLS with the enumerating test; the change log; the command executor with idempotency and not-applicable Review items; ADR 0007 isolation tests with two owners |
| 3 | Jobs | the jobs table, the claim function, the worker, per-owner cron rows, pruning and the oldest-due-job age; the trial table dropped |
| 4 | HTTP API and sign-in | a runnable server with `/v1` commands, snapshot, changes (410), meta and auth; `/health`; the Sign-up link CLI; passkeys, recovery codes and the session cookie |
| 5 | PWA shell and data client | an installable PWA (manifest, GET share target, service worker); sign-up and sign-in screens; the snapshot and polling data client |
| 6 | PWA Task screens | capture and share; the Inbox with Triage and Review items; the Task editor with blockers; Now with Waiting; Areas and settings |
| 7 | Deployment and phone check | served on the public hostname over TLS on the VPS; the first passkey enrolled there; the share sheet tried on Android |

---

## Piece 1: repo hygiene, CI and domain core

### 1.0 Hygiene and CI

**Typecheck first**
- Run `nx run-many -t typecheck` to see the known failure. The inferred target runs `tsc --build --emitDeclarationOnly`, which rejects the server and pwa configurations because they set `declaration: false`.
- Override `typecheck` in each `project.json` with `tsc --noEmit -p` for each of the project's tsconfigs: app or lib, spec, and the server's `tsconfig.typecheck.json`.
- The result must be green before any other change.

**Licences and pins**
- Fetch the licence texts:
  - the root `LICENSE` (EUPL-1.2) from `https://raw.githubusercontent.com/spdx/license-list-data/main/text/EUPL-1.2.txt`;
  - `libs/domain/LICENSE` (MPL-2.0) from `…/MPL-2.0.txt`.
- Root `package.json`:
  - `"license": "EUPL-1.2"` and `"packageManager": "pnpm@11.22.0"`;
  - `vitest` and `@vitest/coverage-v8` pinned exactly to `5.0.2`, as ADR 0009 requires; they are `~5.0.2` today.
- `libs/domain/package.json`: `"license": "MPL-2.0"`.
- Edit ADR 0011 per decision 3.

**SPDX**
- Add headers to every existing file, per decision 10.
- Add `scripts/check-spdx.mts`, run over `git ls-files`.

**Scaffold and TypeScript**
- Delete `apps/pwa/src/app/nx-welcome.ts` and its use. This also ends the budget warning.
- `tsconfig.base.json`: `target: es2022`, `lib: ["es2023", "dom"]`.
- `libs/domain/tsconfig.lib.json`: `lib: ["es2023"]` and `types: []`, so the domain cannot reach DOM or Node APIs.
  - First check that `temporal-polyfill`'s types compile under this setting.
  - If they need more, widen `lib` as little as possible and note why.

**Domain tests**
- Run `nx g @nx/vitest:configuration --project=domain --testEnvironment=node --runtimeTsconfigFileName=tsconfig.lib.json`.
- Confirm that it added spec excludes to `tsconfig.lib.json`. Without them, the server's `bundle: false` build ships the specs.
- Add exact pins: `fast-check@4.10.2` as a devDependency and `temporal-polyfill@1.0.5`.

**CI**
- `.github/workflows/cd.yaml` (named CD, it will deploy later too) runs on push and on pull requests, with independent jobs that run in parallel on `ubuntu-24.04` with Node 24, after an `audit` job (`pnpm audit --prod`, with pnpm only and nothing installed) that gates them all. There is no CI shell script and no Nx Cloud.
  - `lint`: `nx run-many -t lint`.
  - `typecheck`: `nx run-many -t typecheck` and `tsc -p scripts/tsconfig.json`.
  - `build`: `nx run-many -t build`.
  - `test`: write `.env` with random passwords and both `DATABASE_URL_*` values, `docker compose up -d --wait`, apply the migrations with `drizzle-kit migrate`, run the ADR 0009 smoke import `node --input-type=module -e "await import('drizzle-orm/effect-postgres')"`, then `nx run-many -t test --skip-nx-cache`.
  - `format`: `nx format:check --all`.
  - `licences`: `node scripts/check-spdx.mts`, `reuse lint` and `node scripts/check-licenses.mts` (the dependency licence allowlist).
  - Each job lists its own steps in `cd.yaml`. Every job except `audit` starts with the composite action `.github/actions/setup`, which runs the composite action `.github/actions/checkout` (`actions/checkout` without persisted credentials) and then `pnpm/setup` with Node 24, a cached store and a frozen-lockfile install. `audit` runs the checkout action and `pnpm/setup` with `install: false`, so it audits the lockfile only. Neither action takes inputs, and the `.env`, compose and migration steps live in the `test` job.
  - Check the current versions of `actions/checkout` and `pnpm/setup` before writing it.

### Domain layout

This is `libs/domain/src/lib/`: MPL-2.0, with no import beyond `temporal-polyfill`.

```
time/        local-date.ts (LocalDate, LocalTime, DateSpec, parse and validate), zoned.ts (startOfDay, availableFromInstant, dueInstant, addCalendarDays; Temporal only here)
area/        active-hours.ts (ActiveHours: per ISO weekday, a list of [startMinute, endMinute) intervals; isWithinActiveHours(area, instant, tz); the Work and Personal seeds)
task/        task.ts (types), inbox.ts, blocked.ts (BlockedReason union), available.ts, deadlines.ts (isOverdue, effectiveDue, latestStart), priority.ts (isUrgent, quadrant)
picker/      picker.ts (pick returns { ranked, waiting }; Reason; an open ExclusionReason union), reason-text.ts
commands/    command.ts (TransitionResult: applied{changes}, notApplicable{reason} or rejected{reason}; Change: {entity, op: 'put' or 'remove', after}), task-, blocker-, area-, settings- and review-commands.ts
rules-version.ts   RULES_VERSION (0.1.0 in piece 1), with libs/domain/CHANGELOG.md
```

**`Task`**

| Field | Type |
|---|---|
| `id` | id |
| `kind` | `TaskKind`: `task`, `check_in` or `member_template` |
| `status` | `TaskStatus`: `open`, `done`, `dropped`, `delegated` or `skipped` |
| `title`, `notes`, `captureText` | text |
| `areaId` | id or null |
| `availableFrom`, `due` | `DateSpec` or null |
| `estimateMinutes` | number or null |
| `important` | boolean or null |
| `voice` | `Voice` (`out_loud` or `closed_door`) or null |
| `privacy` | `Privacy` (`visible`, `private` or `hidden`) or null |
| `dueMoveCount`, `version` | number |
| `createdAt` | `Instant` |
| `closedAt` | `Instant` or null |

**The other types**
- `BlockerLink`: `{ id, taskId (the blocked Task), blockerId }`.
- `Area`: `{ id, name, activeHours, defaultPrivacy, version }`.
- `ReviewItem`: `{ id, kind, subjects: { type, id }[], payload, dedupeKey or null, createdAt, resolvedAt or null }`.
- `Settings`: `{ timeZone, urgencyWindowDays }`.

### Units

**1. Time model**
- DateSpec resolution: start of day, end of day as the last millisecond, and timed values.
- DST: the Europe/Amsterdam gap on 2026-03-29 at 02:30, and the overlap on 2026-10-25 at 02:30.
- Invalid dates and times are rejected.
- The boundary rules of decision 4.
- Property tests over random dates, times and zones:
  - `availableFromInstant(d) < dueInstant(d)` for a date-only `d`;
  - parse and format round trips.

**2. Areas and Active hours**
- Weekday intervals: 08:00 is inside and 18:00 outside. The weekday is taken in the zone.
- The seeds:
  - Work: Monday to Friday, 08:00 to 18:00, default Privacy null.
  - Personal: every day, 00:00 to 24:00, default Privacy `hidden`.

**3. Derived state**
- `isInInbox`: Open, and `important` or `estimateMinutes` is null.
- `blockedReasons`: a tagged union, holding only `{ _tag: 'BlockedBy', taskIds }` for now. Open or Delegated blockers block.
- `isAvailable`, `isOverdue`, `effectiveDue` and `latestStart` (safe against cycles), `isUrgent` and `quadrant`.
- Test values come from the scenarios:
  - S2.4, S3.3, S4.5, S6.5, S7.3 and S10.4 for Blocked;
  - S11.7 for Effective due: an Order card due 12:00 with 15 minutes gives Design card image 11:45, and the baseline keeps 17:00;
  - S5.7, S2.7 and S8.7 for Overdue while Blocked or Delegated.

**4. Picker**
- `pick(tasks, links, areas, settings, now)` returns two lists:
  - `ranked`: the Available Tasks inside Active hours, each with a structured `Reason` and a `reasonText`;
  - `waiting`: Open, triaged Tasks that are not Available, each tagged `NotYetAvailable{from}` or `BlockedBy{taskIds}`.
- `ExclusionReason` stays an open union, so Slice 2 can add Voice and Gap.
- The tests cover every ranking step and the tie-break.

**5. Task-loop transitions**

Each is a pure function of `(state, command, now)`.

| Transition | Payload | Rules |
|---|---|---|
| `captureTask` | `taskId, title, captureText, areaId?` | |
| `triageTask` | `taskId, important, estimateMinutes, areaId?` | |
| `editTask` | `taskId, patch` | keeps the Due-move counter |
| `logProgress` | `taskId, remainingMinutes` | |
| `completeTask`, `dropTask` | | allowed from `open` only; otherwise, or when `expect` (status or version) fails, the result is `notApplicable` |
| `addBlocker` | `linkId, taskId, blockerId` | rejects a self-link, a duplicate and any cycle |
| `removeBlocker` | | |
| `createArea`, `updateArea` | | validate the intervals |
| `setTimeZone` | | an IANA name, validated through Temporal |
| `setUrgencyWindow` | | 1 to 14 days |
| `resolveReviewItem` | | |

- Every applied change bumps `version`.
- S8.2 and S10.6: completing changes only that Task.

**6. Scenario suite (tests only)**
- One file per scenario: `libs/domain/src/scenarios/s<N>.spec.ts`.
- The slice 1 criteria run as executable tests with the real 2026 dates: the blocking, Overdue and Effective-due cases above, plus S8.2 and S10.6.
- Every other MVP and later criterion is an `it.todo` titled with its slice or stage, for example `S8.5 [slice 3]`, `S5.9 [slice 2]` or `S6.2 [stage 1]`.

### Verification

- **Full checks.**
  - `pnpm exec nx run-many -t lint typecheck build test --skip-nx-cache`, `nx format:check --all`, `node scripts/check-spdx.mts` and the licence check are green.
  - Each `cd.yaml` job's commands pass locally.
- **Boundary red check.** Adding `import 'effect'` to `libs/domain/src/index.ts` turns `nx lint domain` red; the import is then removed.
- **Proof the tests can fail.**
  - Changing `now > dueInstant` to `>=` must fail S2.7's 10:00:00 case.
  - Removing the transitive step from `effectiveDue` must fail S11.7.
- **GitHub Actions.** The run is green once the maintainer allows the push.

---

## Piece 2: contract and database core

### 2a. Contract

**Library and boundaries**
- Generate it:
  `nx g @nx/js:library --directory=libs/contract --name=contract --bundler=tsc --unitTestRunner=vitest --linter=oxlint --tags=scope:contract`
- It is MPL-2.0, with its own LICENSE and the typecheck override from 1.0.
- `.oxlintrc.json`:
  - `scope:contract` may depend on `scope:domain` and `scope:contract`.
  - It may not import `drizzle-orm`, `drizzle-orm/*`, `@effect/sql-pg`, `@effect/platform-node*` or `@angular/*`.
  - `scope:contract` is added to the server and pwa lists.

**Schemas**
- **Names.** Schema values end in `Schema` (`TaskSchema`, `CommandSchema`), because the server imports them next to the same-named domain types. The contract-only types are `CommandRequest`, `CommandResult`, `ChangeEntry`, `Changes`, `Snapshot` and `Meta`.
- **Entity schemas** mirror the domain types.
  - A `.test-d.ts` type test checks that each `Schema.Type` equals its domain type. Task and `ChangeEntry` need `expectTypeOf(...).branded`, because bare `Schema.Enum` fields defeat plain equality even on a correct schema.
  - It needs vitest's `typecheck.enabled` with a `typecheck.tsconfig` that includes the file; otherwise it checks nothing (ADR 0009).
  - Seeing it red once is part of the unit.
  - Every check only narrows a value, so `Schema.Type` stays a plain `string` or `number`:
    - ids are lowercase UUIDs only, so an id string always equals its PostgreSQL text form (PostgreSQL lowercases uuids, while the domain compares ids with `===`);
    - text rejects NUL and unpaired UTF-16 surrogates, which PostgreSQL text and jsonb reject and which would otherwise turn client input into a 500;
    - Active hours are a `Struct` keyed by the seven `IsoWeekday` values, since `Schema.Record(Schema.Enum(...))` throws.
  - A Review item's `kind` and subject `id` are text, not UUIDs, so later kinds can reference other ids.
- **Numbers.** Numbers the domain validates itself are `Schema.Finite` in commands (Estimate, remaining minutes, Urgency-window days, Active-hours minutes), so a fraction reaches the domain and gets its specific Rejected reason. Server-produced numbers are `Schema.Int`: seq, version, instants and counters.
- **`Command`** is a `Schema.TaggedUnion` of the slice 1 commands, keyed by the domain's `CommandTag`, mirroring the domain's `Command`. Each has:
  - `idempotencyKey`, a UUID;
  - an optional `expect`, only where the domain has one (settled in piece 1): `{ status?, version? }` on Triage, edit, log progress, complete and drop, and `{ version? }` on updating an Area;
  - a static `commandMeta[tag].offline` flag, true for capture, Triage, edit, log progress, complete and drop.
  - `toDomainCommand` drops the `idempotencyKey`.
- **`CommandResult`** is either `Applied{ seq }` or `NotApplicable{ reason, reviewItemId }`. `Rejected{ reason }` is returned as a 422 error.
  - `Applied.seq` is the counter's `last_seq` after the command. A command that changes nothing leaves it unchanged.
- **Errors.** `CommandRejected { reason }`, `IdempotencyKeyReused {}` and `ChangesExpired { after }` are `Schema.TaggedError` classes. They carry no HTTP status yet; piece 4 adds `httpApiStatus` when it declares the endpoints.
- **The rest:**
  - `ChangeEntry`: the domain `Change` plus `seq`, as a union of its six shapes. A Settings entry has no `id`, and a Blocker remove has no `after`.
  - `Changes`: `{ seq, entries }`, the `since` response with its head.
  - `Snapshot`: `{ seq, tasks, blockers, areas, reviewItems, settings }`
  - `Meta`: `{ rulesVersion, apiVersion, settings }`, with `API_VERSION = 1`.
  - The Review item kind `command_not_applicable`, with its payload `{ command, reason }`.

### 2b. Tables, migrations, RLS tests and `createOwner`

**The owned-table helper.** Every owned table is built with:
- `pgTable.withRLS()`, since `.enableRLS()` is deprecated;
- `owner_id uuid not null`;
- the one `pgPolicy`, `nullif(current_setting('app.owner_id', true), '')::uuid`, written literally in the `sql` template, since drizzle does not inline parameters into policy SQL.

**Enums.** `schema.ts` states each enum's values as a string tuple and types its columns with `.$type<DomainEnum>()` through `import type`. drizzle-kit loads `schema.ts` with jiti, which cannot resolve the `@asys/domain` alias; a type-only import is erased before resolution. A test pins each tuple to its domain enum.

**Migrations**
- Each generated migration is followed by a `--custom` one holding `FORCE ROW LEVEL SECURITY` and the grants to `asys_app`. The pattern is `apps/server/drizzle/20260928200755_force_rls_grants_lookup/migration.sql`.
- Composite foreign keys, `(owner_id, x_id)` referencing `(owner_id, id)`, keep links within one owner, because foreign-key checks bypass row-level security.
- **Least-privilege grants** to `asys_app`:
  - SELECT, INSERT and UPDATE on `users`, `settings`, `areas`, `tasks`, `review_items` and `change_counters`;
  - SELECT, INSERT and DELETE on `task_blockers`, the only table it deletes from;
  - SELECT and INSERT on `change_log` and `idempotency_keys`. DELETE on those two waits for piece 3's prune job.
  - Tests clean up as `asys_owner`, which FORCE still binds.

**The tables**

Instants are `timestamptz(3)`, counters `bigint` (read as numbers), dates `date` (read as strings). Only `created_at` on `users`, `change_log` and `idempotency_keys`, and the two counters, have defaults; the mappers write every other column.

| Table | Columns and constraints |
|---|---|
| `users` | `owner_id` (primary key), `name`, `created_at` |
| `settings` | `owner_id` (primary key), `time_zone`, `urgency_window_days` (check `> 0`) |
| `areas` | primary key `(owner_id, id)`; `name`, `active_hours jsonb`, `default_privacy`, `version` |
| `tasks` | primary key `(owner_id, id)`; enums `task_kind`, `task_status`, `voice` and `privacy`; `area_id` with a composite foreign key to `areas`; separate `*_date` and `*_time` columns, with checks that a time needs a date and matches `HH:MM`, and that `estimate_minutes > 0`; `due_move_count`, `capture_text`, `version`, `created_at`, `closed_at` |
| `task_blockers` | primary key `(owner_id, id)`; `task_id` and `blocker_id`, each with a composite foreign key to `tasks`; unique `(owner_id, task_id, blocker_id)`; check `task_id <> blocker_id` |
| `review_items` | primary key `(owner_id, id)`; `kind`, `subjects jsonb`, `payload jsonb`, `dedupe_key`, `created_at`, `resolved_at`; a unique index on `(owner_id, dedupe_key)` where `resolved_at is null` |
| `change_log` | `owner_id`, `seq`, `entity`, `entity_id`, `op`, `data jsonb`, `created_at`; primary key `(owner_id, seq)`; `entity_id` is null exactly for settings rows, and `data` exactly for removals |
| `change_counters` | `owner_id` (primary key), `last_seq`, `pruned_through`; check `0 <= pruned_through <= last_seq` |
| `idempotency_keys` | `owner_id`, `key`, `command`, `request_hash`, `result jsonb`, `created_at`; primary key `(owner_id, key)` |

**Primary keys are `(owner_id, id)`** on `areas`, `tasks`, `task_blockers` and `review_items`. The composite foreign keys need a unique `(owner_id, id)` anyway, and a client-made id can then never collide with, or probe for, another owner's row.

**`createOwner({ ownerId, name, timeZone })`** creates, in one `withOwner` transaction, the user (inserted first with `onConflictDoNothing`), the settings with the default Urgency window, the seeded Areas and the counter row `(0, 0)`. It fails with `CreateOwnerRejected` (`invalid_name` for an empty or NUL name, `invalid_time_zone`, or `owner_exists`), and then writes nothing.

**Row mappers** in `apps/server/src/db/mappers.ts` turn each domain value into its row and back. A null `*_time` maps back to a `DateSpec` without a `time` key, and an Instant of `0` stays `0`.

**Tests**
- **The table-enumerating test** connects as `asys_app`.
  - It reads `pg_class` (relkind `r` and `p`, not temporary), `pg_attribute` and `pg_policy`. It avoids `information_schema`, which hides tables the role has no grant on.
  - It excludes `pg_catalog`, `information_schema`, `pg_toast` and `drizzle`.
  - For each table it asserts:
    - `owner_id uuid not null`;
    - `relrowsecurity` and `relforcerowsecurity`;
    - exactly one policy: permissive, command ALL, roles `{public}`;
    - both `USING` and `WITH CHECK` equal the one expression as PostgreSQL prints it.
  - It asserts that the ten known tables are in the list, so it cannot pass vacuously, and that no view, materialised view or foreign table exists.
- **The grants test** asserts the grant matrix above with `has_table_privilege`.
- **Isolation tests.** a, b, c, d and f are ported from `with-owner.spec.ts` to `tasks`, with two owners. `findSqlError` moves to production code (`apps/server/src/db/sql-error.ts`), and `assertRejectedByRls` to `apps/server/src/test/`. `with-owner.spec.ts` keeps only test e, the trial lookup.
- **Composite foreign keys.** A link to another owner's Task, and a Task in another owner's Area, fail with 23503 on the named constraint.
- **Red checks through `psql`,** each restored afterwards:
  - `NO FORCE`;
  - a changed policy expression;
  - a table without `owner_id`, and a view;
  - each composite foreign key dropped, then re-added with its recorded definition.

### 2c. Change log and command executor

**`lockCounter`** selects the owner's `change_counters` row `FOR UPDATE`, inside `withOwner`; a missing row is a defect. It is the first statement of every per-owner write transaction (decision 8).

**`appendChanges(ownerId, lastSeq, changes)`** numbers the entries from the locked counter row, stores each after-image encoded by the contract schema, sets `last_seq` and returns it. It takes the `ownerId` for the rows it writes, like the mappers do.

**`runCommand(ownerId, request)`** runs in one `withOwner` transaction at read committed:
1. Lock the counter row.
2. Look up the idempotency key. A repeat returns the stored result; the same key with a different request hash (SHA-256 of the canonical JSON of the encoded request) fails with `IdempotencyKeyReused`.
3. Load the state the transition needs.
4. Run the domain transition.
5. Persist the changes and their log entries. A put inserts when the loaded state had no row with that id and updates otherwise; there is no upsert.
6. On `notApplicable`, create a Review item of kind `command_not_applicable`. It holds the command and gets its own change-log entry.
7. Store the key with its request hash and result.

- **A Rejected command stores nothing,** not even its idempotency key: the transaction rolls back, and a retry with that key is evaluated afresh. Only Applied and NotApplicable results are stored and replayed.
- **Colliding ids.** With `(owner_id, id)` primary keys, a same-owner duplicate id is already rejected by the domain (`duplicate_id`), so a colliding client id can no longer reach the database through a command. A UniqueViolation on one of the four entity primary keys is still mapped to `CommandRejected(duplicate_id)`; any other UniqueViolation, which would mean a missing lock, propagates as an error.

**Tests**
- **The Done-then-Drop replay:**
  1. Completing gives Applied.
  2. Dropping with `expect.status = 'open'` gives NotApplicable, with its Review item and log entry in the same transaction.
  3. Replaying either key returns the identical stored result and no second Review item.
- **Every command once**, with its log entry and its effect on the snapshot; a command that changes nothing; a Rejected command; key reuse; a stale Area version; two owners using the same ids.
- **Concurrency:**
  - 50 parallel commands, with a concurrent poller, see seqs 1 to n with no gap and none missed.
  - Two concurrent requests with one idempotency key give one result and no error.
  - Concurrent `addBlocker` A→B and B→A: exactly one applies.
- **Red checks:**
  - Replacing the counter with `nextval()` must break the poller test.
  - Removing the leading `FOR UPDATE` must fail the idempotency and cycle tests.

### 2d. Snapshot and `since`

- `withOwner` gains an optional `isolationLevel`.
- `readSnapshot(ownerId)` runs at repeatable read. It returns:
  - the Open and Delegated Tasks;
  - the links whose blocked Task is in the working set;
  - the Areas;
  - the open Review items;
  - the settings;
  - the counter's `last_seq`.
- `changesSince(ownerId, after)` runs at repeatable read and returns `{ seq, entries }`: the entries after `after`, and the head read in the same transaction. A client can tell when it is caught up, so a page limit can be added later without breaking `/v1`.
  - It fails with `ChangesExpired` when `after < pruned_through`, or when `after > last_seq`, which only happens after a database restore; the client must reload.
- **Tests:**
  - A snapshot taken during concurrent writes is consistent with its seq.
  - `since` returns exactly the entries after it, and expires outside `[pruned_through, last_seq]`.
  - A second `FOR UPDATE NOWAIT` on a locked counter fails.

## Piece 3: jobs

### 3a. Table, claim and dedupe

**The `jobs` table** is owned, with primary key `(owner_id, id)`.

| Column | Notes |
|---|---|
| `id`, `kind`, `payload jsonb`, `run_at` | |
| `cron text null` | evaluated in the owner's Current time zone; a cron row is never finished |
| `dedupe_key text null` | unique on `(owner_id, dedupe_key)`; nulls stay distinct |
| `attempts` | counted by the claim, default 0 |
| `claimed_until`, `last_error`, `finished_at`, `failed` | `failed` needs `finished_at` |

- A partial index on `run_at` where `finished_at is null` serves the claim and the age.
- `asys_app` may SELECT, INSERT and UPDATE `jobs`, and now also DELETE `change_log` and `idempotency_keys` for prune. Finished one-off jobs are kept until Reminders decide their retention, so it gets no DELETE on `jobs`.

**`scheduleJob`** inserts a job inside the caller's owner transaction, after the counter lock.
- An existing dedupe key moves its row instead. It replaces `run_at`, `payload` and `cron`, resets `attempts`, `finished_at`, `failed` and `last_error`, and keeps `kind` and `claimed_until`. A moved Reminder carries its new payload, and a re-timed Morning briefing its new cron.
- A cron expression that parses but never fires (`0 0 31 2 *`) is refused, since `Cron.next` would throw on it.

**`claim_jobs(lease interval, max_jobs integer) returns table(id uuid, owner_id uuid)`**
- Declared `VOLATILE` and `SECURITY DEFINER`. Its body is a `materialized` CTE that selects the due, unfinished, unleased rows in `run_at` order with `limit max_jobs for update skip locked`, followed by an `UPDATE … FROM` it.
  - The simpler `UPDATE … FROM (subquery … for update skip locked)` plans the subquery as a rescanned inner loop, and can claim more than `max_jobs` rows.
  - The parameter is not called `max`, which would shadow the aggregate.
- Each claimed row gets `claimed_until = now() + lease` and `attempts + 1`, so a crash during a job still counts. The result is an unordered set.
- Owned by `asys_lookup`. Its privileges on `jobs`:
  - SELECT on `(id, owner_id, run_at, claimed_until, finished_at, attempts)`;
  - UPDATE on `(claimed_until, attempts)`.
- The handover follows the trial's `lookup_role` migration: `GRANT CREATE` only for the duration of the handover.
- Any `SET ROLE` in a migration is followed by `RESET ROLE` in the same file, because drizzle runs every pending migration in one transaction.

**`oldest_due_job_age() returns interval`** ignores finished rows, and failed rows always have `finished_at`. Claimed rows still count, so a stuck job shows. The server reads it only as `extract(epoch …)::float8`, because `@effect/sql-pg` cannot decode an interval. ADR 0012 has the note from decision 9.

**Tests**
- Every SECURITY DEFINER function is listed, owned by `asys_lookup`, has a pinned `search_path`, and is not executable by PUBLIC. `asys_lookup`'s column privileges are checked one column at a time.
- A claim across two owners while no owner is set. This replaces trial test e.
- Two concurrent claimers never claim the same job: one holds its claim open while the other claims under a 2-second lock timeout.
- A dedupe move, and a cron that never fires.
- The age query, relative to a baseline.

### 3b. Worker, backoff, cron and prune

**`JobRegistry.register(kind, handler)`** is the extension point for add-ons. A kind registered twice is a defect.

**The worker.** `jobWorkerLayer` forks a polling loop (every 5 seconds) that claims a batch of up to 10 with a 5-minute lease. It runs each job with `runJob` in one `withOwner(job.owner)` transaction:
1. A local `lock_timeout` of 30 seconds, so one stuck owner cannot stall the batch.
2. The counter lock (decision 8), then the owner's time zone.
3. The job row `FOR UPDATE`, rechecked against the database clock. A job moved or finished since the claim is skipped. The claim's lease is cleared, guarded only by the id.
4. The handler in a savepoint, so its failure rolls back only its own writes.
5. The finish, guarded by `run_at = <run_at read under the lock>`, so a handler that re-schedules its own job keeps its move.

The handler holds its owner's counter lock while it runs.

- **On success:**
  - A cron row gets its next `run_at` from `Cron.next`, counted from `max(now, run_at)`, so a run missed during downtime executes once. Its `attempts` resets.
  - Any other row gets `finished_at`.
- **On failure:**
  - `run_at` moves by the delay of an Effect `Schedule`: `exponential('1 second')`, jittered, then capped by `min` with `spaced('1 hour')`. The schedule is stepped `attempts` times through `Schedule.toStep`, and `Random.withSeed` makes it repeatable in tests.
  - A dedupe move between the claim and the lock leaves `attempts` 0, so the failure counts as attempt 1.
  - After 8 attempts a one-off row is marked `failed` and gets `finished_at`. A cron row instead moves to its next run with `attempts` 0, so one bad night does not stop it for good. Its failure then shows only in logs and `last_error`.
  - `last_error` holds tags, never a message: `Fail: ` or `Die: ` plus the error's `_tag` or name, or for an SQL error its reason tag, SQLSTATE and constraint. Drizzle's messages carry query parameters.
- **Aborted:** a job whose transaction fails outside the savepoint (a lock timeout, a missing counter, a bug) is logged and left as the claim made it. It is retried after its lease without limit, and shows on `/health` as a growing age.

**The `prune` job** is a daily per-owner cron row at `0 3 * * *` with dedupe key `prune`, scheduled by `createOwner`. It:
- finds the highest `seq` older than 30 days and deletes the change log up to it, as a contiguous prefix. `created_at` is the transaction start, so seq and `created_at` order can differ by a lock wait;
- sets `pruned_through = greatest(pruned_through, that seq)`;
- deletes `idempotency_keys` older than 30 days.

**Tests**
- The backoff progression and its cap, and cron times across both DST changes.
- A missed cron run runs once, in the owner's time zone.
- A success resets `attempts`.
- Failure, the last attempt, an unknown kind, a defect in a batch, a skipped job, an aborted job and a stuck owner.
- Prune, then `since()`, gives `Expired`. Also the prefix rule and the 30-day boundary in both directions.
- The worker racing a command that moves the same job does not deadlock, whichever takes the counter first.

**Test isolation.** The claim and the age see every owner in the shared dev database.
- Job tests remove their owners in finalizers.
- They put their due jobs in a band from 1900, so the jobs sort first.
- They assert only on their own rows.

**Dropping the trial**
- One migration drops `trial_items` and `trial_item_owner`: `SET ROLE asys_lookup; DROP FUNCTION …; RESET ROLE;`, then drizzle-kit's `DROP POLICY` and `DROP TABLE`.

## Piece 4: HTTP API and sign-in

Re-planned and built on 2026-10-03, in two commits: the passkey library (4a), then the server (4b).

**Notes from piece 3, decided**
- **`/health`** reports `failingJobs` next to `oldestDueJobAgeSeconds`, so a cron job that keeps failing shows even though its age never grows.
- **Tests stay on the shared dev database.** Stop `nx serve server` before running them, because its worker would claim their due jobs.

### 4a. The passkey library

**`@ionaru/effect-passkeys`** is an MIT library in `libs/effect-passkeys` (Nx project `effect-passkeys`, tag `scope:passkeys`), modelled on fresh-passkeys.
- **Split of work.** The library owns the WebAuthn ceremonies, the challenges, the counter updates and the passkey endpoints. ASYS supplies a storage port, a unit of work, hooks and its session middleware. The library's README describes each of them.
- **Entries.**
  - `/api`: the errors, the schemas and the `makePasskeyGroup` factory.
  - `/server`: the config, the `PasskeyStore` port, the challenges, the unit of work, the ceremonies, `makePasskeyHandlers` and `passkeyRouterConfig`.
  - `/testing`: a software authenticator, a memory store and a recording unit of work.
  - `/client` comes in piece 5.
- **Imports.** Only `effect` and `@simplewebauthn/server` (from JSR, decision 11), never `@asys/*`, so it can later be published on its own.
  - The library imports itself relatively, because importing its own alias is a circular dependency.
  - oxlint keeps the api entry free of `/server`, `/testing`, `@simplewebauthn/*` and `node:*`.
  - `libs/contract` may import only `/api`.

**WebAuthn settings**
- **Registration:** `residentKey` and `userVerification` `required`, attestation `none`.
- **Sign-in:** `userVerification` `required`, no `allowCredentials`.
- **Algorithms:** `[-8, -7, -257]`, passed to both the options and the verification. Without it the verification also accepts ML-DSA (-48) and prints a warning on Node 24.
- **Timeouts:** 300 s.
- **User handle:** the UTF-8 bytes of the host's user id, at most 64 bytes.
- **Sign-in checks.**
  - `rawId` must equal `id`, and the passkey is looked up by `id` across users.
  - A `userHandle`, when present, must match the stored user. SimpleWebAuthn checks neither.
  - `verified` must be true.
  - The counter is updated by compare-and-set inside the unit of work, together with the host's `onAuthenticated` hook.

**Challenges stay in memory** (decision 7), in `PasskeyChallenges.memory`.
- Each is keyed by its own value, the `challengeId` the client echoes back, and bound to a purpose and, where it applies, a user.
- It lives 5 minutes and is taken once.
- At most 1,000 are kept per purpose, the oldest evicted first, so anonymous sign-in options never evict a registration.

**Errors:** `PasskeyChallengeInvalid` 400, `PasskeyVerificationFailed` 401, `PasskeyUnknownCredential` 404, `PasskeyAlreadyRegistered` 409 and `PasskeyLastCredential` 409.

**The router.** Effect's router skips a path parameter longer than 100 characters, which makes `DELETE /passkeys/:credentialId` a 404 for a long credential id. A host passes `passkeyRouterConfig` (`maxParamLength: 1366`) as `routerConfig` to `HttpRouter.serve` and `HttpRouter.toWebHandler`.

### 4b. The server

**Build and CLI**
- **The build** is the bundled ESM of decision 6, with `@types/node` ^24.19.1. `dist/apps/server/main.js` is the `asys` CLI:
  - `serve` runs the HTTP server and the job worker;
  - `signup-link [--expires-in-days 7]` (1 to 30) prints `${ASYS_PUBLIC_ORIGIN}/signup#token=…` and the expiry;
  - `openapi` prints `OpenApi.fromApi(Api)`.
- **OpenAPI** is written, not served. The `server:openapi` target writes `dist/apps/server/openapi.json`. CI runs it, which also proves that the bundle loads without a `.env`.
- **Config** (`ServerConfig`):
  - `PORT`, default 3000;
  - `ASYS_PUBLIC_ORIGIN`, an exact origin: https, or http on localhost;
  - `ASYS_RP_ID`, the origin's host or a parent domain of it;
  - the database URLs.
- **Logging.** Every line goes through one redacting logger on stderr.
  - It prints message strings and primitive annotations as given, and every Cause as `describeError`: tags, SQLSTATE and constraint only. A ConfigError shows the names of its variables, never a value.
  - It covers the default request logger (which strips the query), the worker, startup and the CLI. The CLI runs with `disableErrorReporting`, so `runMain` prints nothing of its own.

**The API** (`libs/contract`, decision 5)

| Group | Prefix, middleware | Endpoints |
|---|---|---|
| `data` | `/v1`, `Authentication` | `POST /commands`, `GET /snapshot`, `GET /changes?after=n` (410 `ChangesExpired`), `GET /meta` |
| `passkeys` | `/v1/auth`, `Authentication` on the last four | from the library's factory: `POST /register/options`, `POST /register`, `POST /authenticate/options`, `POST /authenticate`, `POST /passkeys/options`, `POST /passkeys`, `GET /passkeys`, `DELETE /passkeys/:credentialId` |
| `auth` | `/v1/auth`, none | `POST /recover` |
| `account` | `/v1/auth`, `Authentication` | `POST /signout`, `GET /me`, `POST /recovery-codes` |
| `health` | none | `GET /health`: `{ status, oldestDueJobAgeSeconds, failingJobs }`, or 503 |

- **Statuses.**
  - `CommandRejected` 422, `IdempotencyKeyReused` 409, `ChangesExpired` 410.
  - `SignUpLinkInvalid` 410 (unknown, expired or used), `SignInFailed` 401 (recovery codes), `Unauthorized` 401 from the middleware.
  - A schema failure is a 400 with an empty body, and a database failure an empty 500.
- The auth endpoints are not domain commands, so they are exempt from the one-mutation-route rule.

**Cookies and the Origin guard**
- **The session cookie** is `__Host-asys_session`, with HttpOnly, Secure, SameSite=Lax, Path=/ and Max-Age 30 days.
  - The prefix blocks cookie tossing from sibling subdomains.
  - In development only Chrome and Firefox accept a Secure cookie over `http://localhost`; Safari does not.
- **The Origin guard** covers every method except GET, HEAD and OPTIONS. `Origin` must equal `ASYS_PUBLIC_ORIGIN` exactly, or the answer is an empty 403.
  - It is the API's CSRF defence, because Effect has none built in.
  - It also caps request bodies at 1 MiB.

**Sessions**
- **Creation.** A 32-byte token, sent as base64url and stored as its SHA-256 hex, valid for 30 days.
- **Sliding.** A request with less than 29 days left renews the session to 30 days from now and re-sends the cookie, so at most once a day. There is no absolute cap.
- **Revocation.** Removing a passkey, regenerating the recovery codes, or signing in with a recovery code signs out every other session. Sign-out deletes the current one, and prune deletes expired ones.
- **Re-check under the lock.** The middleware checks a session before the handler runs, so a credential change re-checks it after taking the counter lock, the lock every revocation takes. A revoked request then answers 401: regenerating the codes fails with `Unauthorized`, and adding or removing a passkey dies with it, because the library's unit of work cannot carry the error; it still answers itself as an empty 401. Domain commands carry no credential power and are not re-checked.

**Sign-up and recovery**
- **The Sign-up link.** `signup-link` pre-allocates the owner id and stores the token's hash under it. The library's register endpoints carry the token.
  - On begin, ASYS checks the link.
  - On finish, ASYS locks the link row first, because the owner has no counter yet. It then marks the link used and creates the owner rows, the passkey, 10 recovery codes and a session, in one transaction.
- **Recovery codes.** A set is 10 codes of 80 random bits in Crockford base32, written `XXXX-XXXX-XXXX-XXXX`, stored hashed and used once. Input is upper-cased, hyphens and spaces are dropped, and `O`, `I` and `L` read as `0`, `1` and `1`.
- **ASYS's side of the library.**
  - `PasskeyStoreLive` over drizzle and row-level security. Its writes take the counter lock, and a duplicate credential id is caught outside its savepoint.
  - A `PasskeyUnitOfWork` that is `withOwner` plus the counter lock.
  - The hooks: sign-up gated by the link, the owner created with the first passkey, a session on sign-in, and the other sessions revoked when a passkey is removed.

**Tables and functions**

| Table | Columns |
|---|---|
| `sign_up_links` | `token_hash` (hex 64, unique), `created_at`, `expires_at`, `used_at` |
| `passkeys` | `credential_id` (base64url, at most 1,366, unique), `public_key` (base64url COSE), `counter`, `transports`, `backed_up`, `name`, `created_at`, `last_used_at` |
| `recovery_codes` | `code_hash` (hex 64, unique), `created_at`, `used_at` |
| `sessions` | `token_hash` (hex 64, unique), `created_at`, `expires_at` |
| `sign_in_identities` | `provider`, `subject` (unique together); empty until Stage 7 |

- **Shape.** All five are owned and under forced row-level security, with primary key `(owner_id, id)`.
- **Formats.** Hashes are lowercase hex text and binary values base64url text, because drizzle's `bytea` arrives as a view over a shared buffer.
- **Grants to `asys_app`:** SELECT, INSERT and UPDATE on `sign_up_links`; also DELETE on `passkeys`, `recovery_codes` and `sessions`; nothing on `sign_in_identities`.
- **Lookup functions** in decision 9's shape: `lookup_sign_up_link`, `lookup_session`, `lookup_passkey` and `lookup_recovery_code`. Each returns `(owner_id, id)` for the exact key.
- **`failing_job_count()`** returns only a count: unfinished jobs whose `last_error` is set. A permanently failed one-off is not counted.

**Tests**
- **No browser.** The library's specs drive the ceremonies with a software authenticator: an ES256 key with a hand-built `none` attestation.
- **HTTP.** HTTP tests run through `HttpRouter.toWebHandler` with the server's router config and Origin guard. A real-socket test checks the guard, the body cap and the log redaction.
- **Locks and races.** Tests pin the link lock, the counter compare-and-set, the counter lock of the store and of the unit of work, concurrent recoveries and concurrent removals.

**Known limits for slice 1** (also in ADR 0006's consequences)
- Sessions have no absolute lifetime.
- Credential changes need only a valid session; there is no step-up authentication.
- A flood of anonymous sign-in options can evict real ones within their partition, and so delay sign-ins.
- `pnpm audit` cannot see advisories for JSR packages.

**Later work.** Publishing `@ionaru/effect-passkeys` on JSR needs a `jsr.json`, `npm:` import mappings, and a check of extensionless imports and slow types (`--allow-slow-types` is likely).

## Piece 5: PWA shell and data client

Re-planned and built on 2026-10-03. Ten probes ran first, and their facts are listed under "Facts checked on 2026-10-03 (piece 5)"; an adversarial review of the unit contracts followed, and its confirmed findings are folded in.

**The API client**
- **ng-openapi-gen 1.1.0** generates the Angular client from `dist/apps/server/openapi.json` into `apps/pwa/src/generated/api`, which is gitignored and rebuilt by the cached `pwa:api-client` target (`dependsOn: server:openapi`). Its config is `apps/pwa/ng-openapi-gen.json`, run from the workspace root.
- **Why not Effect in the browser.** Bundled with esbuild, minified and gzipped:

  | What is bundled | Minified | Gzipped |
  |---|---|---|
  | `pick` and `temporal-polyfill` (needed anyway) | 63 kB | 22 kB |
  | Adding the contract schemas | +190 kB | +55 kB |
  | Adding Effect `HttpApiClient` instead | +390 kB | +120 kB |

  So the PWA never imports `@asys/contract`, `@ionaru/effect-passkeys/api` or `effect` at runtime; oxlint forbids it in `apps/pwa`. Server responses are trusted, because the server encodes them with the contract schemas. ADR 0004 wants queued commands validated against those schemas in Slice 4: that needs a lazy-loaded chunk or an ADR change then.
- **Named models.** The contract's schemas carry Effect `identifier` annotations (`Task`, `Snapshot`, `Command` and its 13 `<Tag>Command` members, `CommandResult`, the six `ChangeEntry` members, the enums, and the passkey library's `RegistrationResponse`, `AuthenticationResponse` and `PasskeyChallenge`), so they become OpenAPI components. Each enum is one shared schema in `libs/contract/src/lib/enums.ts`, and `UuidSchema` checks lower case with a plain filter, because `Schema.isLowercased()` adds an `allOf` that the generator turns into `any`.
- **One boundary.** `apps/pwa/src/app/core/api` is the only place that imports the generated code: functions by their own file (a barrel import would bundle every operation), models type-only. `wire.ts` holds a compile-time guard: `Wire<T>` maps enums to their literal values, drops `readonly` and maps `any` to `unknown`, and `SHAPES` requires `Equals<Wire<Generated>, Wire<Domain>>` for the Task, the Snapshot parts, every ChangeEntry and Command member, the command result and Me, so contract drift fails `pwa:typecheck`. `ReviewItem.payload` is unchecked by design.
- **Services.** `DataApi` (snapshot, changes, runCommand) and `AuthApi` (one method per auth operation) return promises that never reject. Command outcomes are `Applied`, `NotApplicable`, `Rejected`, `KeyReused`, `SignedOut` or `Failed { status }`; auth errors map on the body's `_tag`, never on the status alone.

**The 401 rule.** A 401 means signed out only when its body is `{ "_tag": "Unauthorized" }`, or when it is the body-less 401 of a passkey add or remove whose session was revoked. `SignInFailed` and `PasskeyVerificationFailed` are 401s that mean no such thing. An HTTP interceptor applies the rule and passes every error on unchanged.

**Session and routes.** `Session` asks `GET /v1/auth/me` at startup without blocking it, with a 10 s timeout: SignedIn, SignedOut, or Unreachable (a late answer still applies). `signedInGuard` admits SignedIn and Unreachable and sends SignedOut visitors to `/signin?returnUrl=…`; `signedOutGuard` sends SignedIn visitors to `/now`, except on `/signup`. `safeReturnUrl` accepts only same-origin paths that are not sign-in screens.

**The data store.** One `DataStore` with plain signals loads the snapshot, polls `changes` every 15 s while the app is visible and at once on focus, visibility, `online`, `refresh()` and every applied command, with one request in flight at a time and exactly one follow-up. A 410 `ChangesExpired` reloads the snapshot; other failures leave the data and show it as Stale. `stop()` bumps a generation, and every late response of an older generation is dropped. Now is `pick` over the working set and a minute clock; the Inbox count is `inboxCount`. Only the shell starts and stops the store: start on SignedIn, stop on SignedOut, nothing on Unreachable.

**Working-set rules in the domain.** `applyChanges` and `inboxCount` are in `libs/domain/src/lib/working-set`, for Slice 4's offline store too, and `RULES_VERSION` is 0.2.0.

**Time zone.** At sign-up the device zone is sent when it is at most 64 characters and `Intl.supportedValuesOf('timeZone')` contains it, otherwise `UTC`. Afterwards `zoneToReport(device, server, last)` decides whether to send `SetTimeZone`: it reports a device zone that differs from the server's unless this device already reported that zone, so two devices in different zones do not flip it back and forth. The last reported zone is kept in `localStorage["asys.timeZone.lastReported"]` and cleared on every sign-in and sign-out.

**Passkeys in the browser.** `@ionaru/effect-passkeys/client` wraps `@simplewebauthn/browser` 14.0.0 (from JSR): `createPasskey` and `usePasskey` never reject and map errors to `PasskeyFailure` (`Cancelled`, `AlreadyRegistered`, `Unsupported`, `Misconfigured`, `Failed`). The entry is typechecked (`tsconfig.client.json`) and tested but not emitted by `build` until the library is published. The PWA does the HTTP itself.

**Screens.** Sign-up (name, then a separate "Create passkey" tap, then the recovery codes once; the token is read once from the fragment and replaced out of the address bar), sign-in with a passkey, recovery sign-in, the "add a passkey now" page after it, the account screen (passkeys, recovery codes, sign out), and a minimal Now (ranked titles with their reasons, and Waiting). Today, Inbox and `/capture` (which shows what was shared) are placeholders for piece 6. Passkey begin options are refetched after every failed attempt, at 4 minutes old, and on visibility or `online` once that old, because the server takes each challenge once and keeps it 5 minutes.

**Design system.** The design tokens become `dist/libs/design-tokens/css/tokens.css` through Terrazzo (ADR 0013), and the fonts are bundled (ADR 0011). Button, TextField (a Signal Forms control), BottomNav and SectionHeader are ported from the design system's `bundle.css` with their `asys-` classes and token-only CSS. BottomNav takes its current item from the router (`routerLinkActive` with `ariaCurrentWhenActive`), not from the README's `current` input and `(navigate)` output. `data-theme` is always set on `<html>` and `asys-root` sits on `<body>`; only Evergreen and the System theme exist until the appearance settings. Motion is 150 ms and switched off under `prefers-reduced-motion` and in Voice only.

**Service worker and manifest.** `@angular/service-worker` in production, registered when stable (30 s at most). `ngsw-config.json` lists the default navigation URLs plus `!/v1/**` and `!/health`, and has no data groups, so the API is never cached. A new version shows "A new version of ASYS is ready." with Reload, held back while recovery codes are on screen. The manifest starts at `/now` and has a GET share target to `/capture`; the icon is a marked placeholder until the final artwork.

**Tests.** `pwa:test` runs `@angular/build:unit-test` on Vitest 5 with jsdom (ADR 0010's consequence is amended). The builder refuses `vi.mock` of relative imports, so every seam (`PasskeyCeremony`, `DeviceStorage`, `DeviceZone`, `Clock`, `PageReload`) is a service that TestBed overrides.

**Dev setup.** See the README: `nx serve pwa` with a proxy that keeps `Origin` and the cookie, `pwa:serve-sw` for a real service-worker run on port 4200, and `http://localhost:4200` only.

**Known limits**
- A cached old PWA can talk to a newer server until Slice 4's rules-version check; the update prompt narrows this.
- `animate.enter` and `animate.leave` do nothing in jsdom, so the unit tests cannot show that `animation: none` removes an element at once; that is checked in a browser.
- `pwa:typecheck` is plain `tsc` and does not check templates; `pwa:build` and `pwa:test` do.
- Validating all 12 token contexts and the typography references in the token build stays open (ADR 0013).
- The reason line ("start by 2026-10-03 14:30") differed from the design system's reason style; piece 6 settled it (domain rules 0.3.0).
- Safari cannot keep the `__Host-` cookie on `http://localhost` (development only), and its passkey activation timing is untested.
- `pnpm audit` cannot see advisories for `@simplewebauthn/browser` from JSR, as for the server package.
- The variable fonts are 126 kB together, larger than a Latin subset would be.

## Piece 6: PWA Task screens

Re-planned and built on 2026-10-04. The re-plan was reviewed adversarially by three critics (codebase fit, design system and UX, feasibility and concurrency) and a judge who checked each finding against the code, and the confirmed findings are folded in. Five probes ran first, and their facts are listed under "Facts checked on 2026-10-04 (piece 6)". The contracts of the screen units were reviewed again before they were built, and their amendments are folded in.

**Reason and Waiting text.** The domain rules move to 0.3.0 (see `libs/domain/CHANGELOG.md`). A ranked Task's reason line is one fact, `Due yesterday 17:00`, `Latest start 14:30` or `No Due`, then ` · important` when it is important; Overdue and the Quadrant move to the StatusBadge and the QuadrantChip. `WaitingTask` gains `reasonText`, such as `Available from Tue 6 Oct · Blocked by Order card`. Days, times and Estimates have fixed English formats in `time/display.ts`. The domain also gains `inboxTasks` and `openReviewItems`, `blockerCandidates` and `blocks`, and `activeHoursSummary` with the time-input helpers.

**Read-your-writes in the DataStore.**
- **`send`** resolves an Applied or NotApplicable outcome only after a request that started after the response has settled: the follow-up poll, or the reloaded snapshot after a 410. That follow-up is forced, so it runs while the page is hidden. Other outcomes, a store that is not started or stopped, and a generation change resolve at once; a 401 settle and `stop()` resolve every waiter.
- **`awaitingSync`** holds the subjects (`commandSubject`: the Task, link, Area or Review item id, or `settings`) whose follow-up failed, until the next successful poll or snapshot. Screens disable that subject's actions meanwhile and say "Saved. Waiting for the server.", so a second Done cannot make a spurious Review item.
- **`runOnly`** (private) posts without waiting; the automatic zone report uses it and records the reported zone on its immediate outcome.
- **`chooseTimeZone`** waits for an automatic report in flight, blocks new ones while it runs, posts SetTimeZone itself, records the device zone as last reported on Applied, then waits for the poll like `send`.
- The store applies no command locally; Slice 4's outbox does that for queued commands.
- **Leaving mid-send.** Because `send` waits for a poll, a person can leave a screen while it waits. Every screen checks its `DestroyRef` after each awaited send and then does nothing: no navigation, no `Location.back()`, no focus.

**Commands and retries.** A screen builds one Command per intent, with its new ids from `Ids.next()` at the first attempt, and keeps it as pending until an outcome other than `Failed`, so a retry resends the same Command. `CommandAttempts`, provided per screen, keys each Command by its canonical JSON (sorted keys, the server's request-hash rule) and forgets the key on any outcome other than `Failed`; such an outcome also ends earlier attempts of the same kind on the same subject, so choosing a value again later is a new intent with a new key, never a replay of an old one. Expectations are by status only: Triage, Log progress, Done and Drop expect `open`, and the editor's EditTask carries only the changed fields and expects the status the Task had when the form opened. Nothing sends `version`, Areas included, so edits to different fields on two devices both land. Every submit button is disabled while its send is pending, and outcomes read through `outcomeMessage`.

**Screens.**
- **Now.** The first ranked Task sits in the TopPick (Done, Log progress and Open); the others are PickerRows with the Overdue badge, the reason line, the Estimate and the QuadrantChip. Waiting is a collapsed SectionHeader whose rows show the Estimate and the Waiting line. A `role="status"` region announces "“X” is Done." and the new Estimate, and focus moves to the new TopPick's title.
- **Inbox.** Review items come first, with copy per command tag in `features/inbox/review-copy.ts` and Dismiss; then one Triage card for the oldest Inbox Task not deferred, with "1 of N" over the visit, Importance, an Estimate, the Area, and Triage, Later, Drop and Edit. The card is keyed by its Task, and its draft resets only on a new id.
- **The Task editor** (`/tasks/:taskId`) edits the title, Notes, Area, Importance, Estimate, Available from and Due, and saves only the changed fields (`buildTaskPatch`). Each field follows the store while it equals its baseline. It shows the Overdue and Blocked badges, the Inbox, Latest start and Effective due lines, Done, Log progress and Drop, the Blocked by list with Add a blocker (`blockerCandidates`) and Remove, and Blocks. A Task that leaves the working set while the form is dirty stays visible and read-only.
- **Capture.** Quick add opens from the Capture button above the bottom bar on Now, Today and Inbox, and keeps its text until Applied. `/capture?title&text&url` prefills one title field (`sharedCapture`); Add captures once, then replaces the URL with `/capture`, so a reload cannot capture twice.
- **Settings** (the header link) sets the Urgency window and the Current time zone, each applied on change, and links to Areas and Account.
- **Areas** are listed by name with their Active hours text. The Area editor edits the name and each weekday's intervals, sorts them by start, and saves only the changed fields.

**Components.** TopPick, PickerRow, TriageCard, QuickAdd, ReviewItem, StatusBadge and QuadrantChip are ported from the design system's `bundle.css` with their `asys-` classes and token-only CSS. The shared controls are Signal Forms controls like TextField: Segmented, EstimateField, DateSpecField and SelectField. InlineConfirm asks before Drop, and LogProgressForm is shared by Now and the Task editor.

**Routes.** The new routes (`tasks/:taskId`, `settings`, `settings/areas`, `settings/areas/new` and `settings/areas/:areaId`) are lazy children of the shell with titles; Now, Inbox and `/capture` stay eager, because lazy loading saves almost nothing for small screens. The Task and Area editor routes are thin wrappers that render the editor inside `@for (id of [id()]; track id)`, because the router reuses the route component when only the id changes; each id gets a fresh draft, forms and `CommandAttempts`. After Done or Drop the editor goes back when there is a previous navigation, otherwise to `/now`.

**Tests.** Each unit with behaviour got an implementer and a test-writer from one contract, and each unit's tests were seen to fail once for the right reason before it counted. Specs use the real `pick` over a fixed state and clock, and change the state from outside the screen.

**Departures from the design system**
- PickerRow is a link (`a[asys-picker-row]`), with no `(select)` output.
- TopPick's third action is Open, not Not now, and it has no Gap row in Slice 1. It shows an Overdue badge in its meta row when the Task is Overdue, and Now projects the Log progress form into it.
- TriageCard adds Later and Edit, and "1 of N" counts over the whole visit. Importance and Estimate are the shared Segmented and EstimateField controls, which took the segment and chip CSS. Its title is an `h2`, and Change is disabled while a send is pending.
- Drop is confirmed inline everywhere (InlineConfirm, a new component), with focus starting on Cancel.
- ReviewItem projects an "Open Task" link after its buttons.
- QuickAdd has no `open` model: the shell renders the bar while it is open, and the bar replaces the Capture button.
- `/capture` skips the shared Loading and Failed rule, because capturing needs no working set.
- LogProgressForm is a shared component.
- The `.asys-field` CSS moved from TextField into the global `styles.css`, so every control is styled.
- The editor's draft keeps the Area as a string (`''` is No Area), so the select binds directly.
- `chooseTimeZone` posts directly instead of through `runOnly`, which avoids a redundant poll.
- The global link colour is lowered with `:where()`, so links inside components keep their own colour.
- TriageCard's `(drop)` output is named `dropTask`, because `drop` is also a DOM event that bubbles from the card's inputs and would drop the Task without its confirmation.

**Known limits**
- The copy is English only, in the domain (reason lines and display formats) and in the PWA.
- Review items can only be dismissed; applying their command again is later work.
- Cycles through closed Tasks are caught by the server only, and the editor shows its answer under Add a blocker.
- Read-your-writes costs one poll round trip before a screen updates; Slice 4's outbox removes it.
- DateSpecField writes `''` back into a date input whose typed date became partial, which may clear a half-typed date on desktop Chrome. The Area editor's time inputs share the cause: clearing one part of a time empties the whole input.
- The Area editor keeps its inputs enabled while sending; only Save or Create is disabled. A missing Area offers "Go to Areas".
- Areas cannot be deleted, because no command exists, and Privacy gets no UI until Stage 2.
- The initial bundle is 480.83 kB (127.18 kB transferred), 19 kB under the 500 kB warning; the next screens may need Inbox or the shared controls loaded lazily.

## Piece 7: deployment and phone check (outline)

- Fix the public hostname (open question 11 in the MVP plan) before any passkey is enrolled.
- Build a Node 24 image. It serves the PWA through `HttpStaticServer` with SPA fallback, on the same origin. The static root comes from `Config` and is mounted next to the API in `asys serve`.
- Run Compose on the VPS behind the existing TLS reverse proxy. Migrations run as `asys_owner`.
- The phone check:
  1. Run `signup-link`.
  2. Enrol a passkey on the phone.
  3. Install the PWA.
  4. Share text from another Android app into the Inbox.

## Facts checked on 2026-09-30

These were checked against the installed packages (Effect 4.0.0-rc.117, drizzle-orm 1.0.0-rc.5-5935859, Nx 23.2.1) and the npm registry. Effect was moved to rc.118 on 2026-10-01: its new module paths (`effect/http-api`, `effect/http`, `effect/cli`) were checked then, the API details below were not. It was moved to the stable 4.0.0 on 2026-10-02 with no code change: every check passed, and the ADR 0009 type test still fails without its `paths` entry. Closed sets in the domain are string enums with these values (piece 1). Recheck anything that has had a version change since.

### Versions and licences

| Package | Version and licence | Notes |
|---|---|---|
| `@simplewebauthn/server` | 14.0.3, MIT | from JSR (decision 11): ESM only, no `license` or `engines` field |
| `@simplewebauthn/browser` | 14.0.0, MIT | from JSR in piece 5; `startRegistration({ optionsJSON })` and `startAuthentication({ optionsJSON })` |
| `temporal-polyfill` | 1.0.5, MIT | about 20 kB gzipped |
| `@js-temporal/polyfill` | ISC | |
| `fast-check` | 4.10.2, MIT | |
| `@fast-check/vitest` | 0.5.0 | accepts vitest 5 |
| `effect` | 4.0.0 | used, with a tsconfig paths entry for drizzle's type import of `effect/unstable/sql/SqlError` (ADR 0009) |
| `tslib` | 0BSD | |
| `split2` | ISC | |

### HttpApi (`effect/http-api`)

- **Definition.** `HttpApi.make(id).add(group).prefix('/v1')`. `.prefix()` and `.middleware()` apply only to groups and endpoints added before them.
- **Endpoints.** `HttpApiEndpoint.get/post/delete(identifier, path, { params, query, payload, success, error })`, the identifier first. Query values are coerced, so `Schema.Int` works for `?after=5` and rejects `abc` and `1.5`. Leaving out `success` gives 204, and `HttpApiSchema.status(201)` on a success schema gives 201. Excess keys are stripped, and an unknown route or a wrong method is a 404.
- **Errors.** Declared as `Schema.TaggedError<Self>()(tag, fields, { httpApiStatus })`. There are built-in `HttpApiError.Gone`, `Conflict` and `UnprocessableEntity`. A schema failure is a 400 with an empty body.
- **Handlers and serving.** `HttpApiBuilder.group(api, 'group', …)` with `handleAll`. `HttpApiBuilder.layer(api)`. Serve with `HttpRouter.serve` and `NodeHttpServer.layer`; there is no `HttpApiBuilder.serve`.
- **OpenAPI and SSE.**
  - `OpenApi.fromApi(api)` gives OpenAPI 3.1.
  - `HttpApiSchema.StreamSse` streams, with no heartbeat or `retry:` of its own.

### Cookie auth

- **Middleware.** `HttpApiMiddleware.Service<Self, { provides, requires }>()(id, { error, security: { session: HttpApiSecurity.apiKey({ key, in: 'cookie' }) } })`.
- **Missing cookie.** The middleware still runs when the cookie is absent, with an empty credential, so reject `''`.
- **Setting the cookie.** `HttpApiBuilder.securitySetCookie` defaults to `secure` and `httpOnly` but sets no `Path`, so pass `path: '/'`.
- **Clearing the cookie.** `HttpServerResponse.expireCookie`.

### Static files, Schema and core modules

- **Static files.** `HttpStaticServer.layer({ root, spa: true })` from `effect/http` handles GET only. It gives ETag and 304. Its SPA fallback covers extensionless paths when `Accept` includes `text/html`.
- **Schema v4 API:**
  - `Schema.Union([…])`, `Literals([…])`, `TaggedStruct`, `TaggedUnion`, `optionalKey` or `optional`, `NullOr`;
  - `decodeUnknownEffect/Sync`.
- **Schema v4 removals.** `decodeUnknown`, `pick`, `omit` and `extend` are gone; use `mapFields(Struct.pick(…))`.
- **Renames elsewhere:**
  - Effect: `catchAll` is now `Effect.catch`.
  - Config: `Config.String`, `Port` and `Redacted`.
  - Services: `Context.Service` replaces `Context.Tag`.
- **Cron** (checked on 2026-10-02 for piece 3).
  - `Cron.parse(expr, tz)` returns a `Result`, and `Cron.parseUnsafe` throws.
  - `Cron.next(cron, now)` returns a `Date` strictly after `now`. It throws for an expression that parses but never fires (`0 0 31 2 *`).
  - A time in the spring gap moves forward, and only the first time of the autumn overlap fires.
  - Given as a string, a zone that starts with `GMT` (`GMT`, `GMT0`, `GMT+0`) is read as a malformed offset and rejected, although Temporal accepts it. `nextCronRun` passes `DateTime.zoneMakeNamedUnsafe(zone)` instead.
- **Schedule** (checked on 2026-10-02).
  - `Schedule.exponential`, `jittered`, `spaced` and `upTo` exist, and `Schedule.min` takes an array.
  - Jitter before `min`, or the cap is overshot by up to about 19%.
  - `Schedule.toStep` steps a schedule without sleeping, and returns a `Pull` whose error channel holds `Cause.Done`.
  - Jitter is 0.8 to 1.2 from the `Random` reference, so `Random.withSeed` makes it repeatable.
- **Test clock.** Jumping the TestClock far ahead, to a 2026 instant, fires every pending timer of the database pool at once and hangs it. Tests that need a fixed date for code that reads `Clock` provide a fixed `Clock` around that code only.
- **CLI.** `effect/cli`: `Command.make`, `Flag.String` and `Flag.Int`, `Command.run`, with `NodeServices.layer`.

### Drizzle

- **Transactions.**
  - `db.transaction(fn, { isolationLevel })`.
  - A nested `tx.transaction` becomes a savepoint.
  - Statements through `db` or `PgClient` inside the callback join the transaction.
- **Row locks.** `.for('update', { skipLocked: true })` exists.
- **Raw queries** (checked on 2026-10-02).
  - `db.execute(sql)` returns `{ command, rowCount, rows, … }`, and `db.execute(sql, 'objects')` the bare rows.
  - `@effect/sql-pg` cannot decode an `interval` result column. Read `extract(epoch from …)::float8` instead, which arrives as a number. A raw `bigint` arrives as a JS bigint.
  - `SET LOCAL` takes no bind parameter; use `set_config(name, value, true)`.
- **Claim queries.** `UPDATE … FROM (select … limit n for update skip locked)` is planned as a rescanned inner loop and can lock more than `n` rows. A `materialized` CTE does not.
- **Errors.** A query error is `EffectDrizzleQueryError`. Its `cause` is a `Cause` that holds the `SqlError` (corrected in piece 2), and its message carries the query's parameters. The reasons include `UniqueViolation` (with the violated `constraint`), `ConstraintError`, `LockTimeoutError` and `AuthorizationError`; a reason's own `cause` is the PostgreSQL error with its `code` and `constraint`.
- **drizzle-kit.**
  - It emits `ENABLE ROW LEVEL SECURITY`, never `FORCE`.
  - `generate --custom --name <name>` makes a custom migration.
  - Pending migrations run in one transaction and are selected by name.

### Build and Node

- **Module format.** `effect` and `@effect/*` are ESM only. Node 24.18 loads them through `require()` without a flag.
- **Server build.** With `bundle: false`, the build resolves `@asys/*` through an Nx runtime hook, and `nx serve` may run stale library builds. That is the reason for decision 6.
- **Typecheck target.** The inferred `typecheck` fails today, as described in 1.0.

### Browser platform

- **Angular service worker.** Its `navigationUrls` default serves `index.html` for `/capture?…`, since the query is ignored. `@angular/service-worker` and `@angular/pwa` are not installed yet.
- **Web Share Target.** A GET share target needs no service-worker code. It works for installed PWAs on Chrome for Android, not on iOS Safari.
- **Temporal.** It is not native in Node 24 or on iOS Safari.

## Facts checked on 2026-10-03 (piece 4)

Checked against effect 4.0.0, @effect/platform-node 4.0.0, drizzle-orm 1.0.0-rc.5-5935859, Nx 23.2.1 and SimpleWebAuthn 14.0.3 from JSR, mostly by running probes.

- **Open schemas.** A success schema that must encode values with `undefined` keys, such as SimpleWebAuthn's options, has to be `Schema.Any` cast to a typed codec. `Unknown`, `Json` and `Record` all answer 400.
- **A group defined by a library.**
  - A host-supplied error list needs `error: … as never` and explicit endpoint types, because the `error` option's guard cannot resolve generically.
  - `HttpApiBuilder.group` cannot be called with a generic identifier, so the handler builder casts the Api to a widened group type, and the layer back.
  - `isolatedDeclarations` cannot be used with Effect's class-extends patterns (TS9021).
- **CLI.**
  - `Flag.Int` accepts negatives.
  - A root command without a handler, run without a subcommand, prints its help and fails with `CliError.ShowHelp`.
  - `Command.run` reads the arguments from `Stdio`, and `Command.runWith(command, { version })(argv)` takes them explicitly.
- **Config.** `Config.schema(schema, NAME)` checks a value. A ConfigError names its variable only in its message; its cause holds `issue.path`. Tests use `ConfigProvider.fromEnvRecord`.
- **Logging.**
  - The default request logger and `Effect.logError(cause)` print a defect's message and stack. For drizzle that includes the query parameters.
  - `Logger.layer([...])` replaces the logger only when it is provided around the whole program.
  - A logger gets `{ message, logLevel, cause, fiber, date }`. Annotations come from `fiber.getRef(References.CurrentLogAnnotations)`.
  - `NodeRuntime.runMain` logs a failure itself unless `disableErrorReporting: true`.
- **Drizzle and PostgreSQL.**
  - `bytea` comes back as a view over a shared pool buffer.
  - A regex allows at most 255 in a bounded repetition.
  - A nested `withOwner` is a savepoint, rolled back only when the inner effect fails. An SQL error caught inside it leaves the outer transaction aborted.
- **Cookies.**
  - `securitySetCookie(security, value, { path: '/', sameSite: 'lax', maxAge: '30 days' })` gives `Max-Age`, `Path`, `HttpOnly`, `Secure` and `SameSite`. Clearing goes through `HttpEffect.appendPreResponseHandler` with `HttpServerResponse.expireCookie`.
  - A missing or malformed cookie reaches the middleware as an empty credential. With duplicate names the first cookie wins.
  - Safari refuses a Secure cookie over `http://localhost`; Chrome and Firefox accept it.
- **Serving.**
  - Nothing checks `Origin` or limits the body by default. `HttpServerRequest.MaxBodySize` resets the connection on the Node server only.
  - `Layer.provideMerge(HttpRouter.serve(app, …), NodeHttpServer.layer(…))` keeps `HttpServer` in the output, so port 0 can be read back.
- **SimpleWebAuthn 14.0.3.**
  - `generateRegistrationOptions` takes `userID: Uint8Array` and mutates the `authenticatorSelection` it is given. `generateAuthenticationOptions` defaults to `userVerification: 'preferred'` and a 60 s timeout.
  - `requireUserVerification` defaults to true.
  - A stored and reported counter of 0 passes; otherwise the reported counter must be strictly greater.
  - A bad signature returns `verified: false`; most other bad input throws.
- **JSR through pnpm 11.22.**
  - The lockfile aliases a JSR package to `@jsr/<scope>__<name>`.
  - Nx treats it as an npm alias: `@nx/esbuild` keeps it external, and `generatePackageJson` writes `npm:@jsr/…`, which a frozen install resolves.
  - `pnpm audit` queries the `@jsr/` name, under which no advisories are filed.

## Facts checked on 2026-10-03 (piece 5)

Checked against Angular 22.2.1, Nx 23.2.1, Effect 4.0.0, ng-openapi-gen 1.1.0, Terrazzo 2.7.1, Vitest 5.0.2 with jsdom 30.1.1, oxlint 1.85.0 and SimpleWebAuthn browser 14.0.0 from JSR, by running probes in throwaway worktrees.

- **OpenAPI names from Effect.**
  - The `identifier` annotation names a component; a schema without one is inlined. Structs, tuples, unions and enums keep the bare name; error classes are named `<Name>Encoded`.
  - Two schema instances with the same identifier become `X` and `X_1`, and so does re-annotating a named schema: `HttpApiSchema.status(201)` re-annotates, which is why the passkey list item stays unnamed.
  - `Schema.TaggedUnion` cannot name its members; a `Schema.Union` of annotated `TaggedStruct`s with `Schema.toTaggedUnion('_tag')` can.
  - `Schema.Enum` is emitted as an `anyOf` with a title per value, so ng-openapi-gen's `enumStyle: "upper"` has no effect and the generated enums are string-literal unions.
- **ng-openapi-gen 1.1.0.**
  - `input` and `output` resolve against the working directory. Dotted operation ids become `fn/<group>/<group>-<op>.ts` functions such as `dataSnapshot`.
  - Every function module has a top-level `fn.PATH = …` side effect, so importing through the barrel bundles every operation; importing each function from its own file tree-shakes.
  - A query `Schema.Int` is generated as a string parameter. `{}` (an open schema) becomes `any`, `prefixItems` a tuple, `{type: 'null'}` a nullable union.
  - The two operations without a success body use `responseType: 'text'`, so their error bodies reach the caller as JSON strings.
- **Nx caching.** A `dependentTasksOutputFiles` input matches only the outputs of DIRECT dependencies unless `transitive: true`: `pwa:typecheck` hashes the generated client with `**/*.ts` (`**/openapi.json` there matched nothing and gave a stale cached green after a contract change). A required new contract field fails `server:build` before the PWA guard sees it; an optional one reaches the guard.
- **Angular 22.2.1.**
  - Zoneless and OnPush are the defaults; fetch is the default HTTP backend (`withFetch` is deprecated).
  - `@Service()` means `providedIn: 'root'` by default, and TestBed overrides it like any provider.
  - Signal Forms are stable in `@angular/forms/signals`. A `FormValueControl` gets `errors` before any touch and reports a touch through a `touch` output. `FormRoot` always prevents the default submit and calls `submit()` only when the form has a `submission` option.
  - `resource()` takes `params` and `loader`; reading `value()` in the error state throws.
  - `provideAppInitializer` blocks startup only when its function returns a promise or an observable.
  - `debounced` is experimental and `withRouterResources` a developer preview; `injectAsync` is stable; selectorless components are not usable.
  - `SwUpdate` has no `providedIn`; only `provideServiceWorker` provides it.
  - The service-worker generator works through `nx g @schematics/angular:service-worker`, but `navigationUrls` replaces the defaults, so they are listed explicitly; `ngsw.json` always has a `dataGroups` key.
- **The unit-test builder.**
  - It picks jsdom when happy-dom is absent and refuses `vi.mock` of relative imports; `vi.mock` of a package works.
  - Under fake timers `fixture.whenStable()` hangs, because the zoneless scheduler's timers are faked; `vi.advanceTimersByTimeAsync(0)` runs both promise continuations and change detection.
  - `animate.enter` and `animate.leave` do nothing in jsdom (it has no `getAnimations`).
  - jsdom has no `matchMedia` and no `navigator.clipboard`, and its `Intl.supportedValuesOf('timeZone')` does not list `UTC`.
  - A `resource()` reload after a params change starts on the next `TestBed.tick()`.
  - The development build type-checks every component template, reached by a route or not; plain `tsc` checks none.
- **Terrazzo 2.7.1.**
  - The `.mts` config is loaded through vite-node, and `tokens` and `outDir` resolve against the working directory.
  - plugin-css `permutations` select resolver contexts per block; `prepare` must indent the first declaration itself.
  - `variableName` sets the leaf names; `legacyHex` gives hex (the default is `rgb()` percentages); a `transform` that returns `undefined` falls back to the default.
  - Only the default context is linted. Contexts that a permutation names are alias-resolved, and the others are not touched unless a plugin applies them.
  - Every token's description is printed as a comment, and declarations are always sorted.
- **oxlint 1.85.**
  - An override replaces a rule's options rather than merging them.
  - `no-restricted-imports` supports `allowTypeImports` per pattern and negated `group` entries. A `regex` lookahead silently matches nothing, and `**/generated/**` does not match the bare folder.
  - `.gitignore` alone makes oxlint's directory walk, `nx format:check` (oxfmt) and `check-spdx.mts` skip the generated client.
- **SimpleWebAuthn browser 14.0.0.**
  - A cancelled prompt rejects with a `WebAuthnError` whose code is `ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY`, whose name is the cause's `NotAllowedError`, and whose cause is the DOMException.
  - A DOMException passed through raw has a numeric legacy `code`.
  - Without WebAuthn the library throws a plain Error.
  - The JSON responses are assignable to the generated request bodies without casts.
- **Dev serving.**
  - Nx loads the root `.env` into every task, and the Angular dev server takes `PORT` from the environment even over an explicit `port` option; a project's `.env.<target>` file wins over the root `.env`.
  - The Vite proxy keeps `Origin` and `Set-Cookie`.
  - The Claude desktop app's browser pane cannot fetch service-worker scripts, so the service worker is checked in Chrome.
  - `@nx/web:file-server` implements `spa` as a proxy to itself, so a `proxyUrl` to the API breaks deep links; `scripts/serve-pwa.mts` replaces it.
  - Node's `listen(…, 'localhost')` bound only `::1` here.

## Facts checked on 2026-10-04 (piece 6)

Checked against Angular 22.2.1, Vitest 5.0.2 with jsdom 30.1.1, Node 24 and Chrome 152, by running probes in throwaway worktrees.

- **Signal Forms with non-string controls.**
  - `[formField]` binds custom `FormValueControl`s of `boolean | null`, `number | null` and `DateSpec | null` under strict templates. An object-valued `DateSpec` binds as one leaf value, not as a field tree, and flows both ways.
  - `validate()` runs on `null` at creation, so a control gets `errors` before any touch; the `touched() && errors().length` pattern hides them until then.
  - `submit()` marks every field touched, including untouched ones. On an invalid form the action does not run and `onInvalid` does.
  - `disabled(path, { when: () => flag() })` reaches the control and its native input; the `disabled(path, logicFn)` overload is deprecated.
  - A `[disabled]` binding next to `[formField]` is a compile error (`FORM_FIELD_UNSUPPORTED_BINDING`), so read-only state goes through the schema.
  - `f().reset(value)` replaces the model and clears touched and dirty; `model.set` alone does not reset touched.
- **Native inputs in jsdom.**
  - A date input sanitises invalid dates (`2026-02-30`) to `''`. A time input rejects `24:00` and `9:05`, and keeps seconds (`09:05:30`) with or without `step`, so code cuts them off.
  - `[value]` on a `<select>` with `@for` options is unreliable, because it applies before the options exist; `[selected]` on each option works.
  - `focus()` needs the component host attached to `document.body`. `afterNextRender` runs during `fixture.whenStable()`.
- **The router.**
  - The route component is reused when only its params change; its bound input updates. A component inside `@for (id of [id()]; track id)` is recreated with fresh state.
  - `router.lastSuccessfulNavigation` is a Signal. Its `previousNavigation` is `null` on the first navigation, and it means "the router navigated before", not "history has an entry to go back to".
  - The router uses the first match, so `settings/areas/new` is listed before `settings/areas/:areaId`.
  - In tests, `Location.back()` moves the router only after `router.initialNavigation()`, which sets up the popstate listener.
- **Angular.** A `linkedSignal` computation runs tracked, so reading other signals in it makes them sources; read them under `untracked`. `@Service({ autoProvided: false })` is the form for a service each screen provides itself.
- **Budgets.** Every ported component style stays under the 4 kB `anyComponentStyle` warning; the largest, TriageCard, is 2.72 kB minified. With Now, Inbox and `/capture` eager, the initial bundle grew from 403.74 kB (111.72 kB transferred) to 480.83 kB (127.18 kB).
- **Time zones.** Chrome 152's `Intl.supportedValuesOf('timeZone')` lists 418 zones and neither `UTC` nor `Etc/UTC`, as in Node 24 and jsdom, so Settings adds `UTC` itself.
