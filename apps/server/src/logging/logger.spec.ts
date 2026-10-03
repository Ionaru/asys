// SPDX-License-Identifier: EUPL-1.2
import { assert, describe, it } from '@effect/vitest';
import { Cause, Effect, Logger } from 'effect';
import { makeRedactingLogger } from './logger';

/** The lines the redacting logger writes while `program` runs. */
const linesOf = <A, E>(program: Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const lines: Array<string> = [];
    yield* program.pipe(
      Effect.provide(Logger.layer([makeRedactingLogger((line) => lines.push(line))])),
    );

    return lines;
  });

describe('makeRedactingLogger', () => {
  it.effect('describes a defect by its class and never prints its message', () =>
    Effect.gen(function* () {
      const lines = yield* linesOf(
        Effect.logError('Command failed', Cause.die(new Error('secret-param'))),
      );

      assert.strictEqual(lines.length, 1);
      assert.include(lines[0], 'Command failed');
      assert.include(lines[0], 'Die: Error');
      assert.notInclude(lines[0], 'secret-param');
    }),
  );

  it.effect('prints the level and an ISO date', () =>
    Effect.gen(function* () {
      const errorLines = yield* linesOf(Effect.logError('plain'));
      const warnLines = yield* linesOf(Effect.logWarning('plain'));

      assert.isTrue(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(errorLines[0]));
      assert.isTrue(/error/i.test(errorLines[0]));
      assert.isTrue(/warn/i.test(warnLines[0]));
      assert.isFalse(/error/i.test(warnLines[0]));
    }),
  );

  it.effect('describes a typed failure by its tag and never prints its message', () =>
    Effect.gen(function* () {
      const lines = yield* linesOf(Effect.log(Cause.fail({ _tag: 'X', message: 'secret-msg' })));

      assert.strictEqual(lines.length, 1);
      assert.include(lines[0], 'Fail: X');
      assert.notInclude(lines[0], 'secret-msg');
    }),
  );

  it.effect('prints strings, numbers and booleans as they are', () =>
    Effect.gen(function* () {
      const lines = yield* linesOf(Effect.log('count', 42, true));

      assert.include(lines[0], 'count');
      assert.include(lines[0], '42');
      assert.include(lines[0], 'true');
    }),
  );

  it.effect('describes any other value by its class and never prints its message', () =>
    Effect.gen(function* () {
      const lines = yield* linesOf(Effect.log('failed with', new TypeError('secret-value')));

      assert.include(lines[0], 'TypeError');
      assert.notInclude(lines[0], 'secret-value');
    }),
  );

  it.effect('prints string, number, boolean and null annotations as key=value', () =>
    Effect.gen(function* () {
      const lines = yield* linesOf(
        Effect.log('x').pipe(
          Effect.annotateLogs({
            'http.status': 500,
            'http.method': 'GET',
            cached: false,
            none: null,
          }),
        ),
      );

      assert.include(lines[0], 'http.status=500');
      assert.include(lines[0], 'http.method=GET');
      assert.include(lines[0], 'cached=false');
      assert.include(lines[0], 'none=null');
    }),
  );

  it.effect('does not print an annotation that holds an object', () =>
    Effect.gen(function* () {
      const lines = yield* linesOf(
        Effect.log('x').pipe(Effect.annotateLogs('payload', { secret: 'secret-annotation' })),
      );

      assert.include(lines[0], 'x');
      assert.notInclude(lines[0], 'secret-annotation');
    }),
  );
});
