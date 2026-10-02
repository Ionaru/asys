<!-- SPDX-License-Identifier: EUPL-1.2 -->
# Slice 1, piece 2: contract and database core

## Context

Piece 1 (commit 7e5edc3) built the pure domain in `libs/domain`: types, derived state, the Picker and 13 Task-loop transitions behind `applyCommand(state, command, now)`. Piece 2 of [docs/slice-1-plan.md](docs/slice-1-plan.md) gives those rules a home:
- an Effect Schema contract library (`libs/contract`);
- the slice 1 tables under forced row-level security, guarded by a test that enumerates every table;
- the per-owner change log, and a command executor with idempotency and not-applicable Review items;
- the snapshot and `since` reads.

Pieces 3 to 5 (jobs, HTTP API, PWA data client) call exactly these APIs, so their shapes are fixed here. The piece ends verified and stops for your review. It becomes one commit when you say so, and nothing is pushed.

All API names below were checked on 2026-10-02 against the installed packages: effect 4.0.0-rc.118, drizzle-orm and drizzle-kit 1.0.0-rc.5-5935859, Nx 23.2.1. An adversarial review (four lenses plus a judge) checked this plan, and its 21 confirmed findings are folded in. The evidence is in the session scratchpad (`effect.md`, `drizzle.md`, `nx.md`, `review-verdicts.md`).

## Decisions this piece takes (please check)

1. **Primary keys are `(owner_id, id)`** on `areas`, `tasks`, `task_blockers` and `review_items`.
   - The composite foreign keys need a unique `(owner_id, id)` anyway.
   - A client-made id can then never collide with, or probe for, another owner's row.
   - **Ids are lowercase UUIDs only**, so an id string always equals its Postgres text form. Postgres lowercases uuids, while the domain compares ids with `===`.
   - Consequence: the slice plan's "a colliding client id becomes Rejected" can no longer be reached through a command. The domain already rejects a same-owner duplicate (`duplicate_id`).
   - The executor still maps a UniqueViolation on one of the four entity primary keys to `CommandRejected(duplicate_id)`. Any other UniqueViolation, which would mean a missing lock, propagates as an error.
2. **A Rejected command stores nothing**, not even its idempotency key: the transaction rolls back. A retry with that key is evaluated afresh. Only Applied and NotApplicable results are stored and replayed.
3. **`changesSince` returns `{ seq, entries }`**, where `seq` is the head read in the same repeatable-read transaction.
   - A client can tell when it is caught up, so a page limit can be added later without breaking `/v1`.
   - It fails with `ChangesExpired` when `after < pruned_through` or when `after > last_seq`. The second case only happens after a database restore, and the client must reload.
4. **`ChangeEntry` mirrors the domain `Change` plus `seq`.** A settings entry has no `id`; `change_log.entity_id` is null exactly for settings rows.
5. **Least-privilege grants** to `asys_app` per table, listed in unit 2.
   - `asys_app` deletes only `task_blockers` rows.
   - DELETE on `change_log` and `idempotency_keys` waits for piece 3's prune job.
   - Tests clean up as `asys_owner`, which FORCE still binds.
6. **Contract errors carry no HTTP status yet.** `CommandRejected`, `IdempotencyKeyReused` and `ChangesExpired` are `Schema.TaggedError` classes now. Piece 4 adds `httpApiStatus` when it declares the endpoints.
7. **Number types in the contract.**
   - **Numbers the domain validates are `Schema.Finite` in commands:** estimate, remaining minutes, urgency days and Active-hours minutes. A fraction then reaches the domain and gets its specific Rejected reason.
   - **Server-produced numbers are `Schema.Int`:** seq, version, instants and counters.
8. **Text rejects NUL and unpaired UTF-16 surrogates.** Postgres text and jsonb reject both, which would otherwise turn client input into a 500.
9. **Names.**
   - Schema values end in `Schema` (`TaskSchema`, `CommandSchema`), because the server imports them next to the same-named domain types.
   - Contract-only types are `CommandRequest` (a domain `Command` plus `idempotencyKey`), `CommandResult`, `ChangeEntry`, `Changes`, `Snapshot` and `Meta`.
   - Server entry points are plain functions: `createOwner`, `lockCounter`, `appendChanges`, `changesSince`, `readSnapshot` and `runCommand`.
10. **The drizzle schema states its enum values as string tuples** and types the columns with `.$type<DomainEnum>()` through `import type`.
    - drizzle-kit loads `schema.ts` with jiti, which resolves the `@asys/domain` alias against `apps/server/` and fails.
    - A type import is erased before resolution, so it is safe.
    - Tests pin each tuple to its domain enum.

## How it is built

