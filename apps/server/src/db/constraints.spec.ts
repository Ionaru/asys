// SPDX-License-Identifier: EUPL-1.2
import { randomBytes, randomUUID } from 'node:crypto';
import { ChangeEntity, ChangeOp, TaskKind, TaskStatus } from '@asys/domain';
import { assert, layer } from '@effect/vitest';
import { Cause, Effect, Exit } from 'effect';
import { removeOwner } from '../test/owners';
import { appDatabase, Db, ownerDatabase } from './database';
import {
  changeCounters,
  changeLog,
  jobs,
  passkeys,
  recoveryCodes,
  reviewItems,
  sessions,
  settings,
  signInIdentities,
  signUpLinks,
  taskBlockers,
  tasks,
} from './schema';
import { findSqlError } from './sql-error';
import { withOwner } from './with-owner';

// Check and unique constraints reject bad rows in the database itself.
// Every owner id is random, so rows left by other runs never match.

const createdAt = new Date('2026-10-02T08:00:00.000Z');

const taskRow = (ownerId: string, overrides: Partial<typeof tasks.$inferInsert> = {}) => ({
  ownerId,
  id: randomUUID(),
  kind: TaskKind.Task,
  status: TaskStatus.Open,
  title: 'a task',
  notes: '',
  captureText: '',
  dueMoveCount: 0,
  version: 1,
  createdAt,
  ...overrides,
});

const insertTask = (ownerId: string, overrides: Partial<typeof tasks.$inferInsert> = {}) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const row = taskRow(ownerId, overrides);
    yield* db.insert(tasks).values(row);
    return row.id;
  });

const reviewRow = (ownerId: string, overrides: Partial<typeof reviewItems.$inferInsert> = {}) => ({
  ownerId,
  id: randomUUID(),
  kind: 'a kind',
  subjects: [],
  payload: {},
  dedupeKey: 'k',
  createdAt,
  ...overrides,
});

const changeRow = (ownerId: string, overrides: Partial<typeof changeLog.$inferInsert>) => ({
  ownerId,
  seq: 1,
  entity: ChangeEntity.Task,
  entityId: randomUUID(),
  op: ChangeOp.Put,
  data: {},
  ...overrides,
});

const jobRow = (ownerId: string, overrides: Partial<typeof jobs.$inferInsert> = {}) => ({
  ownerId,
  id: randomUUID(),
  kind: 'a kind',
  payload: {},
  runAt: createdAt,
  ...overrides,
});

const insertJob = (ownerId: string, overrides: Partial<typeof jobs.$inferInsert> = {}) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.insert(jobs).values(jobRow(ownerId, overrides));
  });

const HOUR_MS = 60 * 60 * 1000;

const validHash = () => randomBytes(32).toString('hex');

const signUpLinkRow = (
  ownerId: string,
  overrides: Partial<typeof signUpLinks.$inferInsert> = {},
) => ({
  ownerId,
  id: randomUUID(),
  tokenHash: validHash(),
  createdAt,
  expiresAt: new Date(createdAt.getTime() + HOUR_MS),
  ...overrides,
});

const sessionRow = (ownerId: string, overrides: Partial<typeof sessions.$inferInsert> = {}) => ({
  ownerId,
  id: randomUUID(),
  tokenHash: validHash(),
  createdAt,
  expiresAt: new Date(createdAt.getTime() + HOUR_MS),
  ...overrides,
});

const passkeyRow = (ownerId: string, overrides: Partial<typeof passkeys.$inferInsert> = {}) => ({
  ownerId,
  id: randomUUID(),
  credentialId: randomBytes(32).toString('base64url'),
  publicKey: 'a public key',
  counter: 0,
  transports: [],
  backedUp: false,
  name: 'a passkey',
  createdAt,
  ...overrides,
});

const recoveryCodeRow = (
  ownerId: string,
  overrides: Partial<typeof recoveryCodes.$inferInsert> = {},
) => ({
  ownerId,
  id: randomUUID(),
  codeHash: validHash(),
  createdAt,
  ...overrides,
});

const insertSignUpLink = (
  ownerId: string,
  overrides: Partial<typeof signUpLinks.$inferInsert> = {},
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.insert(signUpLinks).values(signUpLinkRow(ownerId, overrides));
  });

