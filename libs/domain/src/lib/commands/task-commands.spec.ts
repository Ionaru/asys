// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aLink, aState, aTask, anArea } from '../../test/builders';
import { type Task, TaskStatus } from '../task';
import {
  type Change,
  type EditTask,
  type TaskPatch,
  type TransitionResult,
  ChangeEntity,
  ChangeOp,
  CommandTag,
  MAX_MINUTES,
  NotApplicableReason,
  RejectedReason,
  TransitionResultTag,
} from './command';
import {
  canLogProgress,
  captureTask,
  completeTask,
  dropTask,
  editTask,
  logProgress,
  triageTask,
} from './task-commands';
import { TaskKind } from '../task/task';

const now = Date.parse('2026-10-14T08:00:00.000Z');

const changesOf = (result: TransitionResult): readonly Change[] => {
  if (result._tag !== TransitionResultTag.Applied) {
    throw new Error(`expected Applied, got ${JSON.stringify(result)}`);
  }
  return result.changes;
};

const taskAfter = (result: TransitionResult): Task => {
  const changes = changesOf(result);
  expect(changes).toHaveLength(1);
  const change = changes[0];
  if (change?.entity !== ChangeEntity.Task || change.op !== ChangeOp.Put) {
    throw new Error(`expected a task put, got ${JSON.stringify(change)}`);
  }
  return change.after;
};

const rejected = (reason: RejectedReason) => ({ _tag: TransitionResultTag.Rejected, reason });

const notApplicable = (reason: NotApplicableReason) => ({
  _tag: TransitionResultTag.NotApplicable,
  reason,
});

const edit = (task: Task, patch: TaskPatch, areas = [] as ReturnType<typeof anArea>[]) =>
  editTask(
    aState({ tasks: [task], areas }),
    { _tag: CommandTag.EditTask, taskId: task.id, patch },
    now,
  );

describe('captureTask', () => {
  it('creates an open Inbox Task with the trimmed title and the raw capture text', () => {
    const result = captureTask(
      aState(),
      {
        _tag: CommandTag.CaptureTask,
        taskId: 't1',
        title: '  Buy card  ',
        captureText: '  Buy card\nfor Mila ',
      },
      now,
    );
    expect(result).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [
        {
          entity: ChangeEntity.Task,
          op: ChangeOp.Put,
          id: 't1',
          after: {
            id: 't1',
            kind: TaskKind.Task,
            status: TaskStatus.Open,
            title: 'Buy card',
            notes: '',
            captureText: '  Buy card\nfor Mila ',
            areaId: null,
            availableFrom: null,
            due: null,
            estimateMinutes: null,
            important: null,
            voice: null,
            privacy: null,
            dueMoveCount: 0,
            version: 1,
            createdAt: now,
            closedAt: null,
          },
        },
      ],
    });
  });

  it('rejects a blank title with invalid_title', () => {
    const result = captureTask(
      aState(),
      { _tag: CommandTag.CaptureTask, taskId: 't1', title: '   ', captureText: 'x' },
      now,
    );
    expect(result).toEqual(rejected(RejectedReason.InvalidTitle));
  });

  it('rejects an existing id with duplicate_id', () => {
    const result = captureTask(
      aState({ tasks: [aTask({ id: 't1' })] }),
      { _tag: CommandTag.CaptureTask, taskId: 't1', title: 'A', captureText: 'A' },
      now,
    );
    expect(result).toEqual(rejected(RejectedReason.DuplicateId));
  });

  it('rejects an id held by a Done Task with duplicate_id', () => {
    const result = captureTask(
      aState({ tasks: [aTask({ id: 't1', status: TaskStatus.Done, closedAt: 5 })] }),
      { _tag: CommandTag.CaptureTask, taskId: 't1', title: 'A', captureText: 'A' },
      now,
    );
    expect(result).toEqual(rejected(RejectedReason.DuplicateId));
  });

  it('rejects an unknown Area with unknown_area', () => {
    const result = captureTask(
      aState({ areas: [anArea({ id: 'work' })] }),
      { _tag: CommandTag.CaptureTask, taskId: 't1', title: 'A', captureText: 'A', areaId: 'nope' },
      now,
    );
    expect(result).toEqual(rejected(RejectedReason.UnknownArea));
  });

  it('rejects a blank title before a duplicate id', () => {
    const result = captureTask(
      aState({ tasks: [aTask({ id: 't1' })] }),
      { _tag: CommandTag.CaptureTask, taskId: 't1', title: '   ', captureText: 'A' },
      now,
    );
    expect(result).toEqual(rejected(RejectedReason.InvalidTitle));
  });

  it('rejects a duplicate id before an unknown Area', () => {
    const result = captureTask(
      aState({ tasks: [aTask({ id: 't1' })] }),
      { _tag: CommandTag.CaptureTask, taskId: 't1', title: 'A', captureText: 'A', areaId: 'nope' },
      now,
    );
    expect(result).toEqual(rejected(RejectedReason.DuplicateId));
  });

  it('stores a known Area id on the new Task', () => {
    const result = captureTask(
      aState({ areas: [anArea({ id: 'work' })] }),
      { _tag: CommandTag.CaptureTask, taskId: 't1', title: 'A', captureText: 'A', areaId: 'work' },
      now,
    );
    expect(taskAfter(result).areaId).toBe('work');
  });

  it('accepts an explicit null Area id and stores null', () => {
    const result = captureTask(
      aState(),
      { _tag: CommandTag.CaptureTask, taskId: 't1', title: 'A', captureText: 'A', areaId: null },
      now,
    );
    expect(taskAfter(result).areaId).toBeNull();
  });
});

