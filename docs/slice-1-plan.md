<!-- SPDX-License-Identifier: EUPL-1.2 -->
# Slice 1 build plan

This plan cuts [Slice 1 of the MVP plan](mvp-plan.md#slice-1-foundations-and-the-task-loop) into seven pieces. Each piece ends green and is committed on its own. It was drawn up on 2026-09-30.
- It is based on the ADRs, the scenarios, and the stack trial in [research/trial-effect-drizzle.md](research/trial-effect-drizzle.md).
- The installed packages were checked the same day.
- An adversarial review then checked it, and its confirmed findings are folded in.

Pieces 1 to 3 are specified in full. Pieces 4 to 7 are outlined only as far as they constrain the earlier pieces, and each gets a short re-plan before it starts.

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

These are logged in `libs/domain/CHANGELOG.md` under `RULES_VERSION` 0.1.0.

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

The one server process keeps them, with a 5-minute TTL. They are keyed by the challenge inside `clientDataJSON`.

### 8. One lock orders each owner's writes

Every per-owner write transaction takes the owner's `change_counters` row `FOR UPDATE` as its first statement. That one lock:
- numbers the change log in commit order;
- serialises the User's commands, so cycle checks, expectation checks and idempotency inserts cannot race;
- fixes the lock order for jobs: the counter first, then `jobs` rows.

### 9. Pre-owner lookup functions keep exactly ADR 0007's shape

- **Shape.** Each takes the exact key and returns only `(owner_id, id)`. The lookup role reads only the key and owner columns.
- **Expiry and one-time use** are checked afterwards, under `withOwner`.
- **The two functions that read across owners:**
  - `claim_jobs`, which ADR 0012 allows;
  - `oldest_due_job_age()`, which returns only an interval. Piece 3 adds a one-line note on it to ADR 0012.

### 10. SPDX headers

- **Which files.** Every file with comment syntax carries a header, including drizzle's `migration.sql`.
  - This is safe because the migrator selects migrations by name, not by hash.
  - Newly generated migrations get the header right after generation.
- **Exempt:** JSON, lockfiles, `LICENSE*`, `.gitkeep` and binary assets.
- **Licence by location:** `EUPL-1.2` everywhere, and `MPL-2.0` under `libs/domain` and `libs/contract`.
- **REUSE.** Added 2026-10-01: the repository follows REUSE 3.3. The header stays the identifier line alone. A root `REUSE.toml` supplies every file's copyright notice and the licence of the exempt files, the licence texts are also kept in `LICENSES/`, and `reuse lint` runs in CI next to `scripts/check-spdx.mts`.

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
- `.github/workflows/cd.yaml` (named CD, it will deploy later too) runs on push and on pull requests, with independent jobs that run in parallel on `ubuntu-24.04` with Node 24, after an `audit` job (`pnpm audit --prod`) that gates them all. There is no CI shell script and no Nx Cloud.
  - `lint`: `nx run-many -t lint`.
  - `typecheck`: `nx run-many -t typecheck` and `tsc -p scripts/tsconfig.json`.
  - `build`: `nx run-many -t build`.
  - `test`: write `.env` with random passwords and both `DATABASE_URL_*` values, `docker compose up -d --wait`, apply the migrations with `drizzle-kit migrate`, run the ADR 0009 smoke import `node --input-type=module -e "await import('drizzle-orm/effect-postgres')"`, then `nx run-many -t test --skip-nx-cache`.
  - `format`: `nx format:check --all`.
  - `licences`: `node scripts/check-spdx.mts`, `reuse lint` and `node scripts/check-licenses.mts` (the dependency licence allowlist).
  - Each job calls the reusable workflow `.github/workflows/pnpm-job.yaml` (`on: workflow_call`), which holds the checkout, the pnpm setup and, behind a `database` input, the `.env`, compose and migration steps; the pnpm setup installs with a frozen lockfile.
  - Check the current versions of `actions/checkout` and `pnpm/setup` before writing it.

### Domain layout

This is `libs/domain/src/lib/`: MPL-2.0, with no import beyond `temporal-polyfill`.

```
time/        local-date.ts (LocalDate, LocalTime, DateSpec, parse and validate), zoned.ts (startOfDay, availableFromInstant, dueInstant, addCalendarDays; Temporal only here)
area/        active-hours.ts (ActiveHours: per ISO weekday, a list of [startMinute, endMinute) intervals; isWithinActiveHours(area, instant, tz); the Work and Personal seeds)
task/        task.ts (types), inbox.ts, blocked.ts (BlockedReason union), available.ts, deadlines.ts (isOverdue, effectiveDue, latestStart), priority.ts (isUrgent, quadrant)
picker/      picker.ts (pick returns { ranked, waiting }; Reason; an open ExclusionReason union), reason-text.ts
commands/    command.ts (TransitionResult: applied{changes}, notApplicable{reason} or rejected{reason}; Change: {entity, op: 'put' or 'remove', after}), task-, blocker-, area-, settings- and review-commands.ts
rules-version.ts   RULES_VERSION = '0.1.0', with libs/domain/CHANGELOG.md
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
- **Entity schemas** mirror the domain types.
  - A `.test-d.ts` type test checks that each `Schema.Type` equals its domain type.
  - It needs vitest's `typecheck.enabled` with a `typecheck.tsconfig` that includes the file; otherwise it checks nothing (ADR 0009).
  - Seeing it red once is part of the unit.
  - Ids are UUID strings in the contract, and text fields reject NUL; both only narrow values, so `Schema.Type` stays `string`.
- **`Command`** is a `Schema.TaggedUnion` of the slice 1 commands, mirroring the domain's `Command`. Each has:
  - `idempotencyKey`, a UUID;
  - an optional `expect`, only where the domain has one (settled in piece 1): `{ status?, version? }` on Triage, edit, log progress, complete and drop, and `{ version? }` on updating an Area;
  - a static `commandMeta[tag].offline` flag, true for capture, Triage, edit, log progress, complete and drop.
- **`CommandResult`** is either `Applied{ seq }` or `NotApplicable{ reason, reviewItemId }`. `Rejected{ reason }` is returned as a 422 error.
  - `Applied.seq` is the counter's `last_seq` after the command. A command that changes nothing leaves it unchanged.
- **The rest:**
  - `ChangeEntry`: `{ seq, entity, id, op, after? }`
  - `Snapshot`: `{ seq, tasks, blockers, areas, reviewItems, settings }`
  - `Meta`: `{ rulesVersion, apiVersion, settings }`

### 2b. Tables, migrations, RLS tests and `createOwner`

**The owned-table helper.** Every owned table is built with:
- `pgTable.withRLS()`, since `.enableRLS()` is deprecated;
- `owner_id uuid not null`;
- the one `pgPolicy`, `nullif(current_setting('app.owner_id', true), '')::uuid`.

**Migrations**
- Each generated migration is followed by a `--custom` one holding `FORCE ROW LEVEL SECURITY` and the grants to `asys_app`. The pattern is `apps/server/drizzle/20260928200755_force_rls_grants_lookup/migration.sql`.
- Composite foreign keys, `(owner_id, x_id)` referencing `(owner_id, id)`, keep links within one owner, because foreign-key checks bypass row-level security.

**The tables**

| Table | Columns and constraints |
|---|---|
| `users` | `owner_id` (primary key), `name`, `created_at` |
| `settings` | `owner_id` (primary key), `time_zone`, `urgency_window_days` |
| `areas` | |
| `tasks` | enums `task_kind`, `task_status`, `voice` and `privacy`; separate `*_date` and `*_time` columns, with checks that a time needs a date and that `estimate_minutes > 0` (a `*_time` column holds `'HH:MM'` text, or the mapper formats it to that, since the domain rejects `'HH:MM:SS'`); `due_move_count`, `capture_text`, `version` |
| `task_blockers` | `id`, `task_id`, `blocker_id`; unique `(owner_id, task_id, blocker_id)`; check `task_id <> blocker_id` |
| `review_items` | a unique index on `(owner_id, dedupe_key)` where `resolved_at is null` |
| `change_log` | `owner_id`, `seq`, `entity`, `entity_id`, `op`, `data jsonb`, `created_at`; primary key `(owner_id, seq)` |
| `change_counters` | `owner_id` (primary key), `last_seq`, `pruned_through` |
| `idempotency_keys` | `owner_id`, `key`, `command`, `request_hash`, `result jsonb`, `created_at`; primary key `(owner_id, key)` |

**`createOwner(ownerId, name, timeZone)`** creates the user, the settings, the seeded Areas and the counter row.

**Tests**
- **The table-enumerating test** connects as `asys_app`.
  - It reads `pg_class` (relkind `r` and `p`), `pg_attribute` and `pg_policy`. It avoids `information_schema`, which hides tables the role has no grant on.
  - It excludes `pg_catalog`, `information_schema`, `pg_toast` and `drizzle`.
  - For each table it asserts:
    - `owner_id uuid not null`;
    - `relrowsecurity` and `relforcerowsecurity`;
    - exactly one policy: permissive, command ALL, roles `{public}`;
    - both `USING` and `WITH CHECK` normalise to the one expression.
- **Isolation tests.** a, b, c, d and f are ported from `with-owner.spec.ts` to `tasks`, with two owners. Its `findSqlError` and `assertRejectedByRls` move to `apps/server/src/test/`.
- **Composite foreign keys.** A link to another owner's Task is rejected.
- **Red checks through `psql`,** each restored afterwards:
  - `NO FORCE`;
  - a changed policy expression;
  - a table without `owner_id`.

### 2c. Change log and command executor

**`ChangeLog.append`** takes its seq from the locked counter row. Entries are after-images in the contract shape.

**`CommandExecutor.run(ownerId, command)`** runs in one `withOwner` transaction:
1. Lock the counter row.
2. Look up the idempotency key. A repeat returns the stored result; the same key with a different request hash is rejected.
3. Load the state the transition needs.
4. Run the domain transition.
5. Persist the changes and their log entries.
6. On `notApplicable`, create a Review item of kind `command_not_applicable`. It holds the command and gets its own change-log entry.

A client id that collides (a UniqueViolation) becomes Rejected, not a 500.

**Tests**
- **The Done-then-Drop replay:**
  1. Completing gives Applied.
  2. Dropping with `expect.status = 'open'` gives NotApplicable, with its Review item and log entry in the same transaction.
  3. Replaying either key returns the identical stored result and no second Review item.
- **Concurrency:**
  - 50 parallel commands, with a concurrent poller, see seqs 1 to n with no gap and none missed.
  - Two concurrent requests with one idempotency key give one result and no error.
  - Concurrent `addBlocker` A→B and B→A: exactly one applies.
- **Red checks:**
  - Replacing the counter with `nextval()` must break the poller test.
  - Removing the leading `FOR UPDATE` must fail the idempotency and cycle tests.

### 2d. Snapshot and `since`

- `withOwner` gains an optional `isolationLevel`.
- `Snapshot.read` runs at repeatable read. It returns:
  - the Open and Delegated Tasks;
  - the links whose blocked Task is in the working set;
  - the Areas;
  - the open Review items;
  - the settings;
  - the counter's `last_seq`.
- `ChangeLog.since(after)` returns the entries after `after`. It fails with `Expired` when `after < pruned_through`.
- **Tests:**
  - A snapshot taken during concurrent writes is consistent with its seq.
  - `since` returns exactly the entries after it.

## Piece 3: jobs

### 3a. Table, claim and dedupe

**The `jobs` table** is owned.

| Column | Notes |
|---|---|
| `id`, `kind`, `payload jsonb`, `run_at` | |
| `cron text null` | evaluated in the owner's Current time zone |
| `dedupe_key text null` | unique on `(owner_id, dedupe_key)` |
| `attempts`, `claimed_until`, `last_error`, `finished_at`, `failed` | |

Inserting an existing dedupe key moves `run_at` and resets `finished_at`, `failed` and `attempts`.

**`claim_jobs(lease interval, max int) returns table(id uuid, owner_id uuid)`**
- Declared `VOLATILE` and `SECURITY DEFINER`, using `FOR UPDATE SKIP LOCKED`.
- Owned by `asys_lookup`. Its privileges:
  - SELECT on `(id, owner_id, run_at, claimed_until, finished_at, attempts)`;
  - UPDATE on `(claimed_until, attempts)`.
- The handover follows the trial's `lookup_role` migration: `GRANT CREATE` only for the duration of the handover.
- Any `SET ROLE` in a migration is followed by `RESET ROLE` in the same file, because drizzle runs every pending migration in one transaction.

**`oldest_due_job_age() returns interval`** ignores finished and failed rows. ADR 0012 gets the note from decision 9.

**Tests**
- A claim across two owners while no owner is set. This replaces trial test e.
- Two concurrent claimers never claim the same job.
- A dedupe move.
- The age query.

### 3b. Worker, backoff, cron and prune

**`JobRegistry.register(kind, handler)`** is the extension point for add-ons.

**The worker** is a polling fiber that claims a batch and runs each job in `withOwner(job.owner)`. That transaction takes the counter lock first (decision 8), and finishes the row only `where run_at = <claimed run_at>`.
- **On success:**
  - A cron row gets its next `run_at` from `Cron.next`, counted from now, so a run missed during downtime executes once. Its `attempts` resets.
  - Any other row gets `finished_at`.
- **On failure:**
  - `run_at` moves by the delay of an Effect `Schedule`: `exponential('1 second')`, jittered, capped by `min` with `spaced('1 hour')`.
  - The schedule is stepped `attempts` times, with a seedable `Random` for the tests.
  - After 8 attempts the row is marked `failed` and gets `finished_at`.

**The `prune` job** is a daily per-owner cron row, added to `createOwner` here. It:
- deletes `change_log` rows older than 30 days and sets `pruned_through`;
- deletes `idempotency_keys` older than 30 days.

**Tests**
- The backoff progression.
- A missed cron run runs once.
- A success resets `attempts`.
- Prune, then `since()`, gives `Expired`.
- The worker racing a command that moves the same job does not deadlock.

**Dropping the trial**
- One migration drops `trial_items` and `trial_item_owner`: `SET ROLE asys_lookup; DROP FUNCTION …; RESET ROLE;`.

## Piece 4: HTTP API and sign-in (outline)

**Server**
- The bundled ESM build of decision 6, with `@types/node` ^24.
- `main.ts` composes `HttpApiBuilder.layer(Api)`, `HttpRouter.serve`, `NodeHttpServer.layer` and the job worker.
- It reads `Config`: `PORT`, `DATABASE_URL_APP`, `ASYS_PUBLIC_ORIGIN`, `ASYS_RP_ID`, and optionally `ASYS_STATIC_ROOT`.

**The `Auth` middleware**
- `HttpApiSecurity.apiKey({ key: 'asys_session', in: 'cookie' })`.
- It rejects an empty credential and provides `CurrentOwner`.
- The cookie is set with `path: '/'`, HttpOnly, Secure and SameSite=Lax.

**Endpoints**

| Method and path | Notes |
|---|---|
| `POST /v1/commands` | the only mutation route for domain data |
| `GET /v1/snapshot` | |
| `GET /v1/changes?after=n` | 410 `Expired` for a pruned number |
| `GET /v1/meta` | |
| `signup/options`, `signup/verify` | token from the link's `#fragment`, plus the device time zone |
| `signin/options`, `signin/verify` | discoverable credentials |
| `recover`, `signout`, `me` | |
| passkeys: list, add, remove | |
| recovery codes: regenerate | |
| `GET /health` | reports `oldestDueJobAgeSeconds` |

- The auth endpoints are not domain commands, so they are exempt from the one-mutation-route rule.
- OpenAPI is written by a build target through `OpenApi.fromApi`. It is not served.

**Tables**
- `passkeys`.
- `recovery_codes`: SHA-256 of 80-bit codes, 10 per set.
- `sessions`: SHA-256 of a 32-byte token, valid for 30 days.
- `sign_up_links`: carries the pre-allocated `owner_id`.
- `sign_in_identities (provider, subject)`: stays empty until Stage 7.

**Lookup functions**
- `lookup_passkey`, `lookup_session`, `lookup_recovery_code` and `lookup_sign_up_link`, all in the shape of decision 9.
- Expiry and one-time use are checked afterwards under `withOwner`.

**Libraries and CLI**
- `@simplewebauthn/server` and `@simplewebauthn/browser` 14.x (MIT), pinned exactly.
- The CLI uses `effect/cli`: `asys signup-link [--expires-in-days 7]` prints `${ASYS_PUBLIC_ORIGIN}/signup#token=…`.

**Tests**
- HTTP tests run through `HttpRouter.toWebHandler`, with the WebAuthn verifier behind a service that tests stub.
- Real passkeys are tried by hand in a browser on localhost.

## Piece 5: PWA shell and data client (outline)

**Service worker and manifest**
- `@angular/service-worker` 22.1.x, added with `@schematics/angular:service-worker`. Running it through `nx g` is unverified; the fallback is to set it up by hand.
- `ngsw-config.json` excludes `/v1/**` from `navigationUrls`.
- A hand-written `manifest.webmanifest` with icons and a GET `share_target` to `/capture?title&text&url`.

**Dev setup**
- `proxy.conf.json` sends `/v1` to the server.
- In development the RP ID is `localhost` and the origin `http://localhost:4200`.

**The data client** is one signal store. It:
- loads the snapshot;
- polls `changes` on an interval and on focus;
- reloads on 410;
- sends commands with `crypto.randomUUID()` keys;
- derives Now through `@asys/domain`.

**Screens**
- Sign-up: name, then a passkey, then the recovery codes, shown once.
- Sign-in.
- Recovery sign-in, followed by a prompt to add a passkey.

**Time zone.** The PWA reports the device time zone when it differs from the server's.

**Testing.** There are no PWA unit tests (ADR 0010). It is checked end to end in a browser.

## Piece 6: PWA Task screens (outline)

- Quick add, and the `/capture` share route.
- The Inbox: untriaged Tasks and open Review items, with Triage one at a time.
- The Task editor: its fields, a blockers picker, log progress, complete and drop.
- Now: the ranked list with reason lines, and a collapsed Waiting list.
- Areas with their Active hours.
- Settings: the Urgency window and the time zone.

Components stay thin, and the logic stays in `libs/domain`.

## Piece 7: deployment and phone check (outline)

- Fix the public hostname (open question 11 in the MVP plan) before any passkey is enrolled.
- Build a Node 24 image. It serves the PWA through `HttpStaticServer` with SPA fallback, on the same origin.
- Run Compose on the VPS behind the existing TLS reverse proxy. Migrations run as `asys_owner`.
- The phone check:
  1. Run `signup-link`.
  2. Enrol a passkey on the phone.
  3. Install the PWA.
  4. Share text from another Android app into the Inbox.

## Facts checked on 2026-09-30

These were checked against the installed packages (Effect 4.0.0-rc.117, drizzle-orm 1.0.0-rc.5-5935859, Nx 23.2.1) and the npm registry. Effect was moved to rc.118 on 2026-10-01: its new module paths (`effect/http-api`, `effect/http`, `effect/cli`) were checked then, the API details below were not. Closed sets in the domain are string enums with these values (piece 1). Recheck anything that has had a version change since.

### Versions and licences

| Package | Version and licence | Notes |
|---|---|---|
| `@simplewebauthn/server` | 14.0.3, MIT | Node 20 or later, ESM and CJS |
| `@simplewebauthn/browser` | 14.0.0, MIT | `startRegistration({ optionsJSON })` and `startAuthentication({ optionsJSON })` |
| `temporal-polyfill` | 1.0.5, MIT | about 20 kB gzipped |
| `@js-temporal/polyfill` | ISC | |
| `fast-check` | 4.10.2, MIT | |
| `@fast-check/vitest` | 0.5.0 | accepts vitest 5 |
| `effect` | 4.0.0-rc.118 | used, with a tsconfig paths entry for drizzle's type import of `effect/unstable/sql/SqlError` (ADR 0009) |
| `tslib` | 0BSD | |
| `split2` | ISC | |

### HttpApi (`effect/http-api`)

- **Definition.** `HttpApi.make(id).add(group).prefix('/v1')`. `.prefix()` and `.middleware()` apply only to groups and endpoints added before them.
- **Endpoints.** `HttpApiEndpoint.get/post(name, path, { params, query, payload, success, error })`. Query values are coerced, so `Schema.Int` works for `?after=5`.
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
- **Cron.** `Cron.parse(expr, tz)` and `Cron.next(cron, now)` handle DST.
- **Schedule.** `Schedule.exponential`, `jittered`, `min`, `spaced` and `upTo`. Jitter before `min`, or the cap is overshot by up to 20%.
- **CLI.** `effect/cli`: `Command.make`, `Flag.String` and `Flag.Int`, `Command.run`, with `NodeServices.layer`.

### Drizzle

- **Transactions.**
  - `db.transaction(fn, { isolationLevel })`.
  - A nested `tx.transaction` becomes a savepoint.
  - Statements through `db` or `PgClient` inside the callback join the transaction.
- **Row locks.** `.for('update', { skipLocked: true })` exists.
- **Errors.** A query error is `EffectDrizzleQueryError`, with the `SqlError` as its `cause`. The reasons include `UniqueViolation` and `AuthorizationError`.
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
