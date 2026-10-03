// SPDX-License-Identifier: MIT

import { Context, Effect, Layer } from 'effect';
import { PasskeyUnitOfWork } from '../server/unit-of-work';

/** The user id of the `PasskeyUnitOfWork.run` currently executing, or undefined outside one. */
export const CurrentRun = Context.Reference<string | undefined>('effect-passkeys/CurrentRun', {
  defaultValue: () => undefined,
});

/** A unit of work that records the user id of every run and exposes it as `CurrentRun`. */
export const makeRecordingUnitOfWork = (): {
  readonly layer: Layer.Layer<PasskeyUnitOfWork>;
  readonly runs: ReadonlyArray<string>;
} => {
  const runs: Array<string> = [];

  const layer = Layer.succeed(PasskeyUnitOfWork)({
    run: (userId, effect) =>
      Effect.suspend(() => {
        runs.push(userId);
        return effect;
      }).pipe(Effect.provideService(CurrentRun, userId)),
  });

  return { layer, runs };
};
