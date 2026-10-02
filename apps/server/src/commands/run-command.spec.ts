// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import {
  CommandRejected,
  IdempotencyKeyReused,
  type ChangeEntry,
  type CommandRequest,
  type CommandResult,
} from '@asys/contract';
import {
  ChangeEntity,
  ChangeOp,
  CommandTag,
  NotApplicableReason,
  RejectedReason,
  TaskKind,
  TaskStatus,
  TransitionResultTag,
  WORK_ACTIVE_HOURS,
  type Task,
} from '@asys/domain';
import { assert, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { TestClock } from 'effect/testing';
import { Db, appDatabase } from '../db/database';
import { taskToRow } from '../db/mappers';
import { changeLog, idempotencyKeys, tasks } from '../db/schema';
import { uniqueViolationConstraint } from '../db/sql-error';
import { withOwner } from '../db/with-owner';
import { changesSince, lockCounter } from '../changes/change-log';
import { readSnapshot } from '../changes/snapshot';
import { newOwner, removeOwner } from '../test/owners';
import { mapUniqueViolation, runCommand } from './run-command';

// These tests run against the real database (docker compose).

const T = 1_000_000;

type Req<Tag extends CommandTag> = Extract<CommandRequest, { readonly _tag: Tag }>;

const capture = (taskId: string = randomUUID()): Req<CommandTag.CaptureTask> => ({
  _tag: CommandTag.CaptureTask,
  idempotencyKey: randomUUID(),
  taskId,
  title: 'a task',
  captureText: '',
});

const triage = (
  taskId: string,
  important: boolean,
  estimateMinutes: number,
): Req<CommandTag.TriageTask> => ({
  _tag: CommandTag.TriageTask,
  idempotencyKey: randomUUID(),
  taskId,
  important,
  estimateMinutes,
});

const complete = (taskId: string): Req<CommandTag.CompleteTask> => ({
  _tag: CommandTag.CompleteTask,
  idempotencyKey: randomUUID(),
  taskId,
});

const dropIfOpen = (taskId: string): Req<CommandTag.DropTask> => ({
  _tag: CommandTag.DropTask,
  idempotencyKey: randomUUID(),
  taskId,
  expect: { status: TaskStatus.Open },
});

const addBlocker = (
  linkId: string,
  taskId: string,
  blockerId: string,
): Req<CommandTag.AddBlocker> => ({
  _tag: CommandTag.AddBlocker,
  idempotencyKey: randomUUID(),
  linkId,
  taskId,
  blockerId,
});

const applied = (seq: number): CommandResult => ({ _tag: TransitionResultTag.Applied, seq });

const byId = <A extends { readonly id: string }>(items: ReadonlyArray<A>): A[] =>
  [...items].sort((a, b) => (a.id < b.id ? -1 : 1));

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const onlyEntry = (entries: ReadonlyArray<ChangeEntry>): ChangeEntry => {
  assert.strictEqual(entries.length, 1);
  return entries[0];
};

const snapshotOf = (owner: string) =>
  Effect.map(readSnapshot(owner), (snapshot) => ({
    ...snapshot,
    tasks: byId(snapshot.tasks),
    blockers: byId(snapshot.blockers),
    areas: byId(snapshot.areas),
    reviewItems: byId(snapshot.reviewItems),
  }));

const keyRows = (owner: string) =>
  withOwner(
    owner,
    Effect.gen(function* () {
      const db = yield* Db;
      return yield* db.select().from(idempotencyKeys);
    }),
  );

/** The head before, the result, the log entries it added and the working set after. */
const runAndObserve = (owner: string, request: CommandRequest) =>
  Effect.gen(function* () {
    const before = (yield* readSnapshot(owner)).seq;
    const result = yield* runCommand(owner, request);
    const { entries } = yield* changesSince(owner, before);
    const snapshot = yield* snapshotOf(owner);
    return { before, result, entries, snapshot };
  });

/** The reason or marker of a typed failure of `runCommand`. */
const failureOf = <A, E>(effect: Effect.Effect<A, E, Db>) =>
  Effect.map(Effect.flip(effect), (error) => {
    if (error instanceof CommandRejected) return error.reason;
    if (error instanceof IdempotencyKeyReused) return 'idempotency_key_reused';
    return 'unexpected';
  });

const newTask = (): Task => ({
  id: randomUUID(),
  kind: TaskKind.Task,
  status: TaskStatus.Open,
  title: 'a task',
  notes: '',
  captureText: '',
  areaId: null,
  availableFrom: null,
  due: null,
  estimateMinutes: null,
  important: null,
  voice: null,
  privacy: null,
  dueMoveCount: 0,
  version: 1,
  createdAt: T,
  closedAt: null,
});

layer(appDatabase())('runCommand', (it) => {
  it.effect('stores a NotApplicable result as a Review item and replays every key unchanged', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const c = capture();
      const done = complete(c.taskId);
      const drop = dropIfOpen(c.taskId);

      const r1 = yield* runCommand(o, c);
      const r2 = yield* runCommand(o, done);
      const r3 = yield* runCommand(o, drop);
      const log = yield* changesSince(o, 2);
      const first = yield* snapshotOf(o);

      const r1Again = yield* runCommand(o, c);
      const r2Again = yield* runCommand(o, done);
      const r3Again = yield* runCommand(o, drop);
      const after = yield* snapshotOf(o);
      const keys = yield* keyRows(o);
      yield* removeOwner(o);

      assert.deepStrictEqual(r1, applied(1));
      assert.deepStrictEqual(r2, applied(2));
      assert.strictEqual(r3._tag, TransitionResultTag.NotApplicable);
      if (r3._tag !== TransitionResultTag.NotApplicable) return;
      assert.strictEqual(r3.reason, NotApplicableReason.ExpectationFailed);

      const entry = onlyEntry(log.entries);
      assert.strictEqual(entry.seq, 3);
      assert.strictEqual(entry.entity, ChangeEntity.ReviewItem);
      assert.strictEqual(entry.op, ChangeOp.Put);
      assert.strictEqual(field(entry, 'id'), r3.reviewItemId);
      const item = field(entry, 'after');
      assert.strictEqual(field(item, 'id'), r3.reviewItemId);
      assert.strictEqual(field(item, 'kind'), 'command_not_applicable');
      assert.deepStrictEqual(field(item, 'subjects'), [{ type: 'task', id: c.taskId }]);
      assert.strictEqual(field(item, 'resolvedAt'), null);
      assert.deepStrictEqual(first.reviewItems, [item]);

      assert.deepStrictEqual(r1Again, r1);
      assert.deepStrictEqual(r2Again, r2);
      assert.deepStrictEqual(r3Again, r3);
      assert.strictEqual(after.reviewItems.length, 1);
      assert.strictEqual(after.seq, 3);
      assert.strictEqual(keys.length, 3);
    }),
  );

  it.effect('writes nothing for a Rejected command', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const request: Req<CommandTag.CaptureTask> = { ...capture(), title: '  ' };

      const reason = yield* failureOf(runCommand(o, request));
      const snapshot = yield* snapshotOf(o);
      const log = yield* changesSince(o, 0);
      const keys = yield* keyRows(o);
      const counter = yield* withOwner(o, lockCounter);
      yield* removeOwner(o);

      assert.strictEqual(reason, RejectedReason.InvalidTitle);
      assert.deepStrictEqual(snapshot.tasks, []);
      assert.deepStrictEqual(log, { seq: 0, entries: [] });
      assert.deepStrictEqual(keys, []);
      assert.strictEqual(counter.lastSeq, 0);
    }),
  );

  it.effect('refuses a reused idempotency key with another request and changes nothing', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const c = capture();

      const first = yield* runCommand(o, c);
      const reason = yield* failureOf(
        runCommand(o, { ...complete(c.taskId), idempotencyKey: c.idempotencyKey }),
      );
      const snapshot = yield* snapshotOf(o);
      const keys = yield* keyRows(o);
      yield* removeOwner(o);

      assert.deepStrictEqual(first, applied(1));
      assert.strictEqual(reason, 'idempotency_key_reused');
      assert.deepStrictEqual(
        snapshot.tasks.map((t) => [t.id, t.status]),
        [[c.taskId, TaskStatus.Open]],
      );
      assert.strictEqual(snapshot.seq, 1);
      assert.strictEqual(keys.length, 1);
    }),
  );

  it.effect('turns a stale Area version into a Review item about the Area', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const work = (yield* snapshotOf(o)).areas.find((a) => a.name === 'Work');
      assert.isDefined(work);
      if (work === undefined) return;

      const { result, entries, snapshot } = yield* runAndObserve(o, {
        _tag: CommandTag.UpdateArea,
        idempotencyKey: randomUUID(),
        areaId: work.id,
        patch: { name: 'Office' },
        expect: { version: 5 },
      });
      yield* removeOwner(o);

      assert.strictEqual(result._tag, TransitionResultTag.NotApplicable);
      if (result._tag !== TransitionResultTag.NotApplicable) return;
      assert.strictEqual(result.reason, NotApplicableReason.ExpectationFailed);
      const item = field(onlyEntry(entries), 'after');
      assert.strictEqual(field(item, 'id'), result.reviewItemId);
      assert.deepStrictEqual(field(item, 'subjects'), [{ type: 'area', id: work.id }]);
      assert.deepStrictEqual(
        snapshot.areas.find((a) => a.id === work.id),
        work,
      );
      assert.strictEqual(work.version, 1);
    }),
  );

  it.effect('keeps two owners apart even when they use the same ids', () =>
    Effect.gen(function* () {
      const a = yield* newOwner();
      const b = yield* newOwner();
      const c = capture();

      const resultA = yield* runCommand(a, c);
      const resultB = yield* runCommand(b, c);
      const triageB = yield* runCommand(b, triage(c.taskId, false, 15));
      const y = capture();
      yield* runCommand(a, y);
      const reason = yield* failureOf(runCommand(b, addBlocker(randomUUID(), c.taskId, y.taskId)));
      const snapshotA = yield* snapshotOf(a);
      const snapshotB = yield* snapshotOf(b);
      yield* removeOwner(a);
      yield* removeOwner(b);

      assert.deepStrictEqual(resultA, applied(1));
      assert.deepStrictEqual(resultB, applied(1));
      assert.deepStrictEqual(triageB, applied(2));
      assert.strictEqual(snapshotA.tasks.find((t) => t.id === c.taskId)?.estimateMinutes, null);
      assert.strictEqual(snapshotB.tasks.find((t) => t.id === c.taskId)?.estimateMinutes, 15);
      assert.strictEqual(snapshotB.tasks.find((t) => t.id === c.taskId)?.important, false);
      assert.strictEqual(reason, RejectedReason.NotFound);
    }),
  );

  const seededAreas = (owner: string) =>
    Effect.gen(function* () {
      const areas = (yield* snapshotOf(owner)).areas;
      const work = areas.find((a) => a.name === 'Work');
      const personal = areas.find((a) => a.name === 'Personal');
      assert.isDefined(work);
      assert.isDefined(personal);
      return { workId: work?.id ?? '', personalId: personal?.id ?? '' };
    });

  it.effect('captures a task into a known Area', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const { workId } = yield* seededAreas(o);

      const { before, result, entries, snapshot } = yield* runAndObserve(o, {
        ...capture(),
        areaId: workId,
      });
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before + 1));
      assert.strictEqual(snapshot.tasks.length, 1);
      assert.strictEqual(snapshot.tasks[0].areaId, workId);
      assert.strictEqual(field(field(onlyEntry(entries), 'after'), 'areaId'), workId);
    }),
  );

  it.effect('moves a task to another known Area by TriageTask and by EditTask', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const { workId, personalId } = yield* seededAreas(o);
      const c = capture();
      yield* runCommand(o, c);

      const triaged = yield* runAndObserve(o, { ...triage(c.taskId, true, 30), areaId: workId });
      const edited = yield* runAndObserve(o, {
        _tag: CommandTag.EditTask,
        idempotencyKey: randomUUID(),
        taskId: c.taskId,
        patch: { areaId: personalId },
      });
      yield* removeOwner(o);

      assert.deepStrictEqual(triaged.result, applied(triaged.before + 1));
      assert.strictEqual(triaged.snapshot.tasks[0].areaId, workId);
      assert.deepStrictEqual(edited.result, applied(edited.before + 1));
      assert.strictEqual(edited.snapshot.tasks[0].areaId, personalId);
    }),
  );

  it.effect('rejects a capture into an unknown Area and writes nothing', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();

      const reason = yield* failureOf(runCommand(o, { ...capture(), areaId: randomUUID() }));
      const snapshot = yield* snapshotOf(o);
      const log = yield* changesSince(o, 0);
      const keys = yield* keyRows(o);
      yield* removeOwner(o);

      assert.strictEqual(reason, RejectedReason.UnknownArea);
      assert.deepStrictEqual(snapshot.tasks, []);
      assert.deepStrictEqual(log, { seq: 0, entries: [] });
      assert.deepStrictEqual(keys, []);
    }),
  );

  it.effect('detects a cycle through several links', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const [a, b, c, d] = [capture(), capture(), capture(), capture()];
      for (const t of [a, b, c, d]) yield* runCommand(o, t);
      const links = [
        addBlocker(randomUUID(), a.taskId, b.taskId),
        addBlocker(randomUUID(), b.taskId, c.taskId),
        addBlocker(randomUUID(), c.taskId, d.taskId),
      ];
      const results = [];
      for (const link of links) results.push(yield* runCommand(o, link));
      const head = (yield* snapshotOf(o)).seq;

      const reason = yield* failureOf(runCommand(o, addBlocker(randomUUID(), d.taskId, a.taskId)));
      const snapshot = yield* snapshotOf(o);
      yield* removeOwner(o);

      assert.isTrue(results.every((r) => r._tag === TransitionResultTag.Applied));
      assert.strictEqual(reason, RejectedReason.Cycle);
      assert.strictEqual(snapshot.blockers.length, 3);
      assert.strictEqual(snapshot.seq, head);
    }),
  );

  it.effect('rejects a duplicate link under a new link id and writes nothing', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const a = capture();
      const b = capture();
      yield* runCommand(o, a);
      yield* runCommand(o, b);
      yield* runCommand(o, addBlocker(randomUUID(), a.taskId, b.taskId));
      const head = (yield* snapshotOf(o)).seq;
      const keysBefore = (yield* keyRows(o)).length;

      const reason = yield* failureOf(runCommand(o, addBlocker(randomUUID(), a.taskId, b.taskId)));
      const snapshot = yield* snapshotOf(o);
      const keysAfter = (yield* keyRows(o)).length;
      yield* removeOwner(o);

      assert.strictEqual(reason, RejectedReason.DuplicateLink);
      assert.strictEqual(snapshot.blockers.length, 1);
      assert.strictEqual(snapshot.seq, head);
      assert.strictEqual(keysAfter, keysBefore);
    }),
  );

  it.effect('refuses a reused key for the same command type with other content', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const first: Req<CommandTag.CaptureTask> = { ...capture(), title: 'a' };

      const result = yield* runCommand(o, first);
      const reason = yield* failureOf(runCommand(o, { ...first, title: 'b' }));
      const snapshot = yield* snapshotOf(o);
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(1));
      assert.strictEqual(reason, 'idempotency_key_reused');
      assert.strictEqual(snapshot.tasks.find((t) => t.id === first.taskId)?.title, 'a');
    }),
  );
});

