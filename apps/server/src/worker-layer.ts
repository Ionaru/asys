// SPDX-License-Identifier: EUPL-1.2
import { Layer } from 'effect';
import type { Db } from './db/database';
import { coreJobsLayer } from './jobs/prune';
import { JobRegistry } from './jobs/registry';
import { jobWorkerLayer } from './jobs/worker';

/**
 * The job worker and the core job kinds, sharing one `JobRegistry`. The core kinds are
 * registered before the worker starts, so its first poll knows them.
 */
export const workerLayer: Layer.Layer<never, never, Db> = jobWorkerLayer().pipe(
  Layer.provide(coreJobsLayer),
  Layer.provide(JobRegistry.layer),
);