This follows `~/.claude/CLAUDE.md`. I plan, write each unit's contract and briefs, reconcile and verify.
- **Workers.** Each unit with testable behaviour gets an `implementer` and a `test-writer`, both `model: 'sonnet'` and without a `name`. They are launched together from the same contract, and the test-writer never sees the code.
- **Order.** Units run one after another in this checkout, and only the implementer builds while a pair is active.
- **Escalation.** After two failed fix rounds, a unit is rerun on Opus or I take it over.
- **Proof.** Each unit ends by proving its tests can fail: one covered behaviour is broken, the assertion is seen failing, and the code is restored.

**Rules every brief repeats**
- Database tests need `docker compose up -d --wait` and `pnpm exec drizzle-kit migrate --config apps/server/drizzle.config.ts`, and always run with `--skip-nx-cache`.
- **Clock.** Inside `layer(...)`, TestClock is frozen and shared by the block.
  - No test uses `Effect.sleep`, `Schedule` or `Effect.timeout`.
  - A test that depends on time calls `TestClock.setTime(1_000_000)` itself and sits in its own `layer` block.
  - The concurrency specs use `layer(appDatabase(), { excludeTestServices: true })`.
- **Fibers.** Fork with `Effect.forkChild`; `Effect.fork` does not exist in rc.118.
- **Snapshots.** Snapshot arrays are unordered, so sort them by id before comparing.
- **Red checks against the database** use `docker compose exec -T postgres psql -U asys_owner -d asys`. It connects over the socket with no password (psql is not on the host), and every change is restored afterwards.

### Unit 0: scaffold and moves (me, no pair)

**The contract library**
- Generate it: `nx g @nx/js:library --directory=libs/contract --name=contract --bundler=tsc --unitTestRunner=vitest --linter=oxlint --tags=scope:contract`. This adds `@asys/contract` to the `tsconfig.base.json` paths.
- Replace the placeholders:
  - delete `src/lib/contract.ts` and its spec;
  - `src/index.ts` becomes a headered `export {};`.
- Licence and package, as `libs/domain` has them:
  - `LICENSE`, a copy of `libs/domain/LICENSE`;
  - `package.json` with `"license": "MPL-2.0"` and the dependency `"effect": "4.0.0-rc.118"`;
  - `README.md`;
  - MPL-2.0 SPDX headers on every file.
- TypeScript:
  - `tsconfig.lib.json`: `lib: ["es2023"]`, `types: []`, and `src/**/*.test-d.ts` excluded;
  - `tsconfig.spec.json`: `module: "esnext"`.
- Tests:
  - `vitest.config.mts` gets `passWithNoTests: true`;
  - the type-test wiring is copied from `apps/server`: `tsconfig.typecheck.json`, the `typecheck: { enabled, tsconfig, include }` block, and a placeholder `src/lib/wiring.test-d.ts` that unit 1 deletes.
- `project.json`:
  - the `typecheck` override from `libs/domain/project.json`, plus a third command, `tsc --noEmit -p tsconfig.typecheck.json`;
  - `LICENSE` in the build assets.
- `.oxlintrc.json` gets the `vitest/expect-expect` `assertFunctionNames` from `apps/server/.oxlintrc.json`.

**Module boundaries** (root `.oxlintrc.json`)
- A `scope:contract` constraint. It may depend on `scope:domain` and `scope:contract`, and it bans `drizzle-orm`, `drizzle-orm/*`, `@effect/sql-pg`, `@effect/platform-node*` and `@angular/*`.
- `scope:contract` is added to the server and pwa lists.

**Server moves** (behaviour unchanged)
- `findSqlError` moves from `with-owner.spec.ts` to `apps/server/src/db/sql-error.ts`, which is production code. It gains `uniqueViolationConstraint(error): string | undefined`.
- `assertRejectedByRls` moves to `apps/server/src/test/rls.ts`.
- `tsconfig.app.json` excludes `src/test/**`, and `tsconfig.spec.json` includes `src/test/**/*.ts`.

**Check:** `nx run-many -t lint typecheck build test -p contract server domain --skip-nx-cache` is green.

### Unit 1: contract schemas (pair)

**Files**
- Implementer: `libs/contract/src/lib/primitives.ts`, `entities.ts`, `commands.ts`, `results.ts`, `changes.ts`, `errors.ts`, `index.ts`.
- Test-writer: the `*.spec.ts` files and `entities.test-d.ts`, `commands.test-d.ts` and `changes.test-d.ts`. It also deletes the placeholder `wiring.test-d.ts`.

**Primitives**

| Schema | Definition |
|---|---|
| `UuidSchema` | `Schema.String.check(Schema.isUUID(), Schema.isLowercased())` |
| `TextSchema` | a string with no `\u0000` and no unpaired surrogate (`/[\uD800-\uDBFF](?![\uDC00-\uDFFF])\|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/`), through `Schema.makeFilter` |
| `LocalDateSchema`, `LocalTimeSchema` | the domain's `isLocalDate` and `isLocalTime` |
| `DateSpecSchema` | `Struct({ date, time: optionalKey(LocalTime) })` |
| `InstantSchema` | `Schema.Int` |