describe('triageTask', () => {
  const inbox = aTask({ id: 't1', important: null, estimateMinutes: null, version: 1 });
  const triage = (
    task: Task | undefined,
    extra: Record<string, unknown> = {},
    areas = [] as ReturnType<typeof anArea>[],
  ) =>
    triageTask(
      aState({ tasks: task ? [task] : [], areas }),
      { _tag: CommandTag.TriageTask, taskId: 't1', important: true, estimateMinutes: 15, ...extra },
      now,
    );

  it('sets importance and estimate, bumps the version and leaves other fields alone', () => {
    const after = taskAfter(triage(inbox));
    expect(after).toEqual({ ...inbox, important: true, estimateMinutes: 15, version: 2 });
  });

  it('returns exactly one task put change keyed by the Task id', () => {
    expect(changesOf(triage(inbox))).toEqual([
      {
        entity: ChangeEntity.Task,
        op: ChangeOp.Put,
        id: 't1',
        after: { ...inbox, important: true, estimateMinutes: 15, version: 2 },
      },
    ]);
  });

  it.each([0, 1.5, 100_001, -3, Number.NaN])(
    'rejects estimate %s with invalid_estimate',
    (estimateMinutes) => {
      expect(triage(inbox, { estimateMinutes })).toEqual(rejected(RejectedReason.InvalidEstimate));
    },
  );

  it.each([1, 100_000])('accepts the boundary estimate %s', (estimateMinutes) => {
    expect(taskAfter(triage(inbox, { estimateMinutes })).estimateMinutes).toBe(estimateMinutes);
  });

  it('returns NotApplicable not_open for a Done Task', () => {
    expect(triage(aTask({ id: 't1', status: TaskStatus.Done, closedAt: 1 }))).toEqual(
      notApplicable(NotApplicableReason.NotOpen),
    );
  });

  it('rejects a missing Task with not_found', () => {
    expect(triage(undefined)).toEqual(rejected(RejectedReason.NotFound));
  });

  it('rejects an invalid estimate before looking for the Task', () => {
    expect(triage(undefined, { estimateMinutes: 0 })).toEqual(
      rejected(RejectedReason.InvalidEstimate),
    );
  });

  it('clears the Area when areaId is null', () => {
    const inWork = aTask({ id: 't1', areaId: 'work' });
    expect(taskAfter(triage(inWork, { areaId: null })).areaId).toBeNull();
  });

  it('sets a known Area', () => {
    const after = taskAfter(triage(inbox, { areaId: 'work' }, [anArea({ id: 'work' })]));
    expect(after.areaId).toBe('work');
  });

  it('keeps the Area when areaId is absent', () => {
    const inWork = aTask({ id: 't1', areaId: 'work', important: null });
    expect(taskAfter(triage(inWork)).areaId).toBe('work');
  });

  it('keeps the Area when areaId is explicitly undefined', () => {
    const inWork = aTask({ id: 't1', areaId: 'work', important: null });
    expect(taskAfter(triage(inWork, { areaId: undefined })).areaId).toBe('work');
  });

  it('rejects an unknown Area with unknown_area', () => {
    expect(triage(inbox, { areaId: 'nope' })).toEqual(rejected(RejectedReason.UnknownArea));
  });

  it('reports not_open before unknown_area', () => {
    const done = aTask({ id: 't1', status: TaskStatus.Done, closedAt: 1 });
    expect(triage(done, { areaId: 'nope' })).toEqual(notApplicable(NotApplicableReason.NotOpen));
  });

  it('allows triaging an already triaged Task again', () => {
    const triaged = aTask({ id: 't1', important: false, estimateMinutes: 60, version: 4 });
    expect(taskAfter(triage(triaged))).toEqual({
      ...triaged,
      important: true,
      estimateMinutes: 15,
      version: 5,
    });
  });

  it('is Applied with no changes when the values equal the current ones', () => {
    const same = aTask({ id: 't1', important: true, estimateMinutes: 15, version: 3 });
    expect(triage(same)).toEqual({ _tag: TransitionResultTag.Applied, changes: [] });
  });

  it('is Applied with no changes when the Area is also unchanged', () => {
    const same = aTask({ id: 't1', important: true, estimateMinutes: 15, areaId: 'work' });
    expect(triage(same, { areaId: 'work' }, [anArea({ id: 'work' })])).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [],
    });
  });
});