const insertSession = (ownerId: string, overrides: Partial<typeof sessions.$inferInsert> = {}) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.insert(sessions).values(sessionRow(ownerId, overrides));
  });

const insertPasskey = (ownerId: string, overrides: Partial<typeof passkeys.$inferInsert> = {}) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.insert(passkeys).values(passkeyRow(ownerId, overrides));
  });

const insertRecoveryCode = (
  ownerId: string,
  overrides: Partial<typeof recoveryCodes.$inferInsert> = {},
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.insert(recoveryCodes).values(recoveryCodeRow(ownerId, overrides));
  });

// asys_app has no grant on sign_in_identities, so rows go in as asys_owner.
const insertSignInIdentity = (ownerId: string, provider: string, subject: string) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      yield* db
        .insert(signInIdentities)
        .values({ ownerId, id: randomUUID(), provider, subject, createdAt });
    }),
  ).pipe(Effect.provide(ownerDatabase()));

const assertCheckViolation = (exit: Exit.Exit<unknown, unknown>, constraint: string) => {
  if (Exit.isSuccess(exit)) {
    return assert.fail(`expected ${constraint} to be violated, but the statement succeeded`);
  }
  const sqlError = findSqlError(Cause.squash(exit.cause));
  if (!sqlError) {
    return assert.fail(`expected an SqlError, got: ${String(Cause.squash(exit.cause))}`);
  }
  const reason = sqlError.reason;
  assert.strictEqual(reason._tag, 'ConstraintError');
  const cause = reason.cause as { readonly code?: string; readonly constraint?: string };
  assert.strictEqual(cause.code, '23514');
  assert.strictEqual(cause.constraint, constraint);
};

const assertUniqueViolation = (exit: Exit.Exit<unknown, unknown>, constraint: string) => {
  if (Exit.isSuccess(exit)) {
    return assert.fail(`expected ${constraint} to be violated, but the statement succeeded`);
  }
  const sqlError = findSqlError(Cause.squash(exit.cause));
  if (!sqlError) {
    return assert.fail(`expected an SqlError, got: ${String(Cause.squash(exit.cause))}`);
  }
  const reason = sqlError.reason;
  if (reason._tag !== 'UniqueViolation') {
    return assert.fail(`expected a UniqueViolation, got: ${reason._tag}`);
  }
  assert.strictEqual(reason.constraint, constraint);
};

interface CheckCase {
  readonly name: string;
  readonly constraint: string;
  readonly violate: (ownerId: string) => Effect.Effect<unknown, unknown, Db>;
}

const insertSettings = (ownerId: string, urgencyWindowDays: number) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.insert(settings).values({ ownerId, timeZone: 'Europe/Amsterdam', urgencyWindowDays });
  });

