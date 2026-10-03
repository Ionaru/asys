// SPDX-License-Identifier: EUPL-1.2
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
// Type-only: drizzle-kit loads this file with jiti, which cannot resolve the
// @asys/domain path alias, so the enum values below are literal tuples.
import type {
  ActiveHours,
  ChangeEntity,
  ChangeOp,
  Privacy,
  ReviewSubject,
  TaskKind,
  TaskStatus,
  Voice,
} from '@asys/domain';

const ownerId = () => uuid('owner_id').notNull();

const ownerPolicy = (table: string, column: AnyPgColumn) =>
  pgPolicy(`${table}_owner`, {
    as: 'permissive',
    for: 'all',
    to: 'public',
    using: sql`${column} = nullif(current_setting('app.owner_id', true), '')::uuid`,
    withCheck: sql`${column} = nullif(current_setting('app.owner_id', true), '')::uuid`,
  });

const instant = (column: string) =>
  timestamp(column, { withTimezone: true, precision: 3, mode: 'date' });

export const taskKind = pgEnum('task_kind', ['task', 'check_in', 'member_template']);

export const taskStatus = pgEnum('task_status', [
  'open',
  'done',
  'dropped',
  'delegated',
  'skipped',
]);

export const voice = pgEnum('voice', ['out_loud', 'closed_door']);

export const privacy = pgEnum('privacy', ['visible', 'private', 'hidden']);

export const changeEntity = pgEnum('change_entity', [
  'task',
  'blocker',
  'area',
  'review_item',
  'settings',
]);

export const changeOp = pgEnum('change_op', ['put', 'remove']);

export const users = pgTable.withRLS(
  'users',
  {
    ownerId: ownerId(),
    name: text('name').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'users_pkey', columns: [t.ownerId] }),
    ownerPolicy('users', t.ownerId),
  ],
);

export const settings = pgTable.withRLS(
  'settings',
  {
    ownerId: ownerId(),
    timeZone: text('time_zone').notNull(),
    urgencyWindowDays: integer('urgency_window_days').notNull(),
  },
  (t) => [
    primaryKey({ name: 'settings_pkey', columns: [t.ownerId] }),
    check('settings_urgency_window_check', sql`${t.urgencyWindowDays} > 0`),
    ownerPolicy('settings', t.ownerId),
  ],
);

export const areas = pgTable.withRLS(
  'areas',
  {
    ownerId: ownerId(),
    id: uuid('id').notNull(),
    name: text('name').notNull(),
    activeHours: jsonb('active_hours').$type<ActiveHours>().notNull(),
    defaultPrivacy: privacy('default_privacy').$type<Privacy>(),
    version: integer('version').notNull(),
  },
  (t) => [
    primaryKey({ name: 'areas_pkey', columns: [t.ownerId, t.id] }),
    ownerPolicy('areas', t.ownerId),
  ],
);

export const tasks = pgTable.withRLS(
  'tasks',
  {
    ownerId: ownerId(),
    id: uuid('id').notNull(),
    kind: taskKind('kind').$type<TaskKind>().notNull(),
    status: taskStatus('status').$type<TaskStatus>().notNull(),
    title: text('title').notNull(),
    notes: text('notes').notNull(),
    captureText: text('capture_text').notNull(),
    areaId: uuid('area_id'),
    availableFromDate: date('available_from_date', { mode: 'string' }),
    availableFromTime: text('available_from_time'),
    dueDate: date('due_date', { mode: 'string' }),
    dueTime: text('due_time'),
    estimateMinutes: integer('estimate_minutes'),
    important: boolean('important'),
    voice: voice('voice').$type<Voice>(),
    privacy: privacy('privacy').$type<Privacy>(),
    dueMoveCount: integer('due_move_count').notNull(),
    version: integer('version').notNull(),
    createdAt: instant('created_at').notNull(),
    closedAt: instant('closed_at'),
  },
  (t) => [
    primaryKey({ name: 'tasks_pkey', columns: [t.ownerId, t.id] }),
    foreignKey({
      name: 'tasks_area_fk',
      columns: [t.ownerId, t.areaId],
      foreignColumns: [areas.ownerId, areas.id],
    }),
    check(
      'tasks_available_from_time_check',
      sql`${t.availableFromTime} is null or (${t.availableFromDate} is not null and ${t.availableFromTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`,
    ),
    check(
      'tasks_due_time_check',
      sql`${t.dueTime} is null or (${t.dueDate} is not null and ${t.dueTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`,
    ),
    check('tasks_estimate_check', sql`${t.estimateMinutes} > 0`),
    ownerPolicy('tasks', t.ownerId),
  ],
);

