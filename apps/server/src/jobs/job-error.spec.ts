// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { assert, describe, it, layer } from '@effect/vitest';
import { sql } from 'drizzle-orm';
import { Cause, Effect, Exit } from 'effect';
import { appDatabase, Db } from '../db/database';
import { jobs } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { scopedOwner } from '../test/owners';
import { describeJobError, UnknownJobKind } from './job-error';

describe('describeJobError', () => {
  it('names the tag of a typed failure', () => {
    assert.strictEqual(describeJobError(Cause.fail({ _tag: 'Boom' })), 'Fail: Boom');
  });

  it('names the class of a defect and never its message', () => {
    const described = describeJobError(Cause.die(new TypeError('secret title')));

    assert.strictEqual(described, 'Die: TypeError');
    assert.notInclude(described, 'secret');
  });

  it('says Interrupted for a cause with only interrupts', () => {
    assert.strictEqual(describeJobError(Cause.interrupt()), 'Interrupted');
  });

  it('replaces a tag with unsafe characters by Unknown', () => {
    assert.strictEqual(describeJobError(Cause.fail({ _tag: 'a b<script>' })), 'Fail: Unknown');
  });

  it('names an unknown job kind by its tag', () => {
    assert.strictEqual(
      describeJobError(Cause.fail(new UnknownJobKind({ kind: 'x' }))),
      'Fail: UnknownJobKind',
    );
  });
});

layer(appDatabase(), { excludeTestServices: true })('describeJobError, SQL errors', (it) => {
  it.effect('gives the tag and SQLSTATE of a driver error without its parameters', () =>
    Effect.gen(function* () {
      const db = yield* Db;

      const exit = yield* Effect.exit(db.execute(sql`select ${'secret-value'}::int`));

      assert.isTrue(Exit.isFailure(exit));
      if (Exit.isFailure(exit)) {
        const described = describeJobError(exit.cause);
        assert.strictEqual(described, 'Fail: SqlError UnknownError 22P02');
        assert.notInclude(described, 'secret');
      }
    }),
  );

  it.effect('adds the constraint of a unique violation', () =>
    Effect.gen(function* () {
      const owner = yield* scopedOwner();
      const db = yield* Db;
      const insert = () =>
        withOwner(
          owner,
          db.insert(jobs).values({
            ownerId: owner,
            id: randomUUID(),
            kind: 'test',
            payload: {},
            runAt: new Date(Date.UTC(1900, 0, 1)),
            dedupeKey: 'same-key',
          }),
        );
      yield* insert();

      const exit = yield* Effect.exit(insert());

      assert.isTrue(Exit.isFailure(exit));
      if (Exit.isFailure(exit)) {
        assert.strictEqual(
          describeJobError(exit.cause),
          'Fail: SqlError UniqueViolation 23505 jobs_dedupe_key',
        );
      }
    }),
  );
});
