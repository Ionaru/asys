// SPDX-License-Identifier: EUPL-1.2
import { PgClient } from '@effect/sql-pg';
import { assert, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { appDatabase } from './database';

// Enumerates every table in the database, so a table added later without the
// owner guard fails here (ADR 0007).

const OWNER_EXPRESSION =
  "(owner_id = (NULLIF(current_setting('app.owner_id'::text, true), ''::text))::uuid)";

const EXPECTED_TABLES = [
  'users',
  'settings',
  'areas',
  'tasks',
  'task_blockers',
  'review_items',
  'change_log',
  'change_counters',
  'idempotency_keys',
  'trial_items',
];

const tableGuards = Effect.gen(function* () {
  const pg = yield* PgClient.PgClient;
  return yield* pg<{
    readonly name: string;
    readonly rowsecurity: boolean;
    readonly forced: boolean;
    readonly ownerColumns: number;
    readonly ownerNotNullUuid: boolean | null;
    readonly policies: number;
  }>`
    select c.relname as name,
      c.relrowsecurity as rowsecurity,
      c.relforcerowsecurity as forced,
      (select count(*)::int from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'owner_id' and not a.attisdropped) as "ownerColumns",
      (select a.attnotnull and a.atttypid = 'uuid'::regtype from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'owner_id' and not a.attisdropped) as "ownerNotNullUuid",
      (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and c.relpersistence <> 't'
      and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'drizzle')
    order by c.relname`;
});

layer(appDatabase())('row-level security guards every table', (it) => {
  it.effect('the enumeration finds all ten known tables', () =>
    Effect.gen(function* () {
      const names = (yield* tableGuards).map((row) => row.name);
      for (const expected of EXPECTED_TABLES) {
        assert.include(names, expected);
      }
    }),
  );

  it.effect('every table has a not null uuid owner_id, forced RLS and exactly one policy', () =>
    Effect.gen(function* () {
      const tables = yield* tableGuards;
      for (const table of tables) {
        assert.strictEqual(table.ownerColumns, 1, `${table.name}: owner_id column`);
        assert.strictEqual(table.ownerNotNullUuid, true, `${table.name}: owner_id not null uuid`);
        assert.strictEqual(table.rowsecurity, true, `${table.name}: row-level security enabled`);
        assert.strictEqual(table.forced, true, `${table.name}: row-level security forced`);
        assert.strictEqual(table.policies, 1, `${table.name}: exactly one policy`);
      }
    }),
  );

  it.effect('every policy is the permissive owner policy for all commands and roles', () =>
    Effect.gen(function* () {
      const pg = yield* PgClient.PgClient;
      const policies = yield* pg<{
        readonly table: string;
        readonly permissive: boolean;
        readonly cmd: string;
        readonly roles: ReadonlyArray<number | string>;
        readonly using: string | null;
        readonly withCheck: string | null;
      }>`
        select c.relname as "table",
          p.polpermissive as permissive,
          p.polcmd as cmd,
          p.polroles as roles,
          pg_get_expr(p.polqual, p.polrelid) as "using",
          pg_get_expr(p.polwithcheck, p.polrelid) as "withCheck"
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'drizzle')
        order by c.relname`;

      assert.isAtLeast(policies.length, EXPECTED_TABLES.length);
      for (const policy of policies) {
        assert.strictEqual(policy.permissive, true, `${policy.table}: permissive`);
        assert.strictEqual(policy.cmd, '*', `${policy.table}: all commands`);
        assert.deepStrictEqual([...policy.roles], [0], `${policy.table}: PUBLIC only`);
        assert.strictEqual(policy.using, OWNER_EXPRESSION, `${policy.table}: USING`);
        assert.strictEqual(policy.withCheck, OWNER_EXPRESSION, `${policy.table}: WITH CHECK`);
      }
    }),
  );

  it.effect('no view, materialized view or foreign table exists', () =>
    Effect.gen(function* () {
      const pg = yield* PgClient.PgClient;
      const relations = yield* pg<{ readonly name: string }>`
        select c.relname as name
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('v', 'm', 'f')
          and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'drizzle')`;
      assert.deepStrictEqual(
        relations.map((row) => row.name),
        [],
      );
    }),
  );
});

const GRANTS: Record<
  string,
  { select: boolean; insert: boolean; update: boolean; delete: boolean }
> = {
  users: { select: true, insert: true, update: true, delete: false },
  settings: { select: true, insert: true, update: true, delete: false },
  areas: { select: true, insert: true, update: true, delete: false },
  tasks: { select: true, insert: true, update: true, delete: false },
  review_items: { select: true, insert: true, update: true, delete: false },
  change_counters: { select: true, insert: true, update: true, delete: false },
  task_blockers: { select: true, insert: true, update: false, delete: true },
  change_log: { select: true, insert: true, update: false, delete: false },
  idempotency_keys: { select: true, insert: true, update: false, delete: false },
};

layer(appDatabase())('asys_app grants', (it) => {
  it.effect('asys_app has exactly the stated privileges on the nine new tables', () =>
    Effect.gen(function* () {
      const pg = yield* PgClient.PgClient;
      for (const [table, expected] of Object.entries(GRANTS)) {
        const [actual] = yield* pg<{
          readonly select: boolean;
          readonly insert: boolean;
          readonly update: boolean;
          readonly delete: boolean;
        }>`
          select has_table_privilege('asys_app'::text, ${table}::text, 'SELECT') as "select",
            has_table_privilege('asys_app'::text, ${table}::text, 'INSERT') as "insert",
            has_table_privilege('asys_app'::text, ${table}::text, 'UPDATE') as "update",
            has_table_privilege('asys_app'::text, ${table}::text, 'DELETE') as "delete"`;
        assert.deepStrictEqual({ ...actual }, expected, `${table}: privileges`);
      }
    }),
  );

  // TRUNCATE bypasses row-level security, so asys_app must never hold it.
  it.effect(
    'asys_app has no TRUNCATE, REFERENCES or TRIGGER privilege on the nine new tables',
    () =>
      Effect.gen(function* () {
        const pg = yield* PgClient.PgClient;
        for (const table of Object.keys(GRANTS)) {
          const [actual] = yield* pg<{
            readonly truncate: boolean;
            readonly references: boolean;
            readonly trigger: boolean;
          }>`
          select has_table_privilege('asys_app'::text, ${table}::text, 'TRUNCATE') as "truncate",
            has_table_privilege('asys_app'::text, ${table}::text, 'REFERENCES') as "references",
            has_table_privilege('asys_app'::text, ${table}::text, 'TRIGGER') as "trigger"`;
          assert.deepStrictEqual(
            { ...actual },
            { truncate: false, references: false, trigger: false },
            `${table}: privileges`,
          );
        }
      }),
  );

  // A column-level grant does not show in has_table_privilege.
  it.effect('column-level privileges of asys_app equal the table-level matrix', () =>
    Effect.gen(function* () {
      const pg = yield* PgClient.PgClient;
      for (const [table, expected] of Object.entries(GRANTS)) {
        const [actual] = yield* pg<{
          readonly select: boolean;
          readonly insert: boolean;
          readonly update: boolean;
          readonly references: boolean;
        }>`
          select has_any_column_privilege('asys_app'::text, ${table}::text, 'SELECT') as "select",
            has_any_column_privilege('asys_app'::text, ${table}::text, 'INSERT') as "insert",
            has_any_column_privilege('asys_app'::text, ${table}::text, 'UPDATE') as "update",
            has_any_column_privilege('asys_app'::text, ${table}::text, 'REFERENCES') as "references"`;
        assert.deepStrictEqual(
          { ...actual },
          {
            select: expected.select,
            insert: expected.insert,
            update: expected.update,
            references: false,
          },
          `${table}: column privileges`,
        );
      }
    }),
  );
});