layer(appDatabase())('runCommand, commands that change nothing', (it) => {
  it.effect('resolving an already resolved Review item is Applied without a log entry', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const c = capture();
      yield* runCommand(o, c);
      yield* runCommand(o, complete(c.taskId));
      const dropped = yield* runCommand(o, dropIfOpen(c.taskId));
      assert.strictEqual(dropped._tag, TransitionResultTag.NotApplicable);
      if (dropped._tag !== TransitionResultTag.NotApplicable) return;
      const resolve: Req<CommandTag.ResolveReviewItem> = {
        _tag: CommandTag.ResolveReviewItem,
        idempotencyKey: randomUUID(),
        reviewItemId: dropped.reviewItemId,
      };
      yield* runCommand(o, resolve);

      const again: Req<CommandTag.ResolveReviewItem> = { ...resolve, idempotencyKey: randomUUID() };
      const { before, result, entries } = yield* runAndObserve(o, again);
      const keys = yield* keyRows(o);
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before));
      assert.deepStrictEqual(entries, []);
      assert.isTrue(keys.some((k) => k.key === again.idempotencyKey));
    }),
  );

  it.effect('setting the current time zone is Applied at seq 0 without a log entry', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const request: Req<CommandTag.SetTimeZone> = {
        _tag: CommandTag.SetTimeZone,
        idempotencyKey: randomUUID(),
        timeZone: 'Europe/Amsterdam',
      };

      const { result, entries } = yield* runAndObserve(o, request);
      const keys = yield* keyRows(o);
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(0));
      assert.deepStrictEqual(entries, []);
      assert.deepStrictEqual(
        keys.map((k) => k.key),
        [request.idempotencyKey],
      );
    }),
  );
});