Every check keeps `Type` as a plain string or number.

**Entities**
- `TaskSchema`, `BlockerLinkSchema`, `AreaSchema`, `ReviewItemSchema` and `SettingsSchema`. Enums go through `Schema.Enum(TaskStatus)` and the like.
- `ActiveHoursSchema` is a `Struct` keyed `[IsoWeekday.Monday]` to `[IsoWeekday.Sunday]`, each value `Array(Tuple([Finite, Finite]))`. `Record(Enum(...))` is not an option: it throws.
- In `ReviewItemSchema`, `kind` and the subject `id` are Text, not UUID, so later kinds can reference other ids. `payload` is `Unknown`.
- The kind constant `COMMAND_NOT_APPLICABLE = 'command_not_applicable'` and `CommandNotApplicablePayloadSchema = Struct({ command: CommandSchema, reason: Enum(NotApplicableReason) })`.

**Commands**
- `CommandSchema = Schema.TaggedUnion({ [CommandTag.CaptureTask]: {...}, ... })` covers all 13 cases. The enum keys keep `_tag` typed as `CommandTag.X`.
- Each case has `idempotencyKey: Uuid` plus the domain fields. Optional fields use `optionalKey`.
- `expect` exists only on Triage, Edit, LogProgress, Complete and Drop (`{ status?, version? }`) and on UpdateArea (`{ version? }`).
- `type CommandRequest = typeof CommandSchema.Type`.
- `commandMeta: { readonly [T in CommandTag]: { readonly offline: boolean } }` is true for exactly CaptureTask, TriageTask, EditTask, LogProgress, CompleteTask and DropTask.
- `toDomainCommand(request): Command` drops `idempotencyKey`.

**Results, changes and errors**
- `CommandResultSchema = TaggedUnion({ [TransitionResultTag.Applied]: { seq: Int }, [TransitionResultTag.NotApplicable]: { reason: Enum(NotApplicableReason), reviewItemId: Uuid } })`.
- `ChangeEntrySchema` is a union mirroring the six domain `Change` shapes, each plus `seq: Int`.
- `ChangesSchema = { seq, entries }`.
- `SnapshotSchema = { seq, tasks, blockers, areas, reviewItems, settings }`.
- `MetaSchema = { rulesVersion: Text, apiVersion: Int, settings }`, with `API_VERSION = 1`.
- The errors are `CommandRejected { reason: Enum(RejectedReason) }`, `IdempotencyKeyReused {}` and `ChangesExpired { after: Int }`, each made with `Schema.TaggedError<Self>()(tag, fields)`.

**Behaviour to pin** (decoding with `Schema.decodeUnknownSync`, which throws `SchemaError`)
- **Tasks.**
  - A full Task decodes to itself: DateSpecs with and without `time`, and all nulls.
  - An extra key is stripped.
  - Each of these fails to decode: `due: { date: '2026-02-30' }`, `time: '24:00'`, `time: '10:00:00'`, a NUL in `title`, `title: 'a\uD800b'`, `notes: '\uDC00'`, `id: 'x'`, and an uppercase `id`.
- **Commands.**
  - Each of the 13 commands decodes from a JSON value.
  - Each of these fails: a missing `idempotencyKey`, an uppercase `idempotencyKey`, an uppercase `taskId`, an unknown `_tag`, and `areaId: undefined` on CaptureTask.
  - `estimateMinutes: 2.5` decodes; the domain rejects it later.
  - The `commandMeta` flags are exactly as listed above.
  - `toDomainCommand`'s output has no `idempotencyKey` and otherwise equals its input.
- **Active hours.** A missing weekday fails, and so does an interval with three elements.
- **Change entries and results.**
  - The six ChangeEntry shapes round-trip.
  - `{ entity: 'task', op: 'remove' }` fails.
  - An `id` on a Settings entry is stripped.
  - `seq: 1.5` fails.
  - Each CommandResult tag decodes, and an unknown tag fails.
  - `API_VERSION === 1`, and the three error classes have the stated `_tag` and fields.
- **Type tests.**
  - Plain `toEqualTypeOf` holds for BlockerLink, ActiveHours, Area, ReviewItem, Settings and DateSpec against their domain types.
  - It also holds for the distributive `Omit<CommandRequest, 'idempotencyKey'>` against domain `Command`.
  - `expectTypeOf<A>().branded.toEqualTypeOf<B>()` is used for Task (its bare `Schema.Enum` fields) and for `ChangeEntry` against `Change & { readonly seq: number }`. Plain equality fails there even on a correct schema.