describe('expect', () => {
  const t1 = aTask({ id: 't1', version: 3 });
  const run = (expectation: Record<string, unknown>) =>
    completeTask(
      aState({ tasks: [t1] }),
      { _tag: CommandTag.CompleteTask, taskId: 't1', expect: expectation },
      now,
    );

  it('passes when status and version both match', () => {
    expect(taskAfter(run({ status: TaskStatus.Open, version: 3 })).status).toBe(TaskStatus.Done);
  });

  it('fails with expectation_failed when the version differs', () => {
    expect(run({ version: 2 })).toEqual(notApplicable(NotApplicableReason.ExpectationFailed));
  });

  it('fails with expectation_failed when the status differs', () => {
    expect(run({ status: TaskStatus.Done })).toEqual(
      notApplicable(NotApplicableReason.ExpectationFailed),
    );
  });

  it('fails when only one of status and version mismatches', () => {
    expect(run({ status: TaskStatus.Open, version: 9 })).toEqual(
      notApplicable(NotApplicableReason.ExpectationFailed),
    );
  });

  it('passes with an empty expect', () => {
    expect(taskAfter(run({})).status).toBe(TaskStatus.Done);
  });

  it('applies expect before the status precondition in triageTask', () => {
    const done = aTask({ id: 't1', status: TaskStatus.Done, version: 3, closedAt: 1 });
    const result = triageTask(
      aState({ tasks: [done] }),
      {
        _tag: CommandTag.TriageTask,
        taskId: 't1',
        important: true,
        estimateMinutes: 5,
        expect: { version: 1 },
      },
      now,
    );
    expect(result).toEqual(notApplicable(NotApplicableReason.ExpectationFailed));
  });

  it('is checked by editTask, logProgress and dropTask as well', () => {
    const state = aState({ tasks: [t1] });
    const expectation = { version: 99 };
    expect(
      editTask(
        state,
        { _tag: CommandTag.EditTask, taskId: 't1', patch: { notes: 'n' }, expect: expectation },
        now,
      ),
    ).toEqual(notApplicable(NotApplicableReason.ExpectationFailed));
    expect(
      logProgress(
        state,
        { _tag: CommandTag.LogProgress, taskId: 't1', remainingMinutes: 5, expect: expectation },
        now,
      ),
    ).toEqual(notApplicable(NotApplicableReason.ExpectationFailed));
    expect(
      dropTask(state, { _tag: CommandTag.DropTask, taskId: 't1', expect: expectation }, now),
    ).toEqual(notApplicable(NotApplicableReason.ExpectationFailed));
  });

  it('is checked only after the Task is found', () => {
    const result = completeTask(
      aState(),
      { _tag: CommandTag.CompleteTask, taskId: 'missing', expect: { version: 1 } },
      now,
    );
    expect(result).toEqual(rejected(RejectedReason.NotFound));
  });
});

