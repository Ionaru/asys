// SPDX-License-Identifier: EUPL-1.2
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Cause, Effect, Logger } from 'effect';
import { CliError } from 'effect/cli';
import { run } from './cli/commands';
import { redactingLogger } from './logging/logger';

run.pipe(
  Effect.tapCause((cause) =>
    Cause.hasInterruptsOnly(cause) || Cause.squash(cause) instanceof CliError.ShowHelp
      ? Effect.void
      : Effect.logError('Command failed', cause),
  ),
  Effect.provide([NodeServices.layer, Logger.layer([redactingLogger])]),
  (effect) => NodeRuntime.runMain(effect, { disableErrorReporting: true }),
);