const checkCases: ReadonlyArray<CheckCase> = [
  {
    name: 'an estimate of 0 minutes',
    constraint: 'tasks_estimate_check',
    violate: (o) => insertTask(o, { estimateMinutes: 0 }),
  },
  {
    name: 'a due time of 24:00',
    constraint: 'tasks_due_time_check',
    violate: (o) => insertTask(o, { dueDate: '2026-10-05', dueTime: '24:00' }),
  },
  {
    name: 'a due time without a due date',
    constraint: 'tasks_due_time_check',
    violate: (o) => insertTask(o, { dueDate: null, dueTime: '10:00' }),
  },
  {
    name: 'an available-from time without an available-from date',
    constraint: 'tasks_available_from_time_check',
    violate: (o) => insertTask(o, { availableFromDate: null, availableFromTime: '10:00' }),
  },
  {
    name: 'a task that blocks itself',
    constraint: 'task_blockers_not_self_check',
    violate: (o) =>
      Effect.gen(function* () {
        const db = yield* Db;
        const id = yield* insertTask(o);
        yield* db
          .insert(taskBlockers)
          .values({ ownerId: o, id: randomUUID(), taskId: id, blockerId: id });
      }),
  },
  {
    name: 'an urgency window of 0 days',
    constraint: 'settings_urgency_window_check',
    violate: (o) => insertSettings(o, 0),
  },
  {
    name: 'a settings change with an entity id',
    constraint: 'change_log_entity_id_check',
    violate: (o) =>
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db
          .insert(changeLog)
          .values(changeRow(o, { entity: ChangeEntity.Settings, entityId: randomUUID() }));
      }),
  },
  {
    name: 'a task change without an entity id',
    constraint: 'change_log_entity_id_check',
    violate: (o) =>
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db.insert(changeLog).values(changeRow(o, { entityId: null }));
      }),
  },
  {
    name: 'a remove change with data',
    constraint: 'change_log_data_check',
    violate: (o) =>
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db.insert(changeLog).values(changeRow(o, { op: ChangeOp.Remove, data: {} }));
      }),
  },
  {
    name: 'a put change without data',
    constraint: 'change_log_data_check',
    violate: (o) =>
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db.insert(changeLog).values(changeRow(o, { op: ChangeOp.Put, data: null }));
      }),
  },
  {
    name: 'pruned_through above last_seq',
    constraint: 'change_counters_seq_check',
    violate: (o) =>
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db.insert(changeCounters).values({ ownerId: o, lastSeq: 1, prunedThrough: 2 });
      }),
  },
  {
    name: 'a negative attempt count',
    constraint: 'jobs_attempts_check',
    violate: (o) => insertJob(o, { attempts: -1 }),
  },
  {
    name: 'a failed job that is not finished',
    constraint: 'jobs_failed_check',
    violate: (o) => insertJob(o, { failed: true, finishedAt: null }),
  },
  {
    name: 'a finished cron job',
    constraint: 'jobs_cron_check',
    violate: (o) => insertJob(o, { cron: '0 3 * * *', finishedAt: createdAt }),
  },
  {
    name: 'an uppercase token hash',
    constraint: 'sign_up_links_token_hash_check',
    violate: (o) => insertSignUpLink(o, { tokenHash: 'ABC' }),
  },
  {
    name: 'an expiry equal to the creation time',
    constraint: 'sign_up_links_expiry_check',
    violate: (o) => insertSignUpLink(o, { expiresAt: createdAt }),
  },
  {
    name: 'an uppercase session token hash',
    constraint: 'sessions_token_hash_check',
    violate: (o) => insertSession(o, { tokenHash: 'ABC' }),
  },
  {
    name: 'a session expiry equal to the creation time',
    constraint: 'sessions_expiry_check',
    violate: (o) => insertSession(o, { expiresAt: createdAt }),
  },
  {
    name: 'an uppercase recovery code hash',
    constraint: 'recovery_codes_code_hash_check',
    violate: (o) => insertRecoveryCode(o, { codeHash: 'ABC' }),
  },
  {
    name: 'a negative counter',
    constraint: 'passkeys_counter_check',
    violate: (o) => insertPasskey(o, { counter: -1 }),
  },
  {
    name: 'a credential id with a character outside base64url',
    constraint: 'passkeys_credential_id_check',
    violate: (o) => insertPasskey(o, { credentialId: 'a+b' }),
  },
  {
    name: 'a credential id of 1367 characters',
    constraint: 'passkeys_credential_id_check',
    violate: (o) => insertPasskey(o, { credentialId: 'a'.repeat(1367) }),
  },
];