describe('editTask due move counter', () => {
  const due = aTask({ id: 't1', due: { date: '2026-10-19', time: '17:00' }, dueMoveCount: 0 });

  it('counts a changed Due', () => {
    const after = taskAfter(edit(due, { due: { date: '2026-10-20', time: '17:00' } }));
    expect(after.dueMoveCount).toBe(1);
    expect(after.due).toEqual({ date: '2026-10-20', time: '17:00' });
    expect(after.version).toBe(2);
  });

  it('counts a cleared Due', () => {
    const after = taskAfter(edit(due, { due: null }));
    expect(after.dueMoveCount).toBe(1);
    expect(after.due).toBeNull();
  });

  it('is a no-op for the same Due', () => {
    expect(edit(due, { due: { date: '2026-10-19', time: '17:00' } })).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [],
    });
  });

  it('does not count an edit that leaves Due out of the patch', () => {
    const after = taskAfter(edit(due, { title: 'x' }));
    expect(after.dueMoveCount).toBe(0);
    expect(after.due).toEqual({ date: '2026-10-19', time: '17:00' });
  });

  it('does not count setting a first Due', () => {
    const after = taskAfter(edit(aTask({ id: 't1', due: null }), { due: { date: '2026-10-19' } }));
    expect(after.dueMoveCount).toBe(0);
    expect(after.due).toEqual({ date: '2026-10-19' });
  });

  it('counts adding a time to a date-only Due', () => {
    const dateOnly = aTask({ id: 't1', due: { date: '2026-10-19' } });
    const after = taskAfter(edit(dateOnly, { due: { date: '2026-10-19', time: '12:00' } }));
    expect(after.dueMoveCount).toBe(1);
  });

  it('adds to an existing counter', () => {
    const moved = aTask({ id: 't1', due: { date: '2026-10-19' }, dueMoveCount: 2 });
    expect(taskAfter(edit(moved, { due: { date: '2026-10-21' } })).dueMoveCount).toBe(3);
  });

  it('does not count clearing a Due that is already null', () => {
    expect(edit(aTask({ id: 't1', due: null }), { due: null })).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [],
    });
  });
});

