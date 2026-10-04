// SPDX-License-Identifier: EUPL-1.2
import { TaskKind, TaskStatus, type Task } from '@asys/domain';

import { buildTaskPatch, draftOf, type TaskDraft } from './task-patch';

const BASELINE: TaskDraft = {
  title: 'Call Marit',
  notes: '',
  areaId: '',
  important: true,
  estimateMinutes: 30,
  availableFrom: null,
  due: { date: '2026-10-05' },
};

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  kind: TaskKind.Task,
  status: TaskStatus.Open,
  title: 'Call Marit',
  notes: 'About the lease',
  captureText: 'call marit',
  areaId: null,
  availableFrom: { date: '2026-10-04', time: '09:00' },
  due: { date: '2026-10-05' },
  estimateMinutes: 30,
  important: true,
  voice: null,
  privacy: null,
  dueMoveCount: 0,
  version: 1,
  createdAt: 1,
  closedAt: null,
  ...overrides,
});

describe('draftOf', () => {
  it('copies the editable fields of the Task', () => {
    expect(draftOf(task({ areaId: 'a1' }))).toEqual({
      title: 'Call Marit',
      notes: 'About the lease',
      areaId: 'a1',
      important: true,
      estimateMinutes: 30,
      availableFrom: { date: '2026-10-04', time: '09:00' },
      due: { date: '2026-10-05' },
    });
  });

  it('turns a missing Area into an empty string', () => {
    expect(draftOf(task({ areaId: null })).areaId).toBe('');
  });

  it('keeps missing Importance, Estimate and dates as null', () => {
    const draft = draftOf(
      task({ important: null, estimateMinutes: null, availableFrom: null, due: null }),
    );

    expect(draft.important).toBeNull();
    expect(draft.estimateMinutes).toBeNull();
    expect(draft.availableFrom).toBeNull();
    expect(draft.due).toBeNull();
  });
});

describe('buildTaskPatch', () => {
  it('is empty for the same draft', () => {
    expect(buildTaskPatch(BASELINE, BASELINE)).toEqual({});
  });

  it('ignores surrounding whitespace in the title', () => {
    expect(buildTaskPatch(BASELINE, { ...BASELINE, title: '  Call Marit  ' })).toEqual({});
  });

  it('sends a changed title trimmed', () => {
    expect(buildTaskPatch(BASELINE, { ...BASELINE, title: 'Call Marit back' })).toEqual({
      title: 'Call Marit back',
    });
    expect(buildTaskPatch(BASELINE, { ...BASELINE, title: '  Call Marit back ' })).toEqual({
      title: 'Call Marit back',
    });
  });

  it('sends changed notes as typed', () => {
    expect(buildTaskPatch(BASELINE, { ...BASELINE, notes: ' line one\n\nline two ' })).toEqual({
      notes: ' line one\n\nline two ',
    });
  });

  it('sends a chosen Area, and null when it goes back to No Area', () => {
    const withArea = { ...BASELINE, areaId: 'a1' };

    expect(buildTaskPatch(BASELINE, withArea)).toEqual({ areaId: 'a1' });
    expect(buildTaskPatch(withArea, BASELINE)).toEqual({ areaId: null });
  });

  it('sends a cleared Estimate as null and a changed one as its value', () => {
    expect(buildTaskPatch(BASELINE, { ...BASELINE, estimateMinutes: null })).toEqual({
      estimateMinutes: null,
    });
    expect(buildTaskPatch(BASELINE, { ...BASELINE, estimateMinutes: 45 })).toEqual({
      estimateMinutes: 45,
    });
  });

  it('sends a changed Importance, including a cleared one', () => {
    expect(buildTaskPatch(BASELINE, { ...BASELINE, important: false })).toEqual({
      important: false,
    });
    expect(buildTaskPatch(BASELINE, { ...BASELINE, important: null })).toEqual({
      important: null,
    });
  });

  it('sends a Due whose time changed', () => {
    expect(
      buildTaskPatch(BASELINE, { ...BASELINE, due: { date: '2026-10-05', time: '09:00' } }),
    ).toEqual({ due: { date: '2026-10-05', time: '09:00' } });
  });

  it('treats an equal DateSpec written as a new object as unchanged', () => {
    expect(buildTaskPatch(BASELINE, { ...BASELINE, due: { date: '2026-10-05' } })).toEqual({});
  });

  it('sends a cleared Due as null', () => {
    expect(buildTaskPatch(BASELINE, { ...BASELINE, due: null })).toEqual({ due: null });
  });

  it('sends a newly set date where the baseline had none, and null equals only null', () => {
    expect(
      buildTaskPatch(BASELINE, { ...BASELINE, availableFrom: { date: '2026-10-06' } }),
    ).toEqual({ availableFrom: { date: '2026-10-06' } });
    expect(buildTaskPatch(BASELINE, { ...BASELINE, availableFrom: null })).toEqual({});
  });

  it('sends several changed fields together and nothing else', () => {
    expect(
      buildTaskPatch(BASELINE, {
        ...BASELINE,
        important: false,
        availableFrom: { date: '2026-10-06' },
      }),
    ).toEqual({ important: false, availableFrom: { date: '2026-10-06' } });
  });

  it('has no keys for unchanged fields', () => {
    expect(Object.keys(buildTaskPatch(BASELINE, { ...BASELINE, notes: 'x' }))).toEqual(['notes']);
  });
});
