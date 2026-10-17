// SPDX-License-Identifier: EUPL-1.2
import { TaskKind, TaskStatus, type Task } from '@asys/domain';

import { previewTask } from './task-preview';
import type { TaskDraft } from './task-patch';

const TASK: Task = {
  id: 't1',
  kind: TaskKind.Task,
  status: TaskStatus.Open,
  title: 'Call Marit',
  notes: 'About the lease',
  captureText: 'call marit',
  areaId: 'a1',
  availableFrom: null,
  due: { date: '2026-10-05' },
  estimateMinutes: 30,
  important: true,
  voice: null,
  privacy: null,
  dueMoveCount: 2,
  version: 7,
  createdAt: 1,
  closedAt: null,
};

const DRAFT: TaskDraft = {
  title: 'Typed title',
  notes: 'Typed notes',
  areaId: 'a2',
  important: false,
  estimateMinutes: 15,
  availableFrom: { date: '2026-10-04', time: '09:00' },
  due: { date: '2026-10-20' },
};

describe('previewTask', () => {
  it('takes Importance, Estimate, Area and dates from the draft', () => {
    const preview = previewTask(TASK, DRAFT);

    expect(preview.important).toBe(false);
    expect(preview.estimateMinutes).toBe(15);
    expect(preview.areaId).toBe('a2');
    expect(preview.availableFrom).toEqual({ date: '2026-10-04', time: '09:00' });
    expect(preview.due).toEqual({ date: '2026-10-20' });
  });

  it("keeps the Task's own title, Notes, status, ids and versions", () => {
    expect(previewTask(TASK, DRAFT)).toEqual({
      ...TASK,
      areaId: 'a2',
      important: false,
      estimateMinutes: 15,
      availableFrom: { date: '2026-10-04', time: '09:00' },
      due: { date: '2026-10-20' },
    });
  });

  it('turns the empty Area into a null Area', () => {
    expect(previewTask(TASK, { ...DRAFT, areaId: '' }).areaId).toBeNull();
  });

  it('takes null Importance, Estimate and dates from the draft', () => {
    const preview = previewTask(TASK, {
      ...DRAFT,
      important: null,
      estimateMinutes: null,
      due: null,
    });

    expect(preview.important).toBeNull();
    expect(preview.estimateMinutes).toBeNull();
    expect(preview.due).toBeNull();
  });

  it('returns a new object and leaves the Task alone', () => {
    const preview = previewTask(TASK, DRAFT);

    expect(preview).not.toBe(TASK);
    expect(TASK.areaId).toBe('a1');
  });
});