describe('editTask validation', () => {
  const t1 = aTask({ id: 't1' });

  it.each([
    ['a null title', { title: null }],
    ['a blank title', { title: '  ' }],
  ])('rejects %s with invalid_title', (_name, patch) => {
    expect(edit(t1, patch as unknown as TaskPatch)).toEqual(rejected(RejectedReason.InvalidTitle));
  });

  it('rejects a null notes value with invalid_notes', () => {
    expect(edit(t1, { notes: null } as unknown as TaskPatch)).toEqual(
      rejected(RejectedReason.InvalidNotes),
    );
  });

  it('reports invalid_notes before invalid_date', () => {
    expect(edit(t1, { notes: null, due: { date: '2026-02-30' } } as unknown as TaskPatch)).toEqual(
      rejected(RejectedReason.InvalidNotes),
    );
  });

  it('rejects an impossible Due date with invalid_date', () => {
    expect(edit(t1, { due: { date: '2026-02-30' } })).toEqual(rejected(RejectedReason.InvalidDate));
  });

  it('rejects an invalid availableFrom time with invalid_date', () => {
    expect(edit(t1, { availableFrom: { date: '2026-10-15', time: '25:00' } })).toEqual(
      rejected(RejectedReason.InvalidDate),
    );
  });

  it.each([0, 1.5, 100_001, -1])('rejects estimate %s with invalid_estimate', (estimateMinutes) => {
    expect(edit(t1, { estimateMinutes })).toEqual(rejected(RejectedReason.InvalidEstimate));
  });

  it('accepts the upper estimate boundary', () => {
    expect(taskAfter(edit(t1, { estimateMinutes: 100_000 })).estimateMinutes).toBe(100_000);
  });

  it('clears the estimate with null', () => {
    const after = taskAfter(edit(t1, { estimateMinutes: null }));
    expect(after.estimateMinutes).toBeNull();
    expect(after.version).toBe(2);
  });

  it('rejects an unknown Area with unknown_area', () => {
    expect(edit(t1, { areaId: 'nope' })).toEqual(rejected(RejectedReason.UnknownArea));
  });

  it('sets a known Area', () => {
    expect(taskAfter(edit(t1, { areaId: 'work' }, [anArea({ id: 'work' })])).areaId).toBe('work');
  });

  it('trims the title', () => {
    expect(taskAfter(edit(t1, { title: ' New ' })).title).toBe('New');
  });

  it('keeps notes exactly as given', () => {
    expect(taskAfter(edit(t1, { notes: ' keep  ' })).notes).toBe(' keep  ');
  });

  it('rejects invalid fields before looking for the Task', () => {
    const result = editTask(
      aState(),
      { _tag: CommandTag.EditTask, taskId: 'missing', patch: { title: '' } },
      now,
    );
    expect(result).toEqual(rejected(RejectedReason.InvalidTitle));
  });

  it('rejects a missing Task with not_found', () => {
    const result = editTask(
      aState(),
      { _tag: CommandTag.EditTask, taskId: 'missing', patch: { notes: 'x' } },
      now,
    );
    expect(result).toEqual(rejected(RejectedReason.NotFound));
  });

  it('reports the first invalid field in the listed order', () => {
    const patch = { estimateMinutes: 0, due: { date: '2026-02-30' }, notes: null, title: '' };
    expect(edit(t1, patch as unknown as TaskPatch)).toEqual(rejected(RejectedReason.InvalidTitle));
    expect(edit(t1, { estimateMinutes: 0, due: { date: '2026-02-30' } })).toEqual(
      rejected(RejectedReason.InvalidDate),
    );
  });

  it('reports expectation_failed before unknown_area', () => {
    const command: EditTask = {
      _tag: CommandTag.EditTask,
      taskId: 't1',
      patch: { areaId: 'nope' },
      expect: { version: 7 },
    };
    expect(editTask(aState({ tasks: [t1] }), command, now)).toEqual(
      notApplicable(NotApplicableReason.ExpectationFailed),
    );
  });

  it('clears the Area with null', () => {
    const inWork = aTask({ id: 't1', areaId: 'work' });
    expect(taskAfter(edit(inWork, { areaId: null })).areaId).toBeNull();
  });

  it('clears availableFrom with null', () => {
    const held = aTask({ id: 't1', availableFrom: { date: '2026-10-15' } });
    expect(taskAfter(edit(held, { availableFrom: null })).availableFrom).toBeNull();
  });

  it('clears importance with null', () => {
    expect(taskAfter(edit(t1, { important: null })).important).toBeNull();
  });

  it('sets importance to false', () => {
    expect(taskAfter(edit(t1, { important: false })).important).toBe(false);
  });

  it('is Applied with no changes for an empty patch', () => {
    expect(edit(t1, {})).toEqual({ _tag: TransitionResultTag.Applied, changes: [] });
  });

  it('is Applied with no changes when a patch repeats current values', () => {
    const same = aTask({
      id: 't1',
      title: 'Same',
      notes: 'n',
      availableFrom: { date: '2026-10-15' },
    });
    expect(
      edit(same, { title: ' Same ', notes: 'n', availableFrom: { date: '2026-10-15' } }),
    ).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [],
    });
  });

  it('ignores a patch key that is explicitly undefined', () => {
    expect(edit(t1, { title: undefined, notes: 'n' }).valueOf()).toEqual(
      edit(t1, { notes: 'n' }).valueOf(),
    );
  });

  it('leaves the other fields of the Task untouched', () => {
    const full = aTask({ id: 't1', areaId: 'work', due: { date: '2026-10-19' }, version: 6 });
    const after = taskAfter(edit(full, { notes: 'n' }, [anArea({ id: 'work' })]));
    expect(after).toEqual({ ...full, notes: 'n', version: 7 });
  });

  it('is allowed on a Done Task', () => {
    const done = aTask({ id: 't1', status: TaskStatus.Done, closedAt: 1 });
    const after = taskAfter(edit(done, { notes: 'after' }));
    expect(after.notes).toBe('after');
    expect(after.status).toBe(TaskStatus.Done);
  });
});

