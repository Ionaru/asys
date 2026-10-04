// SPDX-License-Identifier: EUPL-1.2
import { Api } from '@asys/contract';
import { Context, Data, Effect, Layer } from 'effect';
import { HttpMiddleware } from 'effect/http';
import { HttpApiBuilder, HttpApiError } from 'effect/http-api';
import { Db } from '../db/database';
import { failingJobCount, oldestDueJobAgeSeconds } from '../jobs/claim';

/** The health probe could not read its figures, because the database failed. */
export class HealthUnavailable extends Data.TaggedError('HealthUnavailable')<
  Record<never, never>
> {}

/** Reads the job figures the health probe reports. Replaceable, so tests can stub it. */
export class HealthReader extends Context.Service<
  HealthReader,
  {
    readonly read: Effect.Effect<
      { readonly oldestDueJobAgeSeconds: number; readonly failingJobs: number },
      HealthUnavailable
    >;
  }
>()('asys/HealthReader') {
  /** Reads the figures from the database; any database failure is `HealthUnavailable`. */
  static readonly layer: Layer.Layer<HealthReader, never, Db> = Layer.effect(HealthReader)(
    Effect.gen(function* () {
      const db = yield* Db;
      return {
        read: Effect.gen(function* () {
          const age = yield* oldestDueJobAgeSeconds;
          const failing = yield* failingJobCount;
          return { oldestDueJobAgeSeconds: age, failingJobs: failing };
        }).pipe(
          Effect.provideService(Db, db),
          Effect.mapError(() => new HealthUnavailable()),
        ),
      };
    }),
  );
}

/**
 * The `health` group: `ok` with the job figures, or 503 when they cannot be read. A 200 writes no
 * request log line, so the container healthcheck does not flood the logs; failures still log.
 */
export const HealthLive = HttpApiBuilder.group(Api, 'health', (handlers) =>
  handlers.handle('health', () =>
    Effect.gen(function* () {
      const reader = yield* HealthReader;
      const figures = yield* reader.read;
      yield* HttpMiddleware.withLoggerDisabled(Effect.void);
      return { status: 'ok' as const, ...figures };
    }).pipe(
      Effect.catchTag('HealthUnavailable', () =>
        Effect.fail(new HttpApiError.ServiceUnavailable()),
      ),
    ),
  ),
);