layer(appDatabase())('check and unique constraints', (it) => {
  for (const { name, constraint, violate } of checkCases) {
    it.effect(`${constraint} rejects ${name}`, () =>
      Effect.gen(function* () {
        const o = randomUUID();
        const exit = yield* Effect.exit(withOwner(o, violate(o)));

        yield* removeOwner(o);
        assertCheckViolation(exit, constraint);
      }),
    );
  }

  it.effect('task_blockers_link_key rejects the same link under two ids', () =>
    Effect.gen(function* () {
      const db = yield* Db;
      const o = randomUUID();
      const exit = yield* Effect.exit(
        withOwner(
          o,
          Effect.gen(function* () {
            const taskId = yield* insertTask(o);
            const blockerId = yield* insertTask(o);
            yield* db
              .insert(taskBlockers)
              .values({ ownerId: o, id: randomUUID(), taskId, blockerId });
            yield* db
              .insert(taskBlockers)
              .values({ ownerId: o, id: randomUUID(), taskId, blockerId });
          }),
        ),
      );

      yield* removeOwner(o);
      assertUniqueViolation(exit, 'task_blockers_link_key');
    }),
  );

  it.effect('review_items_open_dedupe_key rejects two unresolved items with one key', () =>
    Effect.gen(function* () {
      const db = yield* Db;
      const o = randomUUID();
      const exit = yield* Effect.exit(
        withOwner(
          o,
          Effect.gen(function* () {
            yield* db.insert(reviewItems).values(reviewRow(o));
            yield* db.insert(reviewItems).values(reviewRow(o));
          }),
        ),
      );

      yield* removeOwner(o);
      assertUniqueViolation(exit, 'review_items_open_dedupe_key');
    }),
  );

  it.effect('review_items_open_dedupe_key allows a resolved item beside an open one', () =>
    Effect.gen(function* () {
      const db = yield* Db;
      const o = randomUUID();
      const exit = yield* Effect.exit(
        withOwner(
          o,
          Effect.gen(function* () {
            yield* db.insert(reviewItems).values(reviewRow(o));
            yield* db.insert(reviewItems).values(reviewRow(o, { resolvedAt: createdAt }));
          }),
        ),
      );

      yield* removeOwner(o);
      assert.isTrue(Exit.isSuccess(exit), 'a resolved item must not count as open');
    }),
  );

  it.effect('jobs_dedupe_key rejects two jobs of one owner with one dedupe key', () =>
    Effect.gen(function* () {
      const o = randomUUID();
      const exit = yield* Effect.exit(
        withOwner(
          o,
          Effect.gen(function* () {
            yield* insertJob(o, { dedupeKey: 'k' });
            yield* insertJob(o, { dedupeKey: 'k' });
          }),
        ),
      );

      yield* removeOwner(o);
      assertUniqueViolation(exit, 'jobs_dedupe_key');
    }),
  );

  it.effect('passkeys_credential_id_check accepts a credential id of 1366 characters', () =>
    Effect.gen(function* () {
      const o = randomUUID();
      const exit = yield* Effect.exit(
        withOwner(o, insertPasskey(o, { credentialId: 'a'.repeat(1366) })),
      );

      yield* removeOwner(o);
      assert.isTrue(Exit.isSuccess(exit), 'the longest allowed id must insert');
    }),
  );

  const globalKeyCases: ReadonlyArray<{
    readonly constraint: string;
    readonly insert: (ownerId: string, key: string) => Effect.Effect<unknown, unknown, Db>;
    readonly key: () => string;
  }> = [
    {
      constraint: 'sessions_token_hash_key',
      insert: (o, key) => insertSession(o, { tokenHash: key }),
      key: validHash,
    },
    {
      constraint: 'passkeys_credential_id_key',
      insert: (o, key) => insertPasskey(o, { credentialId: key }),
      key: () => randomBytes(32).toString('base64url'),
    },
    {
      constraint: 'recovery_codes_code_hash_key',
      insert: (o, key) => insertRecoveryCode(o, { codeHash: key }),
      key: validHash,
    },
    {
      constraint: 'sign_up_links_token_hash_key',
      insert: (o, key) => insertSignUpLink(o, { tokenHash: key }),
      key: validHash,
    },
  ];

  for (const { constraint, insert, key } of globalKeyCases) {
    it.effect(`${constraint} rejects the same key under two owners`, () =>
      Effect.gen(function* () {
        const a = randomUUID();
        const b = randomUUID();
        const shared = key();
        yield* withOwner(a, insert(a, shared));
        const exit = yield* Effect.exit(withOwner(b, insert(b, shared)));

        yield* removeOwner(a);
        yield* removeOwner(b);
        assertUniqueViolation(exit, constraint);
      }),
    );
  }

  it.effect('sign_in_identities_subject_key rejects the same provider and subject twice', () =>
    Effect.gen(function* () {
      const a = randomUUID();
      const b = randomUUID();
      const subject = randomUUID();
      yield* insertSignInIdentity(a, 'oidc', subject);
      const exit = yield* Effect.exit(insertSignInIdentity(b, 'oidc', subject));

      yield* removeOwner(a);
      yield* removeOwner(b);
      assertUniqueViolation(exit, 'sign_in_identities_subject_key');
    }),
  );
});