describe('logProgress', () => {
  const t1 = aTask({ id: 't1', estimateMinutes: 30, version: 2 });
  const log = (task: Task, remainingMinutes: number) =>
    logProgress(
      aState({ tasks: [task] }),
      { _tag: CommandTag.LogProgress, taskId: task.id, remainingMinutes },
      now,
    );

  it('replaces the estimate with the remaining minutes and bumps the version', () => {
    expect(taskAfter(log(t1, 20))).toEqual({ ...t1, estimateMinutes: 20, version: 3 });
  });

  it('accepts one minute remaining', () => {
    expect(taskAfter(log(t1, 1)).estimateMinutes).toBe(1);
  });

  it('rejects remaining equal to the estimate with invalid_remaining', () => {
    expect(log(t1, 30)).toEqual(rejected(RejectedReason.InvalidRemaining));
  });

  it('rejects remaining above the estimate with invalid_remaining', () => {
    expect(log(t1, 31)).toEqual(rejected(RejectedReason.InvalidRemaining));
  });

  it.each([0, -1, 1.5, 100_001])('rejects remaining %s with invalid_remaining', (remaining) => {
    expect(log(t1, remaining)).toEqual(rejected(RejectedReason.InvalidRemaining));
  });

  it('rejects a Task without an estimate with no_estimate', () => {
    expect(log(aTask({ id: 't1', estimateMinutes: null }), 10)).toEqual(
      rejected(RejectedReason.NoEstimate),
    );
  });

  it('checks the remaining minutes before no_estimate', () => {
    expect(log(aTask({ id: 't1', estimateMinutes: null }), -1)).toEqual(
      rejected(RejectedReason.InvalidRemaining),
    );
  });

  it('returns not_open for a Delegated Task', () => {
    expect(log(aTask({ id: 't1', status: TaskStatus.Delegated }), 10)).toEqual(
      notApplicable(NotApplicableReason.NotOpen),
    );
  });

  it('checks status before the estimate', () => {
    const done = aTask({ id: 't1', status: TaskStatus.Done, estimateMinutes: null, closedAt: 1 });
    expect(log(done, 10)).toEqual(notApplicable(NotApplicableReason.NotOpen));
  });

  it('rejects a missing Task with not_found', () => {
    const result = logProgress(
      aState(),
      { _tag: CommandTag.LogProgress, taskId: 'x', remainingMinutes: 5 },
      now,
    );
    expect(result).toEqual(rejected(RejectedReason.NotFound));
  });
});

describe('canLogProgress', () => {
  /** Whether the smallest valid time still needed, 1 minute, is accepted for the Task. */
  const logProgressApplies = (task: Task): boolean =>
    logProgress(
      aState({ tasks: [task] }),
      { _tag: CommandTag.LogProgress, taskId: task.id, remainingMinutes: 1 },
      now,
    )._tag === TransitionResultTag.Applied;

  it.each([
    [1, false],
    [2, true],
    [3, true],
    [MAX_MINUTES, true],
  ])('agrees with logProgress for an Open Task with an Estimate of %s', (estimateMinutes, can) => {
    const task = aTask({ id: 't1', estimateMinutes });

    expect(canLogProgress(task)).toBe(can);
    expect(logProgressApplies(task)).toBe(can);
  });

  it('agrees with logProgress for a Task without an Estimate', () => {
    const task = aTask({ id: 't1', estimateMinutes: null });

    expect(canLogProgress(task)).toBe(false);
    expect(logProgressApplies(task)).toBe(false);
  });

  it.each(Object.values(TaskStatus).filter((status) => status !== TaskStatus.Open))(
    'agrees with logProgress for a %s Task, whatever its Estimate',
    (status) => {
      const task = aTask({ id: 't1', status, estimateMinutes: 30 });

      expect(canLogProgress(task)).toBe(false);
      expect(logProgressApplies(task)).toBe(false);
    },
  );

  it('is false when there is no Task', () => {
    expect(canLogProgress(undefined)).toBe(false);
  });
});

