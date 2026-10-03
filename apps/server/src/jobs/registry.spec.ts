// SPDX-License-Identifier: EUPL-1.2
import { assert, describe, it } from '@effect/vitest';
import { Cause, Effect, Exit } from 'effect';
import { type JobHandler, JobRegistry } from './registry';

const handler: JobHandler = () => Effect.void;

describe('JobRegistry', () => {
  it.effect('gives undefined for a kind nobody registered', () =>
    Effect.gen(function* () {
      const registry = yield* JobRegistry;

      assert.isUndefined(yield* registry.get('nothing'));
    }).pipe(Effect.provide(JobRegistry.layer)),
  );

  it.effect('gives back the handler registered for a kind', () =>
    Effect.gen(function* () {
      const registry = yield* JobRegistry;

      yield* registry.register('mail', handler);

      assert.strictEqual(yield* registry.get('mail'), handler);
      assert.isUndefined(yield* registry.get('other'));
    }).pipe(Effect.provide(JobRegistry.layer)),
  );

  it.effect('dies when a kind is registered twice', () =>
    Effect.gen(function* () {
      const registry = yield* JobRegistry;
      yield* registry.register('mail', handler);

      const exit = yield* Effect.exit(registry.register('mail', () => Effect.void));

      assert.isTrue(Exit.isFailure(exit) && Cause.hasDies(exit.cause));
      assert.strictEqual(yield* registry.get('mail'), handler);
    }).pipe(Effect.provide(JobRegistry.layer)),
  );

  it.effect('starts every build of the layer with an empty registry', () =>
    Effect.gen(function* () {
      yield* Effect.gen(function* () {
        const registry = yield* JobRegistry;
        yield* registry.register('mail', handler);
      }).pipe(Effect.provide(JobRegistry.layer));

      const fresh = yield* Effect.gen(function* () {
        const registry = yield* JobRegistry;
        return yield* registry.get('mail');
      }).pipe(Effect.provide(JobRegistry.layer));

      assert.isUndefined(fresh);
    }),
  );
});
