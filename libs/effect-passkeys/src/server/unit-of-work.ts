// SPDX-License-Identifier: MIT

import { Context, type Effect, Layer } from 'effect';

/** Runs a piece of work atomically for one user: the host's transaction. */
export class PasskeyUnitOfWork extends Context.Service<
  PasskeyUnitOfWork,
  {
    /** Runs effect as one atomic unit for userId. Failures pass through unchanged. */
    readonly run: <A, E, R>(
      userId: string,
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, R>;
  }
>()('effect-passkeys/PasskeyUnitOfWork') {
  /** A unit of work without a transaction: `run` returns the effect unchanged. */
  static readonly none: Layer.Layer<PasskeyUnitOfWork> = Layer.succeed(PasskeyUnitOfWork)({
    run: (_userId, effect) => effect,
  });
}
