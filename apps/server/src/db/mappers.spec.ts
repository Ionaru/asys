// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import {
  Privacy,
  TaskKind,
  TaskStatus,
  Voice,
  WORK_ACTIVE_HOURS,
  type Area,
  type BlockerLink,
  type ReviewItem,
  type Settings,
  type Task,
} from '@asys/domain';
import { assert, describe, it, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { removeOwner } from '../test/owners';
import { Db, appDatabase } from './database';
import {
  areaToRow,
  linkToRow,
  reviewItemToRow,
  rowToArea,
  rowToLink,
  rowToReviewItem,
  rowToSettings,
  rowToTask,
  settingsToRow,
  taskToRow,
} from './mappers';
import { areas, reviewItems, settings, taskBlockers, tasks } from './schema';
import { withOwner } from './with-owner';

// These tests write domain values through the mappers into the real database
// (docker compose), read them back and compare with the original value.

const task = (overrides: Partial<Task> = {}): Task => ({
  id: randomUUID(),
  kind: TaskKind.Task,
  status: TaskStatus.Open,
  title: 'a task',
  notes: 'some notes',
  captureText: 'captured',
  areaId: null,
  availableFrom: null,
  due: null,
  estimateMinutes: null,
  important: null,
  voice: null,
  privacy: null,
  dueMoveCount: 0,
  version: 1,
  createdAt: 1_000_000,
  closedAt: null,
  ...overrides,
});

const area = (overrides: Partial<Area> = {}): Area => ({
  id: randomUUID(),
  name: 'An area',
  activeHours: WORK_ACTIVE_HOURS,
  defaultPrivacy: null,
  version: 1,
  ...overrides,
});

const insertAndReadTask = (owner: string, input: Task) =>
  withOwner(
    owner,
    Effect.gen(function* () {
      const db = yield* Db;
      yield* db.insert(tasks).values(taskToRow(owner, input));
      const rows = yield* db.select().from(tasks);
      return rows.map(rowToTask);
    }),
  );

const insertAndReadAreas = (owner: string, input: readonly Area[]) =>
  withOwner(
    owner,
    Effect.gen(function* () {
      const db = yield* Db;
      yield* db.insert(areas).values(input.map((a) => areaToRow(owner, a)));
      const rows = yield* db.select().from(areas);
      return rows.map(rowToArea).toSorted((a, b) => a.id.localeCompare(b.id));
    }),
  );

const insertAndReadReviewItems = (owner: string, input: readonly ReviewItem[]) =>
  withOwner(
    owner,
    Effect.gen(function* () {
      const db = yield* Db;
      yield* db.insert(reviewItems).values(input.map((item) => reviewItemToRow(owner, item)));
      const rows = yield* db.select().from(reviewItems);
      return rows.map(rowToReviewItem).toSorted((a, b) => a.id.localeCompare(b.id));
    }),
  );

const byId = <T extends { readonly id: string }>(items: readonly T[]) =>
  items.toSorted((a, b) => a.id.localeCompare(b.id));

layer(appDatabase())('mappers against the database', (it) => {
  it.effect('a task with every field set survives a round trip', () =>
    Effect.gen(function* () {
      const owner = randomUUID();
      const theArea = area();
      const input = task({
        areaId: theArea.id,
        due: { date: '2026-12-15', time: '10:00' },
        availableFrom: { date: '2026-12-14' },
        estimateMinutes: 30,
        important: true,
        voice: Voice.OutLoud,
        privacy: Privacy.Private,
        status: TaskStatus.Done,
        dueMoveCount: 2,
        version: 3,
        createdAt: 1_000_000,
        closedAt: 2_000_000,
      });
      yield* insertAndReadAreas(owner, [theArea]);
      const result = yield* insertAndReadTask(owner, input);

      yield* removeOwner(owner);
      assert.deepStrictEqual(result, [input]);
    }),
  );

  it.effect('a task with every nullable field null survives a round trip', () =>
    Effect.gen(function* () {
      const owner = randomUUID();
      const input = task();
      const result = yield* insertAndReadTask(owner, input);

      yield* removeOwner(owner);
      assert.deepStrictEqual(result, [input]);
    }),
  );

  it.effect('createdAt 0 and closedAt 0 come back as 0, not null', () =>
    Effect.gen(function* () {
      const owner = randomUUID();
      const input = task({ createdAt: 0, closedAt: 0 });
      const result = yield* insertAndReadTask(owner, input);

      yield* removeOwner(owner);
      assert.deepStrictEqual(result, [input]);
    }),
  );

  it.effect('important false and sub-second instants survive a round trip', () =>
    Effect.gen(function* () {
      const owner = randomUUID();
      const input = task({
        important: false,
        status: TaskStatus.Done,
        createdAt: 1_760_000_000_123,
        closedAt: 1_760_000_000_456,
      });
      const result = yield* insertAndReadTask(owner, input);

      yield* removeOwner(owner);
      assert.deepStrictEqual(result, [input]);
    }),
  );

  it.effect('a review item with a sub-second createdAt survives a round trip', () =>
    Effect.gen(function* () {
      const owner = randomUUID();
      const input: ReviewItem = {
        id: randomUUID(),
        kind: 'expectation_failed',
        subjects: [],
        payload: { reason: 'x' },
        dedupeKey: null,
        createdAt: 1_760_000_000_789,
        resolvedAt: null,
      };
      const result = yield* insertAndReadReviewItems(owner, [input]);

      yield* removeOwner(owner);
      assert.deepStrictEqual(result, [input]);
    }),
  );

  it.effect('a date-only due comes back without a time key', () =>
    Effect.gen(function* () {
      const owner = randomUUID();
      const input = task({
        due: { date: '2026-12-15' },
        availableFrom: { date: '2026-12-14', time: '08:30' },
      });
      const result = yield* insertAndReadTask(owner, input);

      yield* removeOwner(owner);
      assert.deepStrictEqual(result, [input]);
      assert.isFalse('time' in (result[0].due ?? {}));
    }),
  );

  it.effect('areas survive a round trip, with and without a default privacy', () =>
    Effect.gen(function* () {
      const owner = randomUUID();
      const hidden = area({ defaultPrivacy: Privacy.Hidden, version: 4 });
      const none = area({ name: 'Other', defaultPrivacy: null });
      const result = yield* insertAndReadAreas(owner, [hidden, none]);

      yield* removeOwner(owner);
      assert.deepStrictEqual(result, byId([hidden, none]));
    }),
  );

  it.effect('review items survive a round trip, with and without optional fields', () =>
    Effect.gen(function* () {
      const owner = randomUUID();
      const taskId = randomUUID();
      const areaId = randomUUID();
      const full: ReviewItem = {
        id: randomUUID(),
        kind: 'expectation_failed',
        subjects: [
          { type: 'task', id: taskId },
          { type: 'area', id: areaId },
        ],
        payload: {
          command: { _tag: 'DropTask', taskId },
          reason: 'expectation_failed',
        },
        dedupeKey: 'k1',
        createdAt: 1_000_000,
        resolvedAt: 2_000_000,
      };
      const bare: ReviewItem = {
        id: randomUUID(),
        kind: 'expectation_failed',
        subjects: [],
        payload: { reason: 'x' },
        dedupeKey: null,
        createdAt: 0,
        resolvedAt: null,
      };
      const result = yield* insertAndReadReviewItems(owner, [full, bare]);

      yield* removeOwner(owner);
      assert.deepStrictEqual(result, byId([full, bare]));
    }),
  );

  it.effect('a blocker link between two tasks survives a round trip', () =>
    Effect.gen(function* () {
      const owner = randomUUID();
      const blocked = task();
      const blocker = task();
      const link: BlockerLink = { id: randomUUID(), taskId: blocked.id, blockerId: blocker.id };
      const result = yield* withOwner(
        owner,
        Effect.gen(function* () {
          const db = yield* Db;
          yield* db.insert(tasks).values([taskToRow(owner, blocked), taskToRow(owner, blocker)]);
          yield* db.insert(taskBlockers).values(linkToRow(owner, link));
          const rows = yield* db.select().from(taskBlockers);
          return rows.map(rowToLink);
        }),
      );

      yield* removeOwner(owner);
      assert.deepStrictEqual(result, [link]);
    }),
  );

  it.effect('settings survive a round trip', () =>
    Effect.gen(function* () {
      const owner = randomUUID();
      const input: Settings = { timeZone: 'Europe/London', urgencyWindowDays: 5 };
      const result = yield* withOwner(
        owner,
        Effect.gen(function* () {
          const db = yield* Db;
          yield* db.insert(settings).values(settingsToRow(owner, input));
          const rows = yield* db.select().from(settings);
          return rows.map(rowToSettings);
        }),
      );

      yield* removeOwner(owner);
      assert.deepStrictEqual(result, [input]);
    }),
  );
});

describe('taskToRow', () => {
  it('splits the date specs into date and time columns and writes instants as dates', () => {
    const owner = randomUUID();
    const row = taskToRow(
      owner,
      task({
        due: { date: '2026-12-15', time: '10:00' },
        availableFrom: { date: '2026-12-14' },
        createdAt: 1_000_000,
      }),
    );

    assert.strictEqual(row.ownerId, owner);
    assert.strictEqual(row.dueDate, '2026-12-15');
    assert.strictEqual(row.dueTime, '10:00');
    assert.strictEqual(row.availableFromDate, '2026-12-14');
    assert.strictEqual(row.availableFromTime, null);
    assert.instanceOf(row.createdAt, Date);
    assert.strictEqual((row.createdAt as Date).getTime(), 1_000_000);
  });
});
