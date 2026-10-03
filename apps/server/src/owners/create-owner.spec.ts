// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { PERSONAL_ACTIVE_HOURS, Privacy, WORK_ACTIVE_HOURS } from '@asys/domain';
import { assert, layer } from '@effect/vitest';
import { Clock, Effect } from 'effect';
import { TestClock } from 'effect/testing';
import { Db, appDatabase } from '../db/database';
import { rowToArea, rowToSettings } from '../db/mappers';
import { areas, changeCounters, changeLog, jobs, settings, users } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { removeOwner } from '../test/owners';
import { createOwner, CreateOwnerRejected, CreateOwnerRejectedReason } from './create-owner';

// These tests run against the real database (docker compose). Every owner id
// is random, so rows left by other runs never match.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const snapshot = (ownerId: string) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      return {
        users: yield* db.select().from(users),
        settings: yield* db.select().from(settings),
        areas: yield* db.select().from(areas),
        counters: yield* db.select().from(changeCounters),
        log: yield* db.select().from(changeLog),
        jobs: yield* db.select().from(jobs),
      };
    }),
  );

const assertEmpty = (rows: Effect.Success<ReturnType<typeof snapshot>>) => {
  assert.strictEqual(rows.users.length, 0);
  assert.strictEqual(rows.settings.length, 0);
  assert.strictEqual(rows.areas.length, 0);
  assert.strictEqual(rows.counters.length, 0);
  assert.strictEqual(rows.log.length, 0);
  assert.strictEqual(rows.jobs.length, 0);
};

const rejection = (input: { readonly name: string; readonly timeZone: string }) =>
  Effect.gen(function* () {
    const ownerId = randomUUID();
    const failure = yield* Effect.flip(createOwner({ ownerId, ...input }));
    const rows = yield* snapshot(ownerId);

    yield* removeOwner(ownerId);
    return { failure, rows };
  });

const assertRejected = (failure: unknown, reason: CreateOwnerRejectedReason) => {
  assert.instanceOf(failure, CreateOwnerRejected);
  assert.strictEqual((failure as CreateOwnerRejected)._tag, 'CreateOwnerRejected');
  assert.strictEqual((failure as CreateOwnerRejected).reason, reason);
};

layer(appDatabase())('createOwner', (it) => {
  it.effect('sets up the user, settings, two seeded areas and a zero counter', () =>
    Effect.gen(function* () {
      const ownerId = randomUUID();
      yield* createOwner({ ownerId, name: '  Jeroen ', timeZone: 'Europe/Amsterdam' });
      const rows = yield* snapshot(ownerId);

      yield* removeOwner(ownerId);
      assert.strictEqual(rows.users.length, 1);
      assert.strictEqual(rows.users[0].name, 'Jeroen');

      assert.strictEqual(rows.settings.length, 1);
      assert.deepStrictEqual(rowToSettings(rows.settings[0]), {
        timeZone: 'Europe/Amsterdam',
        urgencyWindowDays: 2,
      });

      const seeded = rows.areas.map(rowToArea).toSorted((a, b) => a.name.localeCompare(b.name));
      assert.strictEqual(seeded.length, 2);
      const [personal, work] = seeded;
      assert.deepStrictEqual(
        { ...personal, id: '' },
        {
          id: '',
          name: 'Personal',
          activeHours: PERSONAL_ACTIVE_HOURS,
          defaultPrivacy: Privacy.Hidden,
          version: 1,
        },
      );
      assert.deepStrictEqual(
        { ...work, id: '' },
        { id: '', name: 'Work', activeHours: WORK_ACTIVE_HOURS, defaultPrivacy: null, version: 1 },
      );
      assert.match(personal.id, UUID_PATTERN);
      assert.match(work.id, UUID_PATTERN);
      assert.notStrictEqual(personal.id, work.id);

      assert.strictEqual(rows.counters.length, 1);
      assert.strictEqual(rows.counters[0].lastSeq, 0);
      assert.strictEqual(rows.counters[0].prunedThrough, 0);

      assert.strictEqual(rows.log.length, 0);
    }),
  );

  it.effect('rejects an unknown time zone and writes nothing', () =>
    Effect.gen(function* () {
      const { failure, rows } = yield* rejection({ name: 'Jeroen', timeZone: 'Mars/Base' });

      assertRejected(failure, CreateOwnerRejectedReason.InvalidTimeZone);
      assertEmpty(rows);
    }),
  );

  it.effect('rejects a UTC offset as a time zone and writes nothing', () =>
    Effect.gen(function* () {
      const { failure, rows } = yield* rejection({ name: 'Jeroen', timeZone: '+02:00' });

      assertRejected(failure, CreateOwnerRejectedReason.InvalidTimeZone);
      assertEmpty(rows);
    }),
  );

  it.effect('rejects a blank name and writes nothing', () =>
    Effect.gen(function* () {
      const { failure, rows } = yield* rejection({ name: '   ', timeZone: 'Europe/Amsterdam' });

      assertRejected(failure, CreateOwnerRejectedReason.InvalidName);
      assertEmpty(rows);
    }),
  );

  it.effect('rejects a name with a NUL character and writes nothing', () =>
    Effect.gen(function* () {
      const { failure, rows } = yield* rejection({
        name: 'a\u0000b',
        timeZone: 'Europe/Amsterdam',
      });

      assertRejected(failure, CreateOwnerRejectedReason.InvalidName);
      assertEmpty(rows);
    }),
  );

  it.effect('a second call for the same owner fails and leaves the first setup untouched', () =>
    Effect.gen(function* () {
      const ownerId = randomUUID();
      yield* createOwner({ ownerId, name: 'Jeroen', timeZone: 'Europe/Amsterdam' });
      const failure = yield* Effect.flip(
        createOwner({ ownerId, name: 'Other', timeZone: 'Europe/London' }),
      );
      const rows = yield* snapshot(ownerId);

      yield* removeOwner(ownerId);
      assertRejected(failure, CreateOwnerRejectedReason.OwnerExists);
      assert.strictEqual(rows.users.length, 1);
      assert.strictEqual(rows.users[0].name, 'Jeroen');
      assert.strictEqual(rows.settings.length, 1);
      assert.strictEqual(rows.settings[0].timeZone, 'Europe/Amsterdam');
      assert.strictEqual(rows.areas.length, 2);
      assert.strictEqual(rows.counters.length, 1);
      assert.strictEqual(rows.jobs.length, 1);
    }),
  );

  it.effect('another owner sees none of the created rows', () =>
    Effect.gen(function* () {
      const a = randomUUID();
      const b = randomUUID();
      yield* createOwner({ ownerId: a, name: 'Jeroen', timeZone: 'Europe/Amsterdam' });
      const seenByB = yield* snapshot(b);

      yield* removeOwner(a);
      yield* removeOwner(b);
      assertEmpty(seenByB);
    }),
  );
});

