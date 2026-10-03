<!-- SPDX-License-Identifier: EUPL-1.2 -->
# Prepared statements on the Effect + Drizzle stack

This note, from 2026-10-02, answers whether the server should use Drizzle's prepared statements (`.prepare()` with `sql.placeholder`, see [Drizzle: Query performance](https://orm.drizzle.team/docs/perf-queries)) for most or all of its queries. **Not now.** **The database already reuses every statement**: `@effect/sql-pg` 4.0.0 keeps each statement prepared on its connection by default, and `drizzle-orm/effect-postgres` ignores the name `.prepare()` is given. What `.prepare()` adds is skipping Drizzle's own query building in Node, which saved about 40 to 90 µs per statement below: 17 to 29% of a transaction against a database on the same machine, and less over a real network. Converting the queries would lose type checking of the values and needs workarounds for three query shapes the server uses. Row-level security is unaffected either way.

## Versions used

| Package or tool | Version |
|---|---|
| Node, pnpm | 22.22.0, 11.22.0 (CI runs Node 24) |
| PostgreSQL | 16.14, local (`compose.yaml` pins 18.6; Docker was not available) |
| effect, @effect/sql-pg | 4.0.0 |
| drizzle-orm | 1.0.0-rc.5-5935859 |
| vitest | 5.0.2 |
| Machine | 4 vCPU, Intel Xeon at 2.10 GHz, database and server on the same machine |

## How each layer prepares

### Drizzle

The Drizzle docs say a prepared statement does the SQL concatenation once on Drizzle's side, so the driver can reuse the precompiled statement instead of parsing the query each time. On this stack only the first half applies.

- Without `.prepare()`, each `yield*` of a query builder calls its `_prepare()`: it renders the SQL (`getSQL()`, then `dialect.sqlToQuery`) and builds the row mapper, then executes. A prepared query does this once, and each `execute(values)` only runs `fillPlaceholders` over its parameters (`drizzle-orm/pg-core/effect/select.js`, `update.js`, `insert.js`, `delete.js`; `pg-core/effect/session.js`).
- `EffectPgSession.prepareQuery(query, mode, _name, …)` ignores the name and runs `client.unsafe(query.sql, params)` on every execution (`drizzle-orm/effect-postgres/session.js:16`). Drizzle never creates a named statement of its own.
- JIT row mappers are off: `makeWithDefaults()` is called without `jit`, so the mappers are the premade ones.

### @effect/sql-pg

`@effect/sql-pg` 4.0.0 speaks the wire protocol itself, without `pg` or `postgres`.

- `PgClient`'s `prepare` option ("Caches prepared statements by name. Enabled by default.", `src/PgClient.ts:139`) and `preparedStatementCacheSize` (default 100, `src/PgConnection.ts:967`) give each connection an LRU cache of named statements, keyed by SQL text and parameter types.
- The first execution of a text sends `Parse`, `Bind`, `Describe`, `Execute` and `Sync`. Later ones send only `Bind`, `Execute` and `Sync`. Evicted statements are closed with a `Close` message on a later round trip. Streams always use unnamed statements.
- `execute`, `executeRaw`, `executeValues` and `executeWithoutTransform` all prepare. Transaction control is prepared too (`prepareTransactionControls: true`).

Inside one `withOwner` transaction, `pg_prepared_statements` listed every statement sent on that connection so far, named `effect_<hash>_<n>`: `BEGIN`, `COMMIT`, `select set_config('app.owner_id', $1, true)`, the inserts of `createOwner`, and the selects. A query prepared with Drizzle as `p_settings` did not appear under that name. It reused the statement of the plain query, whose SQL text is identical.

The server code has 33 query call sites. With transaction control and the two `inArray` lengths in `loadState`, that is about 40 distinct texts, plus one change-log insert per number of changes in a command. That is well under the cache size of 100.

## Measurements

A temporary vitest file ran against the local PostgreSQL 16.14 with the roles from `docker/postgres/init/10-roles.sql` and every migration applied. It connected as `asys_app` with a pool of one connection and ran `withOwner` transactions sequentially: 200 warm-up transactions, then 3,000 per case, in 4 rounds that alternated which variant ran first. The file was not committed.

- **Read**: `BEGIN`, `set_config`, then the settings select, the task select by owner and `inArray` of one id, and the Areas select, as `loadState` runs them for `EditTask`; then `COMMIT`.
- **Write**: `BEGIN`, `set_config`, then the counter lock (`for update`), the full-row update of a task (20 columns, as `persistChanges` writes it), a one-row change-log insert and the counter update; then `COMMIT`.

