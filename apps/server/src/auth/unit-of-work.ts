// SPDX-License-Identifier: EUPL-1.2
import { PasskeyUnitOfWork } from '@ionaru/effect-passkeys/server';
import { Effect, Layer } from 'effect';
import { Db } from '../db/database';
import { withOwner } from '../db/with-owner';
import { lockCounter } from '../changes/change-log';

/** Marks a failure of the unit's own effect, so it passes through while the unit's failures die. */
class Passthrough {
  constructor(readonly error: unknown) {}
}

/**
 * The library's unit of work over `withOwner`: one transaction for the user whose first
 * statement after `set_config` is the change counter lock. Failures of the effect pass through
 * unchanged and roll the transaction back; failures of the unit itself (drizzle errors from
 * `set_config`, the lock or the commit) are defects. Store calls inside the run nest as
 * savepoints of the same transaction. Adding and removing a passkey start their effect with
 * the session re-check (`requireLiveCurrentSession`), so it runs after the lock.
 */
export const PasskeyUnitOfWorkLive: Layer.Layer<PasskeyUnitOfWork, never, Db> = Layer.effect(
  PasskeyUnitOfWork,
)(
  Effect.gen(function* () {
    const db = yield* Db;
    return PasskeyUnitOfWork.of({
      run: <A, E, R>(userId: string, effect: Effect.Effect<A, E, R>) =>
        withOwner(
          userId,
          lockCounter.pipe(
            Effect.orDie,
            Effect.andThen(effect.pipe(Effect.mapError((error) => new Passthrough(error)))),
          ),
        ).pipe(
          Effect.provideService(Db, db),
          Effect.catch((error) =>
            error instanceof Passthrough ? Effect.fail(error.error as E) : Effect.die(error),
          ),
        ) as Effect.Effect<A, E, R>,
    });
  }),
);