- **Red check.** Drop `NullOr` from `TaskSchema.estimateMinutes`: the branded Task type test must fail. Then restore it.

### Unit 2: tables, migrations and RLS tests (pair)

**Who owns what**
- The implementer owns `apps/server/src/db/schema.ts` and the migrations.
- The test-writer owns `apps/server/src/db/rls-tables.spec.ts`, `isolation.spec.ts`, `schema-enums.spec.ts` and `apps/server/src/test/owners.ts` with `removeOwner(id)`.
  - `removeOwner` provides `ownerDatabase()` itself. Inside `withOwner(id)` it deletes the owner's rows from every owned table, children first.
  - All cleanup goes through it, never through the `asys_app` Db.
- The test-writer also trims `with-owner.spec.ts` to test e, the trial lookup, which piece 3 removes.

**Helpers in `schema.ts`**
- `ownerId()` is `uuid('owner_id').notNull()`.
- `ownerPolicy(table, t.ownerId)` is `pgPolicy('<table>_owner', { as: 'permissive', for: 'all', to: 'public', using, withCheck })`. The one expression is written literally in the `sql` template, because drizzle does not inline params into policy SQL.
- Every table is `pgTable.withRLS(...)`.

**Exports and columns**
- Tables: `users`, `settings`, `areas`, `tasks`, `taskBlockers`, `reviewItems`, `changeLog`, `changeCounters` and `idempotencyKeys`.
- Enums, each built from a value tuple: `taskKind` (`task_kind`), `taskStatus`, `voice`, `privacy`, `changeEntity` and `changeOp`. Their columns are typed `.$type<TaskKind>()` and so on.
- Property names are the camelCase of the column names, for example `availableFromDate` and `dueMoveCount`.
- Column types:
  - instants: `timestamp(..., { withTimezone: true, precision: 3, mode: 'date' })`;
  - counters: `bigint(..., { mode: 'number' })`;
  - dates: `date(..., { mode: 'string' })`.
- Defaults exist only where the table says so. The mappers write every other column.

| Table | Columns and constraints (names as given) |
|---|---|
| `users` | `owner_id` (`users_pkey`), `name text`, `created_at` default now() |
| `settings` | `owner_id` (`settings_pkey`), `time_zone text`, `urgency_window_days int` (`settings_urgency_window_check`: `> 0`) |
| `areas` | `(owner_id, id)` (`areas_pkey`), `name text`, `active_hours jsonb` (`$type<ActiveHours>`), `default_privacy privacy null`, `version int` |
| `tasks` | `(owner_id, id)` (`tasks_pkey`); `kind`, `status`, `title`, `notes`, `capture_text`; `area_id uuid null` with FK `(owner_id, area_id)` → `areas` (`tasks_area_fk`); `available_from_date date null`, `available_from_time text null`, `due_date`, `due_time` (`tasks_available_from_time_check` and `tasks_due_time_check`: the time is null, or its date is set and the time matches `^([01][0-9]\|2[0-3]):[0-5][0-9]$`); `estimate_minutes int null` (`tasks_estimate_check`: `> 0`); `important bool null`, `voice null`, `privacy null`, `due_move_count int`, `version int`, `created_at`, `closed_at null` |
| `task_blockers` | `(owner_id, id)` (`task_blockers_pkey`); `task_id`, `blocker_id` with FKs `(owner_id, task_id)` (`task_blockers_task_fk`) and `(owner_id, blocker_id)` (`task_blockers_blocker_fk`) → `tasks`; unique `(owner_id, task_id, blocker_id)` (`task_blockers_link_key`); `task_blockers_not_self_check` |
| `review_items` | `(owner_id, id)` (`review_items_pkey`), `kind text`, `subjects jsonb`, `payload jsonb not null`, `dedupe_key text null`, `created_at`, `resolved_at null`; unique index `review_items_open_dedupe_key` on `(owner_id, dedupe_key) where resolved_at is null` |
| `change_log` | `(owner_id, seq)` (`change_log_pkey`), `seq bigint`, `entity change_entity`, `entity_id uuid null`, `op change_op`, `data jsonb null`, `created_at` default now(); `change_log_entity_id_check`: `(entity = 'settings') = (entity_id is null)`; `change_log_data_check`: `(op = 'remove') = (data is null)` |
| `change_counters` | `owner_id` (`change_counters_pkey`), `last_seq bigint default 0`, `pruned_through bigint default 0`; `change_counters_seq_check`: `0 <= pruned_through and pruned_through <= last_seq` |
| `idempotency_keys` | `(owner_id, key)` (`idempotency_keys_pkey`), `key uuid`, `command text` (the tag), `request_hash text`, `result jsonb`, `created_at` default now() |

