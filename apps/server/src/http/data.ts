// SPDX-License-Identifier: EUPL-1.2
import {
  API_VERSION,
  Api,
  ChangesExpired,
  CommandRejected,
  CurrentOwner,
  IdempotencyKeyReused,
} from '@asys/contract';
import { RULES_VERSION } from '@asys/domain';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { changesSince } from '../changes/change-log';
import { readSnapshot } from '../changes/snapshot';
import { runCommand } from '../commands/run-command';
import { Db } from '../db/database';
import { rowToSettings } from '../db/mappers';
import { settings } from '../db/schema';
import { withOwner } from '../db/with-owner';

const readMeta = (ownerId: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const rows = yield* withOwner(ownerId, db.select().from(settings)).pipe(Effect.orDie);
    if (rows.length !== 1) {
      return yield* Effect.die(`Expected one settings row, found ${rows.length}`);
    }
    return {
      rulesVersion: RULES_VERSION,
      apiVersion: API_VERSION,
      settings: rowToSettings(rows[0]),
    };
  });

/** The `data` group: commands, snapshot, changes and meta of the signed-in Owner. */
export const DataLive = HttpApiBuilder.group(Api, 'data', (handlers) =>
  handlers
    .handle('runCommand', ({ payload }) =>
      Effect.gen(function* () {
        const { ownerId } = yield* CurrentOwner;
        return yield* runCommand(ownerId, payload).pipe(
          Effect.catch((error): Effect.Effect<never, CommandRejected | IdempotencyKeyReused> =>
            error instanceof CommandRejected || error instanceof IdempotencyKeyReused
              ? Effect.fail(error)
              : Effect.die(error),
          ),
        );
      }),
    )
    .handle('snapshot', () =>
      Effect.gen(function* () {
        const { ownerId } = yield* CurrentOwner;
        return yield* readSnapshot(ownerId).pipe(Effect.orDie);
      }),
    )
    .handle('changes', ({ query }) =>
      Effect.gen(function* () {
        const { ownerId } = yield* CurrentOwner;
        return yield* changesSince(ownerId, query.after).pipe(
          Effect.catch((error): Effect.Effect<never, ChangesExpired> =>
            error instanceof ChangesExpired ? Effect.fail(error) : Effect.die(error),
          ),
        );
      }),
    )
    .handle('meta', () =>
      Effect.gen(function* () {
        const { ownerId } = yield* CurrentOwner;
        return yield* readMeta(ownerId);
      }),
    ),
);
