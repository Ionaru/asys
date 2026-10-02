// SPDX-License-Identifier: EUPL-1.2
import {
  AreaSchema,
  BlockerLinkSchema,
  ChangeEntrySchema,
  ChangesExpired,
  ReviewItemSchema,
  SettingsSchema,
  TaskSchema,
  type ChangeEntry,
  type Changes,
} from '@asys/contract';
import { ChangeEntity, ChangeOp, type Change } from '@asys/domain';
import { and, asc, eq, gt } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { Db } from '../db/database';
import { changeCounters, changeLog } from '../db/schema';
import { withOwner } from '../db/with-owner';

/**
 * Locks the owner's change counter row (`FOR UPDATE`) and returns it. Must run
 * inside `withOwner` (row-level security scopes it to one row) and must be the
 * first statement of every per-owner write transaction: the lock numbers the
 * change log in commit order and serialises the owner's commands. A missing or
 * duplicated row is a defect.
 */
export const lockCounter = Effect.gen(function* () {
  const db = yield* Db;
  const rows = yield* db
    .select({ lastSeq: changeCounters.lastSeq, prunedThrough: changeCounters.prunedThrough })
    .from(changeCounters)
    .for('update');
  if (rows.length !== 1) {
    return yield* Effect.die(`Expected one change counter row, found ${rows.length}`);
  }
  return rows[0];
});

/** The after-image of a change encoded for storage, or null for a removal. */
const encodeData = (change: Change): unknown => {
  switch (change.entity) {
    case ChangeEntity.Task:
      return Schema.encodeSync(TaskSchema)(change.after);
    case ChangeEntity.Blocker:
      return change.op === ChangeOp.Remove
        ? null
        : Schema.encodeSync(BlockerLinkSchema)(change.after);
    case ChangeEntity.Area:
      return Schema.encodeSync(AreaSchema)(change.after);
    case ChangeEntity.ReviewItem:
      return Schema.encodeSync(ReviewItemSchema)(change.after);
    case ChangeEntity.Settings:
      return Schema.encodeSync(SettingsSchema)(change.after);
  }
};

/**
 * Appends `changes` to the owner's change log, numbered `lastSeq + 1`, `lastSeq + 2`, ...
 * in the given order, moves the counter to the last number and returns it. An empty
 * list writes nothing and returns `lastSeq`. Must run inside the caller's
 * `withOwner(ownerId, ...)`, after `lockCounter`, with the `lastSeq` it returned.
 */
export const appendChanges = (ownerId: string, lastSeq: number, changes: ReadonlyArray<Change>) =>
  Effect.gen(function* () {
    if (changes.length === 0) return lastSeq;

    const db = yield* Db;
    const newSeq = lastSeq + changes.length;
    yield* db.insert(changeLog).values(
      changes.map((change, index) => ({
        ownerId,
        seq: lastSeq + index + 1,
        entity: change.entity,
        entityId: change.entity === ChangeEntity.Settings ? null : change.id,
        op: change.op,
        data: encodeData(change),
      })),
    );
    yield* db
      .update(changeCounters)
      .set({ lastSeq: newSeq })
      .where(eq(changeCounters.ownerId, ownerId));
    return newSeq;
  });

const rowToEntry = (row: typeof changeLog.$inferSelect): ChangeEntry => {
  const { seq, entity, op, entityId, data } = row;
  const raw =
    entity === ChangeEntity.Settings
      ? { seq, entity, op, after: data }
      : op === ChangeOp.Remove
        ? { seq, entity, op, id: entityId }
        : { seq, entity, op, id: entityId, after: data };
  return Schema.decodeUnknownSync(ChangeEntrySchema)(raw);
};

/**
 * The owner's change entries with `seq > after`, in order, with the current head `seq`.
 * Read at repeatable read so the entries are consistent with the reported head. Fails
 * with `ChangesExpired` when `after` is below the pruned point or beyond the head.
 */
export const changesSince = (ownerId: string, after: number) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      const counters = yield* db
        .select({ lastSeq: changeCounters.lastSeq, prunedThrough: changeCounters.prunedThrough })
        .from(changeCounters);
      if (counters.length !== 1) {
        return yield* Effect.die(`Expected one change counter row, found ${counters.length}`);
      }
      const { lastSeq, prunedThrough } = counters[0];
      if (after < prunedThrough || after > lastSeq) {
        return yield* new ChangesExpired({ after });
      }

      const rows = yield* db
        .select()
        .from(changeLog)
        .where(and(eq(changeLog.ownerId, ownerId), gt(changeLog.seq, after)))
        .orderBy(asc(changeLog.seq));
      const changes: Changes = { seq: lastSeq, entries: rows.map(rowToEntry) };
      return changes;
    }),
    { isolationLevel: 'repeatable read' },
  );
