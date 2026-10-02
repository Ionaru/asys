// SPDX-License-Identifier: EUPL-1.2
import {
  CommandRejected,
  CommandResultSchema,
  IdempotencyKeyReused,
  toDomainCommand,
  type CommandRequest,
  type CommandResult,
} from '@asys/contract';
import {
  ChangeEntity,
  ChangeOp,
  RejectedReason,
  TransitionResultTag,
  applyCommand,
  type Change,
} from '@asys/domain';
import { and, eq } from 'drizzle-orm';
import { Clock, Effect, Schema } from 'effect';
import { randomUUID } from 'node:crypto';
import { appendChanges, lockCounter } from '../changes/change-log';
import { Db } from '../db/database';
import { idempotencyKeys } from '../db/schema';
import { uniqueViolationConstraint } from '../db/sql-error';
import { withOwner } from '../db/with-owner';
import { loadState } from './load-state';
import { notApplicableReviewItem } from './not-applicable';
import { persistChanges } from './persist-changes';
import { requestHash } from './request-hash';

const DUPLICATE_ID_CONSTRAINTS: ReadonlySet<string> = new Set([
  'tasks_pkey',
  'areas_pkey',
  'task_blockers_pkey',
  'review_items_pkey',
]);

/**
 * Turns a unique violation of an entity primary key into `CommandRejected(DuplicateId)`; any
 * other failure, including other unique violations, and success pass through unchanged.
 */
export const mapUniqueViolation = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | CommandRejected, R> =>
  Effect.catch(effect, (error): Effect.Effect<never, E | CommandRejected> => {
    const constraint = uniqueViolationConstraint(error);
    return constraint !== undefined && DUPLICATE_ID_CONSTRAINTS.has(constraint)
      ? Effect.fail(new CommandRejected({ reason: RejectedReason.DuplicateId }))
      : Effect.fail(error);
  });

const body = (ownerId: string, request: CommandRequest) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const { lastSeq } = yield* lockCounter;

    const stored = yield* db
      .select()
      .from(idempotencyKeys)
      .where(
        and(eq(idempotencyKeys.ownerId, ownerId), eq(idempotencyKeys.key, request.idempotencyKey)),
      );
    const hash = requestHash(request);
    if (stored.length > 0) {
      if (stored[0].requestHash === hash) {
        return Schema.decodeUnknownSync(CommandResultSchema)(stored[0].result);
      }
      return yield* new IdempotencyKeyReused();
    }

    const command = toDomainCommand(request);
    const state = yield* loadState(ownerId, command);
    const now = yield* Clock.currentTimeMillis;
    const result = applyCommand(state, command, now);

    let commandResult: CommandResult;
    switch (result._tag) {
      case TransitionResultTag.Rejected:
        return yield* new CommandRejected({ reason: result.reason });
      case TransitionResultTag.Applied: {
        yield* persistChanges(ownerId, state, result.changes);
        const seq = yield* appendChanges(ownerId, lastSeq, result.changes);
        commandResult = { _tag: TransitionResultTag.Applied, seq };
        break;
      }
      case TransitionResultTag.NotApplicable: {
        const item = notApplicableReviewItem(request, result.reason, randomUUID(), now);
        const change: Change = {
          entity: ChangeEntity.ReviewItem,
          op: ChangeOp.Put,
          id: item.id,
          after: item,
        };
        yield* persistChanges(ownerId, state, [change]);
        yield* appendChanges(ownerId, lastSeq, [change]);
        commandResult = {
          _tag: TransitionResultTag.NotApplicable,
          reason: result.reason,
          reviewItemId: item.id,
        };
        break;
      }
    }

    yield* db.insert(idempotencyKeys).values({
      ownerId,
      key: request.idempotencyKey,
      command: request._tag,
      requestHash: hash,
      result: Schema.encodeSync(CommandResultSchema)(commandResult),
    });
    return commandResult;
  });

/**
 * The one way domain data changes. Runs one owner-scoped transaction that takes the counter lock
 * first, replays the stored result for a known idempotency key (or fails with
 * `IdempotencyKeyReused` when the request differs), applies the command to the state it needs,
 * persists the changes with their change-log entries, records a Review item for a NotApplicable
 * result, and stores the result under the key. A Rejected result rolls everything back.
 */
export const runCommand = (ownerId: string, request: CommandRequest) =>
  mapUniqueViolation(withOwner(ownerId, body(ownerId, request)));