| Transaction | Plain builders (today) | Drizzle `.prepare()` | Saved |
|---|---|---|---|
| Read, `prepare: true` (the default) | 575 to 726 µs | 462 to 513 µs | about 110 to 210 µs |
| Write, `prepare: true` | 1,260 to 1,383 µs | 949 to 1,108 µs | about 220 to 360 µs |
| Read, `prepare: false` | 774 to 936 µs | 629 to 748 µs | about 70 to 310 µs |
| Write, `prepare: false` | 1,474 to 1,721 µs | 1,195 to 1,324 µs | about 280 to 400 µs |

The `prepare: false` rows switch off `@effect/sql-pg`'s statement cache. Doing so costs the plain builders about as much again as `.prepare()` saves, so the server already gets the database-side half for free.

Building one query, measured on its own (20,000 iterations after 2,000 warm-up, no database round trip):

| Query | Build and `_prepare()` |
|---|---|
| Settings select by owner | 10.2 µs |
| Task select, `and(eq, inArray)` | 27.0 µs |
| Task update, 20 columns | 34.1 µs |
| Change-log insert, one row | 11.2 µs |
| The same task update, prepared: `fillPlaceholders` only | 3.8 µs |

For the read transaction, the end-to-end saving is two to four times the sum of its three build costs. The cause was not investigated; the end-to-end figures are the ones to go by.

The saving is a fixed amount of Node CPU per statement. With network latency between the server and the database, each statement's round trip grows and the share falls. With one User, the throughput it would free does not matter yet.

## What converting would cost

- **No type checking of the values.** `execute(placeholderValues?: Record<string, unknown>)` is untyped (`drizzle-orm/pg-core/effect/session.d.ts:31`); only the result's row type is kept. A misspelt key or a value of the wrong type compiles. A missing key throws `No value for placeholder "…" was provided` at runtime.
- **A service to hold them.** A prepared query belongs to the `db` it was built on, and `db` comes from the `Db` layer, so the queries cannot be module constants. They would live in a new service built from `Db`, provided once for `appDatabase` and once for `ownerDatabase` in tests.
- **Shapes that do not fit:**

| Shape | Where | Problem | Workaround |
|---|---|---|---|
| `inArray(col, ids)` | `apps/server/src/commands/load-state.ts:27` | `inArray(col, sql.placeholder('ids'))` renders `in $1`, a syntax error at `$1` (seen) | `` sql`${col} = any(${sql.placeholder('ids')}::uuid[])` `` with a JavaScript array (seen working), or one query per length (the server uses 1 and 2) |
| Inserts of a varying number of rows | `apps/server/src/changes/change-log.ts:69` | the SQL text changes with the number of changes | one query per count, or an `unnest` insert |
| Full-row `.set(row)` and `.values(row)` | `apps/server/src/commands/persist-changes.ts:29` and the inserts next to it | one placeholder per column, 20 for `tasks` | a helper that maps each column to a placeholder of the same name |
| Raw SQL through `tx.execute` | `apps/server/src/db/with-owner.ts:27` (`set_config`) | no `.prepare()` on raw execution | none needed: the text is constant and `@effect/sql-pg` prepares it |

- **More reliance on a release candidate.** Placeholder filling and codecs run through more of the unofficial build's internals.

## Row-level security

Nothing changes, because every statement already runs as a named prepared statement.

- With the default `prepare: true`, the server suite (16 files, 109 tests, including the isolation tests of ADR 0007) passed against the local PostgreSQL 16.14 (`pnpm exec nx test server --skip-nx-cache`).
- A cached plan does not carry an owner across. As `asys_app`, with `plan_cache_mode = force_generic_plan`, one session prepared `select owner_id, title from tasks where status = $1` and executed it in a transaction for owner A, one for owner B and once with no owner. A saw only its 2 rows, B only its 1 row, and with no owner set it returned no rows, all from one generic plan (`generic_plans` 3, `custom_plans` 0). The policy's `current_setting('app.owner_id', true)` is evaluated when the statement executes, not when it is planned.

## Recommendation

- **Keep the plain query builders.**
- **Keep `@effect/sql-pg`'s defaults.** Raise `preparedStatementCacheSize` if the hot distinct statements approach 100 per connection. A connection pooler that cannot keep named statements between queries needs `prepare: false`, which the `PgClient` documentation names as the case for turning it off.
- **Revisit selectively** if profiles show Node CPU as the bottleneck, for example when many clients poll the snapshot or the change stream. Start with the fixed-shape statements every command runs: the counter lock, the idempotency key lookup and the settings select.

## Limits

- PostgreSQL 16.14 rather than 18.6, Node 22 rather than 24, the database on the same machine, one connection, and no concurrent load.
- The Drizzle docs page could not be fetched from the machine that ran the benchmark, whose network policy blocks `orm.drizzle.team`. Its claims were taken from a search result's excerpt of the page; everything about this stack comes from the installed source.