layer(appDatabase())('runCommand, every command once', (it) => {
  it.effect('CaptureTask logs a task put', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* newOwner();
      const c = capture();

      const { before, result, entries, snapshot } = yield* runAndObserve(o, c);
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before + 1));
      const entry = onlyEntry(entries);
      assert.strictEqual(entry.seq, before + 1);
      assert.strictEqual(entry.entity, ChangeEntity.Task);
      assert.strictEqual(entry.op, ChangeOp.Put);
      assert.strictEqual(field(entry, 'id'), c.taskId);
      const stored = snapshot.tasks.find((t) => t.id === c.taskId);
      assert.isDefined(stored);
      assert.strictEqual(stored?.important, null);
      assert.strictEqual(stored?.estimateMinutes, null);
      assert.strictEqual(stored?.createdAt, T);
      assert.deepStrictEqual(field(entry, 'after'), stored);
    }),
  );

  it.effect('TriageTask logs a task put', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* newOwner();
      const c = capture();
      yield* runCommand(o, c);

      const { before, result, entries, snapshot } = yield* runAndObserve(
        o,
        triage(c.taskId, true, 30),
      );
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before + 1));
      const entry = onlyEntry(entries);
      assert.strictEqual(entry.entity, ChangeEntity.Task);
      assert.strictEqual(entry.op, ChangeOp.Put);
      const stored = snapshot.tasks.find((t) => t.id === c.taskId);
      assert.strictEqual(stored?.important, true);
      assert.strictEqual(stored?.estimateMinutes, 30);
      assert.strictEqual(stored?.version, 2);
      assert.deepStrictEqual(field(entry, 'after'), stored);
    }),
  );

  it.effect('EditTask logs a task put', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* newOwner();
      const c = capture();
      yield* runCommand(o, c);

      const { before, result, entries, snapshot } = yield* runAndObserve(o, {
        _tag: CommandTag.EditTask,
        idempotencyKey: randomUUID(),
        taskId: c.taskId,
        patch: { due: { date: '2026-12-15' } },
      });
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before + 1));
      const entry = onlyEntry(entries);
      assert.strictEqual(entry.entity, ChangeEntity.Task);
      assert.strictEqual(entry.op, ChangeOp.Put);
      const stored = snapshot.tasks.find((t) => t.id === c.taskId);
      assert.deepStrictEqual(stored?.due, { date: '2026-12-15' });
    }),
  );

  it.effect('LogProgress logs a task put', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* newOwner();
      const c = capture();
      yield* runCommand(o, c);
      yield* runCommand(o, triage(c.taskId, true, 30));

      const { before, result, entries, snapshot } = yield* runAndObserve(o, {
        _tag: CommandTag.LogProgress,
        idempotencyKey: randomUUID(),
        taskId: c.taskId,
        remainingMinutes: 20,
      });
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before + 1));
      const entry = onlyEntry(entries);
      assert.strictEqual(entry.entity, ChangeEntity.Task);
      assert.strictEqual(entry.op, ChangeOp.Put);
      assert.strictEqual(snapshot.tasks.find((t) => t.id === c.taskId)?.estimateMinutes, 20);
    }),
  );

  it.effect('CompleteTask logs a done task and removes it from the working set', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* newOwner();
      const c = capture();
      yield* runCommand(o, c);

      const { before, result, entries, snapshot } = yield* runAndObserve(o, complete(c.taskId));
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before + 1));
      const entry = onlyEntry(entries);
      assert.strictEqual(entry.entity, ChangeEntity.Task);
      assert.strictEqual(entry.op, ChangeOp.Put);
      assert.strictEqual(field(field(entry, 'after'), 'status'), TaskStatus.Done);
      assert.strictEqual(field(field(entry, 'after'), 'closedAt'), T);
      assert.isUndefined(snapshot.tasks.find((t) => t.id === c.taskId));
    }),
  );

  it.effect('DropTask logs a dropped task and removes it from the working set', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* newOwner();
      const c = capture();
      yield* runCommand(o, c);

      const { before, result, entries, snapshot } = yield* runAndObserve(o, {
        _tag: CommandTag.DropTask,
        idempotencyKey: randomUUID(),
        taskId: c.taskId,
      });
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before + 1));
      const entry = onlyEntry(entries);
      assert.strictEqual(entry.entity, ChangeEntity.Task);
      assert.strictEqual(entry.op, ChangeOp.Put);
      assert.strictEqual(field(field(entry, 'after'), 'status'), TaskStatus.Dropped);
      assert.isUndefined(snapshot.tasks.find((t) => t.id === c.taskId));
    }),
  );

  it.effect('AddBlocker logs a blocker put', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* newOwner();
      const a = capture();
      const b = capture();
      yield* runCommand(o, a);
      yield* runCommand(o, b);
      const linkId = randomUUID();

      const { before, result, entries, snapshot } = yield* runAndObserve(
        o,
        addBlocker(linkId, a.taskId, b.taskId),
      );
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before + 1));
      const entry = onlyEntry(entries);
      assert.strictEqual(entry.entity, ChangeEntity.Blocker);
      assert.strictEqual(entry.op, ChangeOp.Put);
      assert.strictEqual(field(entry, 'id'), linkId);
      assert.deepStrictEqual(snapshot.blockers, [
        { id: linkId, taskId: a.taskId, blockerId: b.taskId },
      ]);
    }),
  );

  it.effect('RemoveBlocker logs a blocker remove without an after', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* newOwner();
      const a = capture();
      const b = capture();
      yield* runCommand(o, a);
      yield* runCommand(o, b);
      const linkId = randomUUID();
      yield* runCommand(o, addBlocker(linkId, a.taskId, b.taskId));

      const { before, result, entries, snapshot } = yield* runAndObserve(o, {
        _tag: CommandTag.RemoveBlocker,
        idempotencyKey: randomUUID(),
        linkId,
      });
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before + 1));
      const entry = onlyEntry(entries);
      assert.strictEqual(entry.entity, ChangeEntity.Blocker);
      assert.strictEqual(entry.op, ChangeOp.Remove);
      assert.strictEqual(field(entry, 'id'), linkId);
      assert.isFalse('after' in entry);
      assert.deepStrictEqual(snapshot.blockers, []);
    }),
  );

  it.effect('CreateArea logs an area put', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* newOwner();
      const areaId = randomUUID();

      const { before, result, entries, snapshot } = yield* runAndObserve(o, {
        _tag: CommandTag.CreateArea,
        idempotencyKey: randomUUID(),
        areaId,
        name: 'Garden',
        activeHours: WORK_ACTIVE_HOURS,
        defaultPrivacy: null,
      });
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before + 1));
      const entry = onlyEntry(entries);
      assert.strictEqual(entry.entity, ChangeEntity.Area);
      assert.strictEqual(entry.op, ChangeOp.Put);
      assert.strictEqual(field(entry, 'id'), areaId);
      assert.strictEqual(snapshot.areas.length, 3);
      assert.isDefined(snapshot.areas.find((a) => a.id === areaId));
    }),
  );

  it.effect('UpdateArea logs an area put with version 2', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* newOwner();
      const work = (yield* snapshotOf(o)).areas.find((a) => a.name === 'Work');
      assert.isDefined(work);
      if (work === undefined) return;

      const { before, result, entries, snapshot } = yield* runAndObserve(o, {
        _tag: CommandTag.UpdateArea,
        idempotencyKey: randomUUID(),
        areaId: work.id,
        patch: { name: 'Office' },
      });
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before + 1));
      const entry = onlyEntry(entries);
      assert.strictEqual(entry.entity, ChangeEntity.Area);
      assert.strictEqual(entry.op, ChangeOp.Put);
      assert.strictEqual(field(field(entry, 'after'), 'version'), 2);
      assert.strictEqual(snapshot.areas.find((a) => a.id === work.id)?.name, 'Office');
    }),
  );

  it.effect('SetTimeZone logs a settings put without an id', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* newOwner();

      const { before, result, entries, snapshot } = yield* runAndObserve(o, {
        _tag: CommandTag.SetTimeZone,
        idempotencyKey: randomUUID(),
        timeZone: 'Europe/London',
      });
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before + 1));
      const entry = onlyEntry(entries);
      assert.strictEqual(entry.entity, ChangeEntity.Settings);
      assert.strictEqual(entry.op, ChangeOp.Put);
      assert.isFalse('id' in entry);
      assert.strictEqual(snapshot.settings.timeZone, 'Europe/London');
    }),
  );

  it.effect('SetUrgencyWindow logs a settings put', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* newOwner();

      const { before, result, entries, snapshot } = yield* runAndObserve(o, {
        _tag: CommandTag.SetUrgencyWindow,
        idempotencyKey: randomUUID(),
        days: 5,
      });
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before + 1));
      const entry = onlyEntry(entries);
      assert.strictEqual(entry.entity, ChangeEntity.Settings);
      assert.strictEqual(entry.op, ChangeOp.Put);
      assert.strictEqual(snapshot.settings.urgencyWindowDays, 5);
    }),
  );

  it.effect('ResolveReviewItem logs a review item put with resolvedAt and hides the item', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* newOwner();
      const c = capture();
      yield* runCommand(o, c);
      yield* runCommand(o, complete(c.taskId));
      const dropped = yield* runCommand(o, dropIfOpen(c.taskId));
      assert.strictEqual(dropped._tag, TransitionResultTag.NotApplicable);
      if (dropped._tag !== TransitionResultTag.NotApplicable) return;

      const { before, result, entries, snapshot } = yield* runAndObserve(o, {
        _tag: CommandTag.ResolveReviewItem,
        idempotencyKey: randomUUID(),
        reviewItemId: dropped.reviewItemId,
      });
      yield* removeOwner(o);

      assert.deepStrictEqual(result, applied(before + 1));
      const entry = onlyEntry(entries);
      assert.strictEqual(entry.entity, ChangeEntity.ReviewItem);
      assert.strictEqual(entry.op, ChangeOp.Put);
      assert.strictEqual(field(entry, 'id'), dropped.reviewItemId);
      assert.strictEqual(field(field(entry, 'after'), 'resolvedAt'), T);
      assert.deepStrictEqual(snapshot.reviewItems, []);
    }),
  );
});

