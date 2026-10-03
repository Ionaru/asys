// SPDX-License-Identifier: EUPL-1.2
import { Duration, Effect, Schedule } from 'effect';

/** The number of attempts after which a job is given up on. */
export const MAX_ATTEMPTS = 8;

/**
 * The delay in milliseconds before retrying a job that has failed `attempts`
 * times: exponential from one second with jitter, capped at one hour. Jitter is
 * applied before the cap so the delay never exceeds the hour. It steps the
 * schedule without sleeping and draws from the ambient `Random`, so callers make
 * it repeatable with `Random.withSeed`. Fewer than one attempt is a defect.
 */
export const retryDelay = (attempts: number): Effect.Effect<number> =>
  Effect.gen(function* () {
    if (attempts < 1) {
      return yield* Effect.die(`Expected at least one attempt, received ${attempts}`);
    }
    const step = yield* Schedule.toStep(
      Schedule.min([
        Schedule.jittered(Schedule.exponential('1 second')),
        Schedule.spaced('1 hour'),
      ]),
    );
    let delay = Duration.zero;
    for (let i = 0; i < attempts; i++) {
      const [, stepDelay] = yield* step(0, undefined);
      delay = stepDelay;
    }
    return Math.round(Duration.toMillis(delay));
  }).pipe(Effect.orDie);