describe('completeTask and dropTask', () => {
  const t1 = aTask({ id: 't1', version: 4 });
  const complete = (state = aState({ tasks: [t1] }), taskId = 't1', extra = {}) =>
    completeTask(state, { _tag: CommandTag.CompleteTask, taskId, ...extra }, now);
  const drop = (state = aState({ tasks: [t1] }), taskId = 't1', extra = {}) =>
    dropTask(state, { _tag: CommandTag.DropTask, taskId, ...extra }, now);

  it('completes an open Task with exactly one put change', () => {
    expect(complete()).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [
        {
          entity: ChangeEntity.Task,
          op: ChangeOp.Put,
          id: 't1',
          after: { ...t1, status: TaskStatus.Done, closedAt: now, version: 5 },
        },
      ],
    });
  });

  it('leaves Tasks that t1 blocks, and the links, out of the changes', () => {
    const state = aState({
      tasks: [t1, aTask({ id: 't2' }), aTask({ id: 't3' })],
      links: [aLink('t2', 't1'), aLink('t3', 't1')],
    });
    expect(changesOf(complete(state))).toEqual([
      {
        entity: ChangeEntity.Task,
        op: ChangeOp.Put,
        id: 't1',
        after: { ...t1, status: TaskStatus.Done, closedAt: now, version: 5 },
      },
    ]);
  });

  it('drops an open Task', () => {
    expect(drop()).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [
        {
          entity: ChangeEntity.Task,
          op: ChangeOp.Put,
          id: 't1',
          after: { ...t1, status: TaskStatus.Dropped, closedAt: now, version: 5 },
        },
      ],
    });
  });

  it.each([
    TaskStatus.Dropped,
    TaskStatus.Delegated,
    TaskStatus.Skipped,
    TaskStatus.Done,
  ] as const satisfies readonly TaskStatus[])(
    'completeTask returns not_open for a %s Task',
    (status) => {
      expect(complete(aState({ tasks: [aTask({ id: 't1', status })] }))).toEqual(
        notApplicable(NotApplicableReason.NotOpen),
      );
    },
  );

  it.each([
    TaskStatus.Dropped,
    TaskStatus.Delegated,
    TaskStatus.Skipped,
    TaskStatus.Done,
  ] as const satisfies readonly TaskStatus[])(
    'dropTask returns not_open for a %s Task',
    (status) => {
      expect(drop(aState({ tasks: [aTask({ id: 't1', status })] }))).toEqual(
        notApplicable(NotApplicableReason.NotOpen),
      );
    },
  );

  it('completeTask rejects a missing Task with not_found', () => {
    expect(complete(aState(), 'missing')).toEqual(rejected(RejectedReason.NotFound));
  });

  it('dropTask rejects a missing Task with not_found', () => {
    expect(drop(aState(), 'missing')).toEqual(rejected(RejectedReason.NotFound));
  });

  it('reports expectation_failed when dropping a just-completed Task with expect open', () => {
    const done = taskAfter(complete());
    const state = aState({ tasks: [done] });
    expect(drop(state, 't1', { expect: { status: TaskStatus.Open } })).toEqual(
      notApplicable(NotApplicableReason.ExpectationFailed),
    );
  });

  it('reports not_open when dropping a just-completed Task without expect', () => {
    const done = taskAfter(complete());
    expect(drop(aState({ tasks: [done] }))).toEqual(notApplicable(NotApplicableReason.NotOpen));
  });
});

describe('purity', () => {
  it('does not mutate a deep-frozen state or command, and returns new objects', () => {
    const deepFreeze = <T>(value: T): T => {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
      }
      return value;
    };
    const t1 = aTask({ id: 't1', due: { date: '2026-10-19' }, areaId: 'work' });
    const state = deepFreeze(
      aState({
        tasks: [t1, aTask({ id: 't2' })],
        links: [aLink('t2', 't1')],
        areas: [anArea({ id: 'work' })],
      }),
    );
    const before = structuredClone(state);
    const commands = deepFreeze([
      { _tag: CommandTag.CaptureTask, taskId: 'n', title: ' A ', captureText: 'A', areaId: 'work' },
      {
        _tag: CommandTag.TriageTask,
        taskId: 't1',
        important: false,
        estimateMinutes: 9,
        areaId: null,
      },
      {
        _tag: CommandTag.EditTask,
        taskId: 't1',
        patch: { title: 'B', due: { date: '2026-10-20' } },
      },
      { _tag: CommandTag.LogProgress, taskId: 't1', remainingMinutes: 5 },
      { _tag: CommandTag.CompleteTask, taskId: 't1' },
      { _tag: CommandTag.DropTask, taskId: 't1' },
    ] as const);

    const results = [
      captureTask(state, commands[0], now),
      triageTask(state, commands[1], now),
      editTask(state, commands[2], now),
      logProgress(state, commands[3], now),
      completeTask(state, commands[4], now),
      dropTask(state, commands[5], now),
    ];

    expect(state).toEqual(before);
    for (const result of results) {
      expect(result._tag).toBe(TransitionResultTag.Applied);
    }
    const after = taskAfter(results[4] as TransitionResult);
    expect(after).not.toBe(t1);
    expect(t1.status).toBe(TaskStatus.Open);
  });
});