layer(appDatabase())('runCommand, clock', (it) => {
  it.effect('stamps a captured task with the current time', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* newOwner();
      const c = capture();

      yield* runCommand(o, c);
      const snapshot = yield* snapshotOf(o);
      yield* removeOwner(o);

      assert.strictEqual(snapshot.tasks.find((t) => t.id === c.taskId)?.createdAt, T);
    }),
  );
});

layer(appDatabase())('mapUniqueViolation', (it) => {
  it.effect('maps a duplicate task primary key to duplicate_id', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const row = taskToRow(o, newTask());

      const reason = yield* failureOf(
        mapUniqueViolation(
          withOwner(
            o,
            Effect.gen(function* () {
              const db = yield* Db;
              yield* db.insert(tasks).values(row);
              yield* db.insert(tasks).values(row);
            }),
          ),
        ),
      );
      yield* removeOwner(o);

      assert.strictEqual(reason, RejectedReason.DuplicateId);
    }),
  );

  it.effect('passes a unique violation of another constraint through unchanged', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const row = {
        ownerId: o,
        seq: 1,
        entity: ChangeEntity.Settings,
        entityId: null,
        op: ChangeOp.Put,
        data: { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 },
      };

      const error = yield* Effect.flip(
        mapUniqueViolation(
          withOwner(
            o,
            Effect.gen(function* () {
              const db = yield* Db;
              yield* db.insert(changeLog).values(row);
              yield* db.insert(changeLog).values(row);
            }),
          ),
        ),
      );
      yield* removeOwner(o);

      assert.isFalse(error instanceof CommandRejected);
      assert.strictEqual(uniqueViolationConstraint(error), 'change_log_pkey');
    }),
  );
});
