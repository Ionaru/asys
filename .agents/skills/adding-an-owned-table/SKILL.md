---
# SPDX-License-Identifier: EUPL-1.2
name: adding-an-owned-table
description: Use when adding or altering a PostgreSQL table, column, index, grant or SECURITY DEFINER lookup function in apps/server, or when drizzle-kit generate produced a migration, or rls-tables.spec.ts fails.
---

# Adding an owned table

## Overview

Every table belongs to one owner, under row-level security (ADR 0007). The roles are set up by `docker/postgres/init/10-roles.sql`:

- `asys_owner` owns the tables and runs migrations.
- `asys_app` is what the server connects as. It is bound by RLS and holds only the grants it needs.
- `asys_lookup` (NOLOGIN, BYPASSRLS) owns the few `SECURITY DEFINER` functions that look something up before an owner is known.

drizzle-kit emits `ENABLE` but never `FORCE ROW LEVEL SECURITY`, and no grants. Every generated migration that **creates** a table therefore gets a hand-written companion. A migration that only alters a table (a column, an index, a constraint) needs none, unless it needs a new grant or lookup function.

## Steps

1. **Schema** (`apps/server/src/db/schema.ts`): use `pgTable.withRLS('<t>', { ownerId: ownerId(), id: uuid('id').notNull(), ... }, (t) => [primaryKey({ name: '<t>_pkey', columns: [t.ownerId, t.id] }), ..., ownerPolicy('<t>', t.ownerId)])`.
   - Name every constraint: `<t>_pkey`, `_key`, `_check`, `_fk`.
   - Foreign keys are composite and include `owner_id`, because foreign-key checks bypass RLS.
   - Instants are `timestamptz(3)`. Give `created_at` a `.defaultNow()` only when the database stamps the row. When the value comes from a domain entity or a command's `now`, leave it without a default, as `tasks` and `review_items` do.
   - Store binary values as base64url text and tokens as SHA-256 hex.
   - Domain enum columns are literal tuples typed with `.$type<DomainEnum>()` through `import type`. drizzle-kit's loader cannot resolve `@asys/domain`.
2. **Generate:** `pnpm exec drizzle-kit generate --config apps/server/drizzle.config.ts --name <name>`. Review the SQL, and add the EUPL-1.2 SPDX line (`--` comment form) as line 1 of `migration.sql`.
3. **Companion:** `pnpm exec drizzle-kit generate --custom --config apps/server/drizzle.config.ts --name <name>_force_rls_grants`. Model it on `apps/server/drizzle/20261002204147_task_loop_force_rls_grants/migration.sql`: an SPDX line, a comment, then `ALTER TABLE "<t>" FORCE ROW LEVEL SECURITY;` and the least-privilege `GRANT ... TO asys_app;`, separated by `--> statement-breakpoint`. Grant DELETE only when the server deletes.
4. **Lookup functions** (only when a row must be found before the owner is known): follow `20261003141350_auth_force_rls_grants_lookups`.
   - Write `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp`, compare against `$1` (not a parameter named like the column), and return `(owner_id, id)` or a scalar.
   - Revoke from PUBLIC, grant EXECUTE to `asys_app`, and grant column-exact SELECT to `asys_lookup`.
   - Hand the function over: `GRANT CREATE ON SCHEMA public TO asys_lookup`, then `ALTER FUNCTION ... OWNER TO asys_lookup`, then revoke CREATE again.
   - To replace or drop a function later, use `SET ROLE asys_lookup` and end with `RESET ROLE` in the same file. Pending migrations share one transaction.
   - Add the wrapper in `src/auth/lookups.ts` or `src/jobs/claim.ts`.
5. **Guards** in `src/db/rls-tables.spec.ts`: add to `EXPECTED_TABLES` and to `GRANTS`, which only checks the tables it lists. Update the count word in the test name "the enumeration finds all <N> known tables" (fifteen at the end of slice 1). For lookups, update `LOOKUP_SELECT_COLUMNS` / `LOOKUP_UPDATE_COLUMNS`, the exact function list and the volatility map.
6. **Tests:**
   - Add one test per check, unique or partial index in `src/db/constraints.spec.ts`.
   - Add the table to `removeOwner` in `src/test/owners.ts`, children first. Otherwise rows pile up in the shared dev database.
   - When the server reads or writes the table, add a case to `src/db/isolation.spec.ts`: insert as `asys_app` under `withOwner`, and show that another owner sees nothing. `assertRejectedByRls` in `src/test/rls.ts` covers the foreign-owner insert.
   - For a domain entity, add `src/db/mappers.ts` and its spec. For an enum column, add `schema-enums.spec.ts` and `schema-enums.test-d.ts`.
7. **Apply:** run `pnpm exec drizzle-kit migrate --config apps/server/drizzle.config.ts`. Then run `pnpm exec drizzle-kit generate --config apps/server/drizzle.config.ts --name should_be_empty`. It must report nothing to migrate, which proves `schema.ts` and the latest `snapshot.json` agree. Delete any folder it creates.

## Rules for every migration

- **Forward only, compatible with the previous release.** A rollback runs the previous image on the migrated database. So add the column first, and drop or rename it a release later.
- **Never edit an applied migration.** Add a new one instead.
- **Probing a red case by hand.** Use `psql` as `asys_owner`, restore what you changed, and never commit the probe as a migration.

## Verify

```bash
pnpm exec nx test server --skip-nx-cache
```

```bash
pnpm exec nx run-many -t lint typecheck build -p server
```

The database must be up and migrated, and `nx serve server` stopped.

## Common mistakes

| Mistake                               | Symptom                                                         |
| ------------------------------------- | --------------------------------------------------------------- |
| No companion migration                | `rls-tables.spec.ts` FORCE check fails; the owner sees all rows |
| Policy written without `nullif(...)`  | 22P02 on reused connections                                     |
| Lookup function owned by `asys_owner` | It sees no rows, because FORCE binds the owner too              |
| Table missing from `GRANTS`           | Silently unchecked grants                                       |
| No `removeOwner` entry                | Test rows accumulate; later counts drift                        |
| Raw `interval` or `bigint` selected   | The driver cannot decode them; use `extract(epoch ...)::float8` |