const NOW = Date.parse('2026-10-02T12:00:00Z');

/**
 * Runs `effect` with `Clock` reading NOW, while sleeps and timeouts (the connection pool's)
 * stay on the live clock. Jumping the TestClock this far would fire those timers at once.
 */
const atNow = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  TestClock.withLive(
    Clock.clockWith((live) =>
      Effect.provideService(
        effect,
        Clock.Clock,
        Object.assign(Object.create(live) as Clock.Clock, {
          currentTimeMillisUnsafe: () => NOW,
          currentTimeMillis: Effect.succeed(NOW),
        }),
      ),
    ),
  );

layer(appDatabase())('createOwner, the prune job', (it) => {
  it.effect('schedules one daily prune job at the next 03:00 in the owner time zone', () =>
    Effect.gen(function* () {
      const ownerId = randomUUID();
      yield* atNow(createOwner({ ownerId, name: 'Jeroen', timeZone: 'Europe/Amsterdam' }));
      const rows = yield* snapshot(ownerId);

      yield* removeOwner(ownerId);
      assert.strictEqual(rows.jobs.length, 1);
      const [job] = rows.jobs;
      assert.strictEqual(job.kind, 'prune');
      assert.deepStrictEqual(job.payload, {});
      assert.strictEqual(job.cron, '0 3 * * *');
      assert.strictEqual(job.dedupeKey, 'prune');
      assert.strictEqual(job.runAt.toISOString(), '2026-10-03T01:00:00.000Z');
      assert.strictEqual(job.attempts, 0);
      assert.strictEqual(job.failed, false);
      assert.strictEqual(job.claimedUntil, null);
      assert.strictEqual(job.finishedAt, null);
      assert.strictEqual(job.lastError, null);
    }),
  );

  it.effect('computes the first run in the owner time zone', () =>
    Effect.gen(function* () {
      const ownerId = randomUUID();
      yield* atNow(createOwner({ ownerId, name: 'Jeroen', timeZone: 'Asia/Tokyo' }));
      const rows = yield* snapshot(ownerId);

      yield* removeOwner(ownerId);
      assert.strictEqual(rows.jobs.length, 1);
      assert.strictEqual(rows.jobs[0].runAt.toISOString(), '2026-10-02T18:00:00.000Z');
    }),
  );

  it.effect('accepts GMT as a time zone and schedules the first run at 03:00 GMT', () =>
    Effect.gen(function* () {
      const ownerId = randomUUID();
      yield* atNow(createOwner({ ownerId, name: 'Jeroen', timeZone: 'GMT' }));
      const rows = yield* snapshot(ownerId);

      yield* removeOwner(ownerId);
      assert.strictEqual(rows.jobs.length, 1);
      assert.strictEqual(rows.jobs[0].runAt.toISOString(), '2026-10-03T03:00:00.000Z');
    }),
  );
});
