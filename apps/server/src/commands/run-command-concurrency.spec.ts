// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { CommandRejected, type CommandRequest, type CommandResult } from '@asys/contract';
import { CommandTag, RejectedReason, TransitionResultTag } from '@asys/domain';
import { assert, layer } from '@effect/vitest';
import { Cause, Deferred, Effect, Exit, Fiber } from 'effect';
import { changesSince } from '../changes/change-log';
import { readSnapshot } from '../changes/snapshot';
import { Db, appDatabase } from '../db/database';
import { idempotencyKeys } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { newOwner, removeOwner } from '../test/owners';
import { runCommand } from './run-command';

// These tests run against the real database (docker compose).

type Req<Tag extends CommandTag> = Extract<CommandRequest, { readonly _tag: Tag }>;

const capture = (): Req<CommandTag.CaptureTask> => ({
  _tag: CommandTag.CaptureTask,
  idempotencyKey: randomUUID(),
  taskId: randomUUID(),
  title: 'a task',
  captureText: '',
});

const addBlocker = (taskId: string, blockerId: string): Req<CommandTag.AddBlocker> => ({
  _tag: CommandTag.AddBlocker,
  idempotencyKey: randomUUID(),
  linkId: randomUUID(),
  taskId,
  blockerId,
});

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const appliedSeq = (result: CommandResult): number =>
  result._tag === TransitionResultTag.Applied ? result.seq : -1;

const keyCount = (owner: string) =>
  withOwner(
    owner,
    Effect.gen(function* () {
      const db = yield* Db;
      return (yield* db.select().from(idempotencyKeys)).length;
    }),
  );

interface Poll {
  readonly after: number;
  readonly head: number;
  readonly seqs: ReadonlyArray<number>;
}

/** Polls the log on its own small pool until `done`, then once more. */
const poller = (owner: string, done: Deferred.Deferred<void>) =>
  Effect.gen(function* () {
    const polls: Poll[] = [];
    let after = 0;
    const pollOnce = Effect.gen(function* () {
      const changes = yield* changesSince(owner, after);
      polls.push({ after, head: changes.seq, seqs: changes.entries.map((e) => e.seq) });
      after = changes.seq;
    });

    while (!(yield* Deferred.isDone(done))) {
      yield* pollOnce;
      yield* Effect.yieldNow;
    }
    yield* pollOnce;
    return polls;
  }).pipe(Effect.provide(appDatabase({ maxConnections: 2 })));

layer(appDatabase(), { excludeTestServices: true })('runCommand, concurrency', (it) => {
  it.effect('numbers 50 concurrent commands contiguously in commit order', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const done = yield* Deferred.make<void>();
      const pollerFiber = yield* Effect.forkChild(poller(o, done));
      const writers = yield* Effect.forkChild(
        Effect.forEach(range(1, 50), () => runCommand(o, capture()), { concurrency: 'unbounded' }),
      );

      const results = yield* Fiber.join(writers);
      yield* Deferred.succeed(done, undefined);
      const polls = yield* Fiber.join(pollerFiber);
      yield* removeOwner(o);

      assert.isTrue(results.every((r) => r._tag === TransitionResultTag.Applied));
      assert.deepStrictEqual(
        results.map(appliedSeq).sort((a, b) => a - b),
        range(1, 50),
      );
      for (const poll of polls) {
        assert.deepStrictEqual(poll.seqs, range(poll.after + 1, poll.head));
      }
      assert.deepStrictEqual(
        polls.flatMap((p) => p.seqs),
        range(1, 50),
      );
      assert.isAtLeast(polls.filter((p) => p.head > 0 && p.head < 50).length, 10);
    }),
  );

  it.effect('applies one request sent twice at once exactly once', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const request = capture();

      const results = yield* Effect.forEach([request, request], (r) => runCommand(o, r), {
        concurrency: 'unbounded',
      });
      const snapshot = yield* readSnapshot(o);
      const keys = yield* keyCount(o);
      yield* removeOwner(o);

      assert.deepStrictEqual(results[0], results[1]);
      assert.strictEqual(snapshot.tasks.length, 1);
      assert.strictEqual(keys, 1);
      assert.strictEqual(snapshot.seq, 1);
    }),
  );

  it.effect('lets only one of two opposite blockers through', () =>
    Effect.gen(function* () {
      const o = yield* newOwner();
      const a = capture();
      const b = capture();
      yield* runCommand(o, a);
      yield* runCommand(o, b);

      const exits = yield* Effect.forEach(
        [addBlocker(a.taskId, b.taskId), addBlocker(b.taskId, a.taskId)],
        (r) => Effect.exit(runCommand(o, r)),
        { concurrency: 'unbounded' },
      );
      const snapshot = yield* readSnapshot(o);
      yield* removeOwner(o);

      const successes = exits.filter(Exit.isSuccess);
      const failures = exits.filter(Exit.isFailure);
      assert.strictEqual(successes.length, 1);
      assert.strictEqual(failures.length, 1);
      const error = Cause.squash(failures[0].cause);
      assert.isTrue(error instanceof CommandRejected);
      if (error instanceof CommandRejected) {
        assert.strictEqual(error.reason, RejectedReason.Cycle);
      }
      assert.strictEqual(snapshot.blockers.length, 1);
    }),
  );
});