export const taskBlockers = pgTable.withRLS(
  'task_blockers',
  {
    ownerId: ownerId(),
    id: uuid('id').notNull(),
    taskId: uuid('task_id').notNull(),
    blockerId: uuid('blocker_id').notNull(),
  },
  (t) => [
    primaryKey({ name: 'task_blockers_pkey', columns: [t.ownerId, t.id] }),
    foreignKey({
      name: 'task_blockers_task_fk',
      columns: [t.ownerId, t.taskId],
      foreignColumns: [tasks.ownerId, tasks.id],
    }),
    foreignKey({
      name: 'task_blockers_blocker_fk',
      columns: [t.ownerId, t.blockerId],
      foreignColumns: [tasks.ownerId, tasks.id],
    }),
    unique('task_blockers_link_key').on(t.ownerId, t.taskId, t.blockerId),
    check('task_blockers_not_self_check', sql`${t.taskId} <> ${t.blockerId}`),
    ownerPolicy('task_blockers', t.ownerId),
  ],
);

export const reviewItems = pgTable.withRLS(
  'review_items',
  {
    ownerId: ownerId(),
    id: uuid('id').notNull(),
    kind: text('kind').notNull(),
    subjects: jsonb('subjects').$type<readonly ReviewSubject[]>().notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    dedupeKey: text('dedupe_key'),
    createdAt: instant('created_at').notNull(),
    resolvedAt: instant('resolved_at'),
  },
  (t) => [
    primaryKey({ name: 'review_items_pkey', columns: [t.ownerId, t.id] }),
    uniqueIndex('review_items_open_dedupe_key')
      .on(t.ownerId, t.dedupeKey)
      .where(sql`${t.resolvedAt} is null`),
    ownerPolicy('review_items', t.ownerId),
  ],
);

export const changeLog = pgTable.withRLS(
  'change_log',
  {
    ownerId: ownerId(),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    entity: changeEntity('entity').$type<ChangeEntity>().notNull(),
    entityId: uuid('entity_id'),
    op: changeOp('op').$type<ChangeOp>().notNull(),
    data: jsonb('data').$type<unknown>(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'change_log_pkey', columns: [t.ownerId, t.seq] }),
    check('change_log_entity_id_check', sql`(${t.entity} = 'settings') = (${t.entityId} is null)`),
    check('change_log_data_check', sql`(${t.op} = 'remove') = (${t.data} is null)`),
    ownerPolicy('change_log', t.ownerId),
  ],
);

export const changeCounters = pgTable.withRLS(
  'change_counters',
  {
    ownerId: ownerId(),
    lastSeq: bigint('last_seq', { mode: 'number' }).notNull().default(0),
    prunedThrough: bigint('pruned_through', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'change_counters_pkey', columns: [t.ownerId] }),
    check(
      'change_counters_seq_check',
      sql`0 <= ${t.prunedThrough} and ${t.prunedThrough} <= ${t.lastSeq}`,
    ),
    ownerPolicy('change_counters', t.ownerId),
  ],
);

export const idempotencyKeys = pgTable.withRLS(
  'idempotency_keys',
  {
    ownerId: ownerId(),
    key: uuid('key').notNull(),
    command: text('command').notNull(),
    requestHash: text('request_hash').notNull(),
    result: jsonb('result').$type<unknown>().notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'idempotency_keys_pkey', columns: [t.ownerId, t.key] }),
    ownerPolicy('idempotency_keys', t.ownerId),
  ],
);