**Migrations**
1. `drizzle-kit generate --name task_loop_core`.
2. `drizzle-kit generate --custom --name task_loop_force_rls_grants`, following `apps/server/drizzle/20260928200755_force_rls_grants_lookup/migration.sql`. It holds `FORCE ROW LEVEL SECURITY` on all nine tables and the grants, one statement per `--> statement-breakpoint`:
   - SELECT, INSERT, UPDATE on `users`, `settings`, `areas`, `tasks`, `review_items` and `change_counters`;
   - SELECT, INSERT, DELETE on `task_blockers`;
   - SELECT, INSERT on `change_log` and `idempotency_keys`.
3. Both `migration.sql` files get an SPDX header right after generation.
4. A further plain `generate` must report no changes.

**Tests**
- **The enumerating test** connects as `asys_app` and uses raw `PgClient` SQL.
  - It reads `pg_class` (relkind `r` or `p`, `relpersistence <> 't'`), `pg_namespace`, `pg_attribute` and `pg_policy`. It excludes the namespaces `pg_catalog`, `information_schema`, `pg_toast` and `drizzle`.
  - For every table it asserts:
    - `owner_id` is not null, with `atttypid = 'uuid'::regtype`;
    - `relrowsecurity` and `relforcerowsecurity` are set;
    - there is exactly one policy, with `polpermissive === true`, `polcmd === '*'` and `polroles` deep-equal to `[0]`;
    - `pg_get_expr` of both `polqual` and `polwithcheck` equals one constant string, read once from the live database before the constant is written.
  - It asserts that these ten names are in the list, so it cannot pass vacuously: `users`, `settings`, `areas`, `tasks`, `task_blockers`, `review_items`, `change_log`, `change_counters`, `idempotency_keys` and `trial_items`.
  - It asserts that no relation of relkind `v`, `m` or `f` exists outside the excluded namespaces.
- **The grants test** uses `has_table_privilege('asys_app', t, p)`. It asserts exactly the grant matrix above, including that DELETE is false on `tasks`, `areas`, `change_log` and `idempotency_keys`.
- **Isolation tests a, b, c, d and f** are ported from `with-owner.spec.ts` to `tasks`, with two random owners. Rows are inserted with drizzle; a Task needs no user row.
- **Composite foreign keys.**
  - Setup: owner B inserts its own Task X, and owner A inserts Task Y and Area Z.
  - B inserting the link "X blocked by Y" fails with 23503, and `reason.cause.constraint` is `task_blockers_blocker_fk`.
  - B inserting a Task with `area_id` Z fails with 23503 on `tasks_area_fk`.
- **The enum test** checks that each value tuple equals `Object.values(DomainEnum)`, and its type twin that the tuple's element type equals `` `${DomainEnum}` ``.

**Red checks through psql**, each restored
- `ALTER TABLE tasks NO FORCE ROW LEVEL SECURITY`.
- `ALTER POLICY tasks_owner ON tasks USING (true)`.
- `CREATE TABLE stray (id int)`, dropped again afterwards.
- `CREATE VIEW stray_view AS SELECT 1`, dropped again afterwards.
- Dropping `task_blockers_blocker_fk`, and separately `tasks_area_fk`.
  - Before dropping, record `pg_get_constraintdef`.
  - After the red run, delete the rows that run left behind, as `asys_owner`.
  - Re-add the constraint with exactly the recorded text, compare the definition again, and rerun the test green.

### Unit 3: row mappers and `createOwner` (pair)

**Who owns what**
- Implementer: `apps/server/src/db/mappers.ts` and `apps/server/src/owners/create-owner.ts`.
- Test-writer: `mappers.spec.ts`, `create-owner.spec.ts`, and `newOwner()` in `apps/server/src/test/owners.ts`. `newOwner` takes a random lowercase id and runs `createOwner(id, 'Test owner', 'Europe/Amsterdam')`.

**Mappers**
- The pairs are `taskToRow(ownerId, task)` and `rowToTask(row)`, then `areaToRow`/`rowToArea`, `linkToRow`/`rowToLink`, `reviewItemToRow`/`rowToReviewItem` and `settingsToRow`/`rowToSettings`.
- A DateSpec maps to its `*_date` and `*_time` columns. A null `*_time` maps back to a DateSpec **without** a `time` key (not `time: undefined`).
- Instants map to `Date` and back with `getTime()`.

**Mapper behaviour**
- A domain Task with every field set round-trips: Due `{ date: '2026-12-15', time: '10:00' }`, Available from `{ date: '2026-12-14' }` and `closedAt` set.
  - It is written with `taskToRow`, read back with a drizzle `select` and compared with `deepStrictEqual`, so a stray `time: undefined` fails.
- The same holds for a Task with every nullable field null, and for a Task with `createdAt: 0` and `closedAt: 0` (0 must not become null).
- An Area with `WORK_ACTIVE_HOURS`, a ReviewItem with two subjects and an object payload, a link, and settings round-trip the same way.

