// SPDX-License-Identifier: EUPL-1.2
import { CurrentOwner } from '@asys/contract';
import { PasskeyUnitOfWork } from '@ionaru/effect-passkeys/server';
import { Effect, Layer, Option } from 'effect';
import { Db } from '../db/database';
import { withOwner } from '../db/with-owner';
import { lockCounter } from '../changes/change-log';
import { requireLiveSession } from './sessions';

/** Marks a failure of the unit's own effect, so it passes through while the unit's failures die. */
class Passthrough {
  constructor(readonly error: unknown) {}
}

/**
 * On a signed-in request (the passkey add and remove endpoints), the session must still be
 * live under the lock. Otherwise the run dies with `Unauthorized`, which the library's error
 * channel cannot carry but which answers itself as an empty 401. Sign-in has no `CurrentOwner`.
 */
const requireLiveRequestSession = Effect.serviceOption(CurrentOwner).pipe(
  Effect.flatMap(
    Option.match({
      onNone: () => Effect.void,
      onSome: (owner) => requireLiveSession(owner.sessionId).pipe(Effect.orDie),
    }),
  ),
);

/**
 * The library's unit of work over `withOwner`: one transaction for the user whose first
 * statement after `set_config` is the change counter lock. On a signed-in request it then
 * re-checks the request's session, so a request that authenticated before a revocation
 * committed cannot write after it. Failures of the effect pass through unchanged and roll the
 * transaction back; failures of the unit itself (drizzle errors from `set_config`, the lock
 * or the commit) are defects. Store calls inside the run nest as savepoints of the same
 * transaction.
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
            Effect.andThen(requireLiveRequestSession),
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