export const jobs = pgTable.withRLS(
  'jobs',
  {
    ownerId: ownerId(),
    id: uuid('id').notNull(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    runAt: instant('run_at').notNull(),
    cron: text('cron'),
    dedupeKey: text('dedupe_key'),
    attempts: integer('attempts').notNull().default(0),
    claimedUntil: instant('claimed_until'),
    lastError: text('last_error'),
    finishedAt: instant('finished_at'),
    failed: boolean('failed').notNull().default(false),
  },
  (t) => [
    primaryKey({ name: 'jobs_pkey', columns: [t.ownerId, t.id] }),
    unique('jobs_dedupe_key').on(t.ownerId, t.dedupeKey),
    check('jobs_attempts_check', sql`${t.attempts} >= 0`),
    check('jobs_failed_check', sql`not ${t.failed} or ${t.finishedAt} is not null`),
    check('jobs_cron_check', sql`${t.cron} is null or ${t.finishedAt} is null`),
    index('jobs_due_idx')
      .on(t.runAt)
      .where(sql`${t.finishedAt} is null`),
    ownerPolicy('jobs', t.ownerId),
  ],
);

export const signUpLinks = pgTable.withRLS(
  'sign_up_links',
  {
    ownerId: ownerId(),
    id: uuid('id').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdAt: instant('created_at').notNull(),
    expiresAt: instant('expires_at').notNull(),
    usedAt: instant('used_at'),
  },
  (t) => [
    primaryKey({ name: 'sign_up_links_pkey', columns: [t.ownerId, t.id] }),
    unique('sign_up_links_token_hash_key').on(t.tokenHash),
    check('sign_up_links_token_hash_check', sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check('sign_up_links_expiry_check', sql`${t.expiresAt} > ${t.createdAt}`),
    ownerPolicy('sign_up_links', t.ownerId),
  ],
);

export const passkeys = pgTable.withRLS(
  'passkeys',
  {
    ownerId: ownerId(),
    id: uuid('id').notNull(),
    credentialId: text('credential_id').notNull(),
    publicKey: text('public_key').notNull(),
    counter: bigint('counter', { mode: 'number' }).notNull(),
    transports: jsonb('transports').$type<readonly string[]>().notNull(),
    backedUp: boolean('backed_up').notNull(),
    name: text('name').notNull(),
    createdAt: instant('created_at').notNull(),
    lastUsedAt: instant('last_used_at'),
  },
  (t) => [
    primaryKey({ name: 'passkeys_pkey', columns: [t.ownerId, t.id] }),
    unique('passkeys_credential_id_key').on(t.credentialId),
    check(
      'passkeys_credential_id_check',
      sql`${t.credentialId} ~ '^[A-Za-z0-9_-]+$' and char_length(${t.credentialId}) <= 1366`,
    ),
    check('passkeys_counter_check', sql`${t.counter} >= 0`),
    ownerPolicy('passkeys', t.ownerId),
  ],
);

export const recoveryCodes = pgTable.withRLS(
  'recovery_codes',
  {
    ownerId: ownerId(),
    id: uuid('id').notNull(),
    codeHash: text('code_hash').notNull(),
    createdAt: instant('created_at').notNull(),
    usedAt: instant('used_at'),
  },
  (t) => [
    primaryKey({ name: 'recovery_codes_pkey', columns: [t.ownerId, t.id] }),
    unique('recovery_codes_code_hash_key').on(t.codeHash),
    check('recovery_codes_code_hash_check', sql`${t.codeHash} ~ '^[0-9a-f]{64}$'`),
    ownerPolicy('recovery_codes', t.ownerId),
  ],
);

export const sessions = pgTable.withRLS(
  'sessions',
  {
    ownerId: ownerId(),
    id: uuid('id').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdAt: instant('created_at').notNull(),
    expiresAt: instant('expires_at').notNull(),
  },
  (t) => [
    primaryKey({ name: 'sessions_pkey', columns: [t.ownerId, t.id] }),
    unique('sessions_token_hash_key').on(t.tokenHash),
    check('sessions_token_hash_check', sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check('sessions_expiry_check', sql`${t.expiresAt} > ${t.createdAt}`),
    ownerPolicy('sessions', t.ownerId),
  ],
);

export const signInIdentities = pgTable.withRLS(
  'sign_in_identities',
  {
    ownerId: ownerId(),
    id: uuid('id').notNull(),
    provider: text('provider').notNull(),
    subject: text('subject').notNull(),
    createdAt: instant('created_at').notNull(),
  },
  (t) => [
    primaryKey({ name: 'sign_in_identities_pkey', columns: [t.ownerId, t.id] }),
    unique('sign_in_identities_subject_key').on(t.provider, t.subject),
    ownerPolicy('sign_in_identities', t.ownerId),
  ],
);