**`createOwner({ ownerId, name, timeZone })`**
- It runs in `withOwner(ownerId)`.
- It first inserts the user with `onConflictDoNothing`. When no row comes back, it fails with `owner_exists` before writing anything else.
- It then writes:
  - the settings, `{ timeZone, urgencyWindowDays: DEFAULT_URGENCY_WINDOW_DAYS }`;
  - `seedAreas` with fresh UUIDs;
  - the counter row, `(0, 0)`.
- **Errors.** It fails with `CreateOwnerRejected`, a `Data.TaggedError` with `{ reason: CreateOwnerRejectedReason }`; both are in `create-owner.ts`.
  - The enum is `CreateOwnerRejectedReason { InvalidName = 'invalid_name', InvalidTimeZone = 'invalid_time_zone', OwnerExists = 'owner_exists' }`.
  - `invalid_name` covers an empty or NUL name, and `invalid_time_zone` follows the domain's `isValidTimeZone`.
  - On a failure, nothing is written.

**`createOwner` behaviour**
- `('  Jeroen ', 'Europe/Amsterdam')` gives:
  - the name `Jeroen` and an Urgency window of 2;
  - Work: Monday to Friday, 480 to 1080, Privacy null;
  - Personal: every day, 0 to 1440, Privacy `hidden`;
  - both Areas at version 1, and the counter at `(0, 0)`.
- `'Mars/Base'` and `'+02:00'` give `invalid_time_zone`, and `'   '` gives `invalid_name`.
- A second call gives `owner_exists`.
- Another owner sees none of these rows.

### Unit 4: change log, `withOwner` isolation and snapshot (pair)

**Who owns what**
- Implementer: `with-owner.ts`, `apps/server/src/changes/change-log.ts` and `apps/server/src/changes/snapshot.ts`.
- Test-writer: `change-log.spec.ts` and `snapshot.spec.ts`. Owners come from `newOwner()`.

**The API**
- **`withOwner(ownerId, effect, options?: { readonly isolationLevel?: NonNullable<PgTransactionConfig['isolationLevel']> })`** passes the level to `db.transaction(fn, { isolationLevel })`. When omitted, the transaction stays at read committed, as today.
- **`lockCounter: Effect<{ lastSeq, prunedThrough }>`** is `tx.select().from(changeCounters).for('update')`, a drizzle select and not raw SQL, so the int8 values come back as numbers.
  - It must be the first statement in every per-owner write transaction (decision 8 of the slice plan).
  - It runs inside `withOwner`. A missing counter row is a defect.
- **`appendChanges(lastSeq, changes)`** inserts one `change_log` row per change, numbered `lastSeq + 1` onwards in order.
  - `data` is the after-image encoded by the contract schema. It is null for a Blocker remove.
  - `entity_id` is null for settings.
  - It sets `last_seq` and returns the new last seq. An empty list writes nothing and returns `lastSeq`.
- **`changesSince(ownerId, after): Effect<Changes, ChangesExpired | ...>`** runs at repeatable read.
  - It returns the entries with `seq > after`, in seq order and decoded to `ChangeEntry`, and the head `seq`.
  - It fails with `ChangesExpired` when `after < pruned_through` or `after > last_seq`.
- **`readSnapshot(ownerId): Effect<Snapshot>`** runs at repeatable read. It returns:
  - the Open and Delegated Tasks;
  - the links whose blocked Task (`task_id`) is one of them;
  - all Areas;
  - the Review items with `resolved_at is null`;
  - the settings;
  - `last_seq`.

**Behaviour**
- **`appendChanges`.** With the counter at 0:
  - appending two Task puts returns 2 and stores seqs 1 and 2 with the encoded Tasks;
  - a settings put stores `entity_id` null;
  - a Blocker remove stores `data` null;
  - an empty append returns the old value and writes nothing.
- **`changesSince`.**
  - `changesSince(0)` returns all entries with head 2, and `(2)` returns `[]`.
  - With the counter set by test SQL as `asys_owner` to last 7 and pruned 5: `(4)` fails with `ChangesExpired`, `(5)` succeeds and `(8)` fails.
- **The lock is real.**
  - One fiber runs `withOwner(a, lockCounter)`, then succeeds a `Deferred` called `locked` and awaits one called `release`.
  - After `locked`, the main fiber's `withOwner(a, db.execute(sql\`select 1 from change_counters for update nowait\`))` must fail with the SqlError reason `LockTimeoutError`.
- **The snapshot holds exactly the working set.** The fixtures are inserted with the mappers:
  - absent: a Done Task, a Dropped Task, a link whose blocked Task is Done, and a resolved Review item;
  - present: a Delegated Task, and the link of an Open Task blocked by a Done Task.
