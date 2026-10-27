// SPDX-License-Identifier: EUPL-1.2
import { CommandTag, type Task, TaskKind, TaskStatus } from '@asys/domain';

import { draftOf, type TaskDraft } from '../../core/data/task-patch';
import { triageCommand } from './triage-command';

const TASK: Task = {
  id: 't1',
  kind: TaskKind.Task,
  status: TaskStatus.Open,
  title: 'Call Marit',
  notes: 'About the lease',
  captureText: 'call marit',
  areaId: 'a1',
  availableFrom: { date: '2026-10-05' },
  due: { date: '2026-10-09', time: '17:00' },
  estimateMinutes: null,
  important: null,
  voice: null,
  privacy: null,
  dueMoveCount: 0,
  version: 1,
  createdAt: 1,
  closedAt: null,
};

const chosen = (overrides: Partial<TaskDraft> = {}): TaskDraft => ({
  ...draftOf(TASK),
  important: true,
  estimateMinutes: 25,
  ...overrides,
});

const BARE = {
  _tag: CommandTag.TriageTask,
  taskId: 't1',
  important: true,
  estimateMinutes: 25,
  expect: { status: TaskStatus.Open },
};

describe('triageCommand', () => {
  it('is null while Importance or an Estimate is missing', () => {
    expect(triageCommand(TASK, draftOf(TASK))).toBeNull();
    expect(triageCommand(TASK, chosen({ important: null }))).toBeNull();
    expect(triageCommand(TASK, chosen({ estimateMinutes: null }))).toBeNull();
  });

  it('carries only Importance, the Estimate and the expectation when nothing else changed', () => {
    const command = triageCommand(TASK, chosen({ important: false, estimateMinutes: 5 }));

    expect(command).toEqual({ ...BARE, important: false, estimateMinutes: 5 });
    expect(Object.keys(command ?? {}).sort()).toEqual([
      '_tag',
      'estimateMinutes',
      'expect',
      'important',
      'taskId',
    ]);
  });

  it('carries every changed field', () => {
    const command = triageCommand(
      TASK,
      chosen({
        title: '  Call Marit back  ',
        notes: 'About the lease and the keys',
        areaId: 'a2',
        availableFrom: null,
        due: { date: '2026-10-12' },
      }),
    );

    expect(command).toEqual({
      ...BARE,
      title: 'Call Marit back',
      notes: 'About the lease and the keys',
      areaId: 'a2',
      availableFrom: null,
      due: { date: '2026-10-12' },
    });
  });

  it('sends No Area as null, and an Area for a Task that had none', () => {
    expect(triageCommand(TASK, chosen({ areaId: '' }))).toEqual({ ...BARE, areaId: null });
    expect(triageCommand({ ...TASK, areaId: null }, chosen({ areaId: 'a1' }))).toEqual({
      ...BARE,
      areaId: 'a1',
    });
    expect(triageCommand({ ...TASK, areaId: null }, chosen({ areaId: '' }))).toEqual(BARE);
  });

  it('leaves out a blank title, so the stored one stays', () => {
    expect(triageCommand(TASK, chosen({ title: '   ' }))).toEqual(BARE);
  });

  it('leaves out a title that differs only by spaces around it', () => {
    expect(triageCommand(TASK, chosen({ title: ' Call Marit ' }))).toEqual(BARE);
  });

  it('compares dates by value, and sets dates on a Task that had none', () => {
    expect(
      triageCommand(
        TASK,
        chosen({
          availableFrom: { date: '2026-10-05' },
          due: { date: '2026-10-09', time: '17:00' },
        }),
      ),
    ).toEqual(BARE);
    expect(
      triageCommand(
        { ...TASK, availableFrom: null, due: null },
        chosen({ availableFrom: { date: '2026-10-06', time: '09:00' }, due: null }),
      ),
    ).toEqual({ ...BARE, availableFrom: { date: '2026-10-06', time: '09:00' } });
  });
});
