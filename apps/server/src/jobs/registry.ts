// SPDX-License-Identifier: EUPL-1.2
import type { Instant } from '@asys/domain';
import { Context, Effect, Layer } from 'effect';
import type { Db } from '../db/database';

/** What a handler is told about the job it runs. */
export interface JobContext {
  readonly ownerId: string;
  readonly id: string;
  readonly kind: string;
  readonly payload: unknown;
  /** The job's `run_at`, read under the row lock, in epoch milliseconds. */
  readonly runAt: Instant;
  /** The worker's clock time for this run, in epoch milliseconds. */
  readonly now: Instant;
}

/**
 * Runs one job inside the owner's transaction, in a savepoint: a failure or defect rolls
 * back the handler's writes and makes the job retry.
 */
export type JobHandler = (job: JobContext) => Effect.Effect<void, unknown, Db>;

/** The extension point add-ons use to register the job kinds they handle. */
export class JobRegistry extends Context.Service<
  JobRegistry,
  {
    /** Registers the handler for `kind`. A kind that is already registered is a defect. */
    readonly register: (kind: string, handler: JobHandler) => Effect.Effect<void>;
    /** The handler for `kind`, or `undefined` when none is registered. */
    readonly get: (kind: string) => Effect.Effect<JobHandler | undefined>;
  }
>()('asys/JobRegistry') {
  /** A registry that starts empty; each build of the layer holds its own. */
  static readonly layer: Layer.Layer<JobRegistry> = Layer.sync(JobRegistry)(() => {
    const handlers = new Map<string, JobHandler>();
    return {
      register: (kind, handler) =>
        Effect.suspend(() => {
          if (handlers.has(kind)) {
            return Effect.die(`The job kind ${kind} is already registered`);
          }
          handlers.set(kind, handler);
          return Effect.void;
        }),
      get: (kind) => Effect.sync(() => handlers.get(kind)),
    };
  });
}