- **Consistency under concurrent writes** (`excludeTestServices: true`).
  - 100 writers each run `withOwner(o, lockCounter, then a Task insert with the mapper, then appendChanges)`.
  - A reader fiber on its own pool, `Effect.provide(appDatabase({ maxConnections: 2 }))`, loops `readSnapshot` with `Effect.yieldNow` until a `Deferred` says the writers are done, then takes a final read.
  - Every read has `tasks.length === seq`, and at least 10 reads saw a seq strictly between 0 and 100.

**Red checks** (each race-based one is run up to 3 times, and the attempt that went red is recorded)
- `after < pruned_through` changed to `<=` fails the `(5)` case.
- `lockCounter` without `for('update')` fails the NOWAIT test.
- The snapshot at read committed, reading the counter before the Tasks, fails the consistency test.

### Unit 5: command executor (pair)

**Who owns what**
- Implementer: `apps/server/src/commands/run-command.ts` (with `runCommand` and `mapUniqueViolation`), `load-state.ts`, `persist-changes.ts`, `not-applicable.ts` and `request-hash.ts`.
- Test-writer: `run-command.spec.ts` and `run-command-concurrency.spec.ts`. Owners come from `newOwner()`.

**`runCommand(ownerId, request: CommandRequest): Effect<CommandResult, CommandRejected | IdempotencyKeyReused | EffectDrizzleQueryError | SqlError, Db>`** runs as one `withOwner` transaction at read committed:
1. Run `lockCounter`.
2. Look up `idempotency_keys` by `request.idempotencyKey`.
   - Found with the same `request_hash`: return the stored result, decoded.
   - Found with another hash: fail with `IdempotencyKeyReused`.
   - `request_hash` is the SHA-256 hex digest (`node:crypto`) of the canonical JSON (keys sorted recursively) of `Schema.encodeSync(CommandSchema)(request)`.
3. Run `loadState(command)`. The settings are always loaded. Beyond them:

   | Command | Also loaded |
   |---|---|
   | capture, Triage, edit, log progress, complete, drop | the target Task by id, whatever its status, and all Areas |
   | AddBlocker | both Tasks and all of the owner's links |
   | RemoveBlocker | that link |
   | the Area commands | all Areas |
   | ResolveReviewItem | that Review item by id, resolved or not |

   Everything else stays empty.
4. Run `applyCommand(state, toDomainCommand(request), now)`, with `now` from `Clock.currentTimeMillis`.
5. Act on the result:
   - **Rejected:** fail with `CommandRejected(reason)`, which rolls the transaction back.
   - **Applied:** run `persistChanges`, then `appendChanges`. The result is `Applied{ seq: new last_seq }`.
     - A Task, Area or ReviewItem put inserts when the loaded state had no row with that id, and updates otherwise; there is no upsert.
     - A Blocker put inserts, a Blocker remove deletes, and a Settings put updates.
   - **NotApplicable:** persist and append a Review item `{ id: randomUUID(), kind: COMMAND_NOT_APPLICABLE, subjects: [{ type: 'task' | 'area', id }], payload: { command: <encoded request>, reason }, dedupeKey: null, createdAt: now, resolvedAt: null }`. The result is `NotApplicable{ reason, reviewItemId }`.
6. Insert the idempotency row: `command` is the tag, plus the hash and the encoded result.

**`mapUniqueViolation`**, applied outside the transaction, turns a UniqueViolation whose constraint is `tasks_pkey`, `areas_pkey`, `task_blockers_pkey` or `review_items_pkey` into `CommandRejected(duplicate_id)`. Any other error passes through unchanged.

