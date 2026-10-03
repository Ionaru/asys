// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { assert, describe, it, layer } from '@effect/vitest';
import { sql } from 'drizzle-orm';
import { Cause, Config, ConfigProvider, Effect, Exit, Schema } from 'effect';
import { appDatabase, Db } from '../db/database';
import { jobs } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { scopedOwner } from '../test/owners';
import { UnknownJobKind } from '../jobs/job-error';
import { describeError } from './describe-error';

describe('describeError', () => {
  it('names the tag of a typed failure', () => {
    assert.strictEqual(describeError(Cause.fail({ _tag: 'Boom' })), 'Fail: Boom');
  });

  it('names the class of a defect and never its message', () => {
    const described = describeError(Cause.die(new TypeError('secret title')));

    assert.strictEqual(described, 'Die: TypeError');
    assert.notInclude(described, 'secret');
  });

  it('says Interrupted for a cause with only interrupts', () => {
    assert.strictEqual(describeError(Cause.interrupt()), 'Interrupted');
  });

  it('replaces a tag with unsafe characters by Unknown', () => {
    assert.strictEqual(describeError(Cause.fail({ _tag: 'a b<script>' })), 'Fail: Unknown');
  });

  it('names an unknown job kind by its tag', () => {
    assert.strictEqual(
      describeError(Cause.fail(new UnknownJobKind({ kind: 'x' }))),
      'Fail: UnknownJobKind',
    );
  });

  it('names the variable of a missing configuration value', () => {
    const exit = Effect.runSyncExit(
      Config.String('ASYS_RP_ID').pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord({}))),
      ),
    );

    assert.isTrue(Exit.isFailure(exit));
    if (Exit.isFailure(exit)) {
      assert.strictEqual(describeError(exit.cause), 'Fail: ConfigError ASYS_RP_ID');
    }
  });

  it('names the variable of an invalid configuration value but never the value', () => {
    const origin = Config.schema(
      Schema.String.check(Schema.makeFilter((value: string) => value.startsWith('https://'))),
      'ASYS_PUBLIC_ORIGIN',
    );
    const exit = Effect.runSyncExit(
      origin.pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnvRecord({ ASYS_PUBLIC_ORIGIN: 'http://secret-value.example' }),
          ),
        ),
      ),
    );

    assert.isTrue(Exit.isFailure(exit));
    if (Exit.isFailure(exit)) {
      const described = describeError(exit.cause);
      assert.strictEqual(described, 'Fail: ConfigError ASYS_PUBLIC_ORIGIN');
      assert.notInclude(described, 'secret');
    }
  });
});

layer(appDatabase(), { excludeTestServices: true })('describeError, SQL errors', (it) => {
  it.effect('gives the tag and SQLSTATE of a driver error without its parameters', () =>
    Effect.gen(function* () {
      const db = yield* Db;

      const exit = yield* Effect.exit(db.execute(sql`select ${'secret-value'}::int`));

      assert.isTrue(Exit.isFailure(exit));
      if (Exit.isFailure(exit)) {
        const described = describeError(exit.cause);
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
          describeError(exit.cause),
          'Fail: SqlError UniqueViolation 23505 jobs_dedupe_key',
        );
      }
    }),
  );
});