**Behaviour**
- **The Done-then-Drop replay** (the slice plan's first test):
  1. Capture gives Applied, seq 1.
  2. Complete gives Applied, seq 2.
  3. Drop with `expect.status = open` gives NotApplicable `expectation_failed`, with a Review item and its log entry at seq 3.
  4. Replaying each of the three keys returns the identical stored result and creates no second Review item. The counter stays at 3.
- **Every tag once.** Each tag runs once through `runCommand`; T is 1_000_000.

  | Tag | Setup | seq | Logged | Snapshot |
  |---|---|---|---|---|
  | CaptureTask | none | +1 | task put | Task present, Importance and Estimate null |
  | TriageTask | capture | +1 | task put | Importance and Estimate set, version 2 |
  | EditTask (Due) | capture | +1 | task put | Due set |
  | LogProgress 20 | capture, Triage with 30 | +1 | task put | Estimate 20 |
  | CompleteTask | capture | +1 | task put with status done and closedAt T | absent |
  | DropTask | capture | +1 | task put with status dropped | absent |
  | AddBlocker | two captures | +1 | blocker put | link present |
  | RemoveBlocker | the same plus an AddBlocker | +1 | blocker remove with no data | link absent |
  | CreateArea | none | +1 | area put | 3 Areas |
  | UpdateArea (name) | the seeded Work Area | +1 | area put, version 2 | renamed |
  | SetTimeZone 'Europe/London' | none | +1 | settings put with no id | time zone changed |
  | SetUrgencyWindow 5 | none | +1 | settings put | 5 |
  | ResolveReviewItem | a NotApplicable drop | +1 | review_item put with resolvedAt T | item absent |
- **Commands that change nothing.**
  - Resolving the same item again with a new key gives Applied with the seq unchanged and no new log entry, and its key is stored.
  - SetTimeZone to the current zone behaves the same way.
- **Rejected.** A capture with `title: '  '` writes nothing: no Task, no log entry, no idempotency row, and the counter is unchanged.
- **Key reuse.** The same key with another payload after an Applied gives `IdempotencyKeyReused` and writes nothing.
- **Stale Area version.** UpdateArea with a stale `expect.version` gives NotApplicable with the subject `{ type: 'area', id }`.
- **Clock.** With `TestClock.setTime(1_000_000)`, a captured Task has `createdAt` 1_000_000.
- **Two owners.**
  - Owners A and B each capture the same `taskId` with the same `idempotencyKey`, and both get Applied with seq 1.
  - B's Triage of that id changes only B's Task.
  - B's AddBlocker naming A's other Task id gives `CommandRejected(not_found)`.
- **`mapUniqueViolation`.** A real violation of `tasks_pkey` (a duplicate insert made by the test) maps to `CommandRejected(duplicate_id)`. A real violation of `change_log_pkey` passes through unchanged.

**Concurrency** (`excludeTestServices: true`; the poller has its own `maxConnections: 2` pool and loops with `yieldNow` until a `Deferred` is done)
- **Ordering.** 50 concurrent captures for one owner run alongside a `changesSince` poller.
  - Every poll returns seqs contiguous from its `after + 1`, and together the polls cover exactly 1 to 50.
  - At least 10 polls saw a head strictly between 0 and 50.
- **One key, two requests.** Both requests succeed with the identical result, and there is one Task and one idempotency row.
- **Opposite blockers.** Concurrent AddBlocker A→B and B→A: exactly one is Applied, and the other is `CommandRejected(cycle)`.

**Red checks** (up to 3 attempts each)
- Replacing the counter with a `nextval()` sequence and no lock breaks the poller test.
- Removing `for('update')` from `lockCounter` fails the one-key and the opposite-blockers tests. They fail on their assertions, because the second insert's `change_log_pkey` violation is no longer mapped.

### Review pass (workflow)

Once all units are green, a review workflow runs read-only reviewers through four lenses:
- correctness against this contract, the slice plan and ADRs 0004, 0007 and 0009;
- RLS, SQL and concurrency;
- whether the tests prove the behaviour;
- the use of the Effect and Drizzle APIs.

A finding counts only after a skeptic on Opus has verified it. The side that owns each confirmed finding fixes it, and then the full verification runs.

### Docs

- **`docs/slice-1-plan.md`.** Piece 2 is updated with the decisions above, as piece 1 did. The Drizzle error note is corrected: the `SqlError` sits inside a `Cause`.
- **Piece 4's outline** gains one note. Database errors become an opaque 500 and are logged with only the reason tag, SQLSTATE and constraint, never the message, which carries the query params.
- **`libs/contract/README.md`** says what the library is and gives its licence.
- **No ADR changes.** No rule changes either, so `RULES_VERSION` stays 0.1.0.

## Verification

1. **Database.** Run `docker compose up -d --wait`, then `pnpm exec drizzle-kit migrate --config apps/server/drizzle.config.ts`. A further `drizzle-kit generate` reports no schema changes.
2. **Full checks.** Each one's output goes to its own capture file:
   - `pnpm exec nx run-many -t lint typecheck build test --skip-nx-cache`;
   - `pnpm exec nx format:check --all`;
   - `pnpm exec tsc -p scripts/tsconfig.json`;
   - `node scripts/check-spdx.mts` and `node scripts/check-licenses.mts`;
   - `pipx run reuse==6.2.0 lint`;
   - the smoke import, `node --input-type=module -e "await import('drizzle-orm/effect-postgres')"`.
3. **Boundary red check.** `import 'drizzle-orm'` in `libs/contract/src/index.ts` turns `nx lint contract` red; the import is then removed.
4. **Red checks restored.** Every red check listed per unit was seen red and restored. `git status` shows no leftovers, and the enumerating, grants and FK tests pass again.
5. **A fresh database.** CI proves the migrations from an empty database on the push you allow. The local dev database keeps its data, and I ask before any `docker compose down -v`.
6. **Your review.** I stop for your review and commit on your word.