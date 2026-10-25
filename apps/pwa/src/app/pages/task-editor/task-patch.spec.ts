// SPDX-License-Identifier: EUPL-1.2
import { TaskKind, TaskStatus, type Task } from '@asys/domain';

import {
  buildSavePatch,
  buildTaskPatch,
  COMMITTED_FIELDS,
  committedOf,
  draftOf,
  savableDraft,
  type CommittedText,
  type TaskDraft,
} from './task-patch';

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

describe('committedOf', () => {
  it('takes the title and Notes of the draft', () => {
    expect(committedOf({ ...BASELINE, title: 'Buy milk', notes: 'Oat' })).toEqual({
      title: 'Buy milk',
      notes: 'Oat',
    });
  });
});

describe('COMMITTED_FIELDS', () => {
  const a: CommittedText = { title: 'A', notes: 'n' };

  it('names the title and notes', () => {
    expect([...COMMITTED_FIELDS.keys]).toEqual(['title', 'notes']);
  });

  it('compares field by field', () => {
    expect(COMMITTED_FIELDS.same('title', a, { ...a })).toBe(true);
    expect(COMMITTED_FIELDS.same('title', a, { ...a, title: 'B' })).toBe(false);
    expect(COMMITTED_FIELDS.same('notes', a, { ...a, title: 'B' })).toBe(true);
    expect(COMMITTED_FIELDS.same('notes', a, { ...a, notes: 'm' })).toBe(false);
  });
});

describe('buildSavePatch and savableDraft', () => {
  const MILK: TaskDraft = {
    title: 'Buy milk',
    notes: '',
    areaId: 'a1',
    important: true,
    estimateMinutes: 30,
    availableFrom: null,
    due: null,
  };
  const COMMITTED: CommittedText = { title: 'Buy milk', notes: '' };

  it('does not send a typed title that is not committed', () => {
    expect(buildSavePatch(MILK, { ...MILK, title: 'Buy oat milk' }, COMMITTED)).toEqual({});
    expect(savableDraft(MILK, { ...MILK, title: 'Buy oat milk' }, COMMITTED).title).toBe(
      'Buy milk',
    );
  });

  it('sends the committed title trimmed', () => {
    expect(buildSavePatch(MILK, MILK, { title: 'Buy oat milk ', notes: '' })).toEqual({
      title: 'Buy oat milk',
    });
  });

  it('never sends a blank committed title, but sends the rest', () => {
    const patch = buildSavePatch(MILK, { ...MILK, important: false }, { title: '   ', notes: '' });

    expect(patch).toEqual({ important: false });
    expect('title' in patch).toBe(false);
    expect(savableDraft(MILK, MILK, { title: '   ', notes: '' }).title).toBe('Buy milk');
  });

  it('does not send a cleared Estimate, but sends a changed one', () => {
    expect(buildSavePatch(MILK, { ...MILK, estimateMinutes: null }, COMMITTED)).toEqual({});
    expect(buildSavePatch(MILK, { ...MILK, estimateMinutes: 15 }, COMMITTED)).toEqual({
      estimateMinutes: 15,
    });
  });

  it('does not send a cleared Importance', () => {
    expect(buildSavePatch(MILK, { ...MILK, important: null }, COMMITTED)).toEqual({});
  });

  it('sends the first Importance and Estimate of an Inbox Task', () => {
    const inbox = { ...MILK, important: null, estimateMinutes: null };

    expect(
      buildSavePatch(inbox, { ...inbox, important: true, estimateMinutes: 15 }, COMMITTED),
    ).toEqual({
      important: true,
      estimateMinutes: 15,
    });
  });

  it('sends No Area as null', () => {
    expect(buildSavePatch(MILK, { ...MILK, areaId: '' }, COMMITTED)).toEqual({ areaId: null });
  });

  it('sends a changed Due, and nothing for a date equal by value', () => {
    expect(
      buildSavePatch(MILK, { ...MILK, due: { date: '2026-10-20', time: '17:00' } }, COMMITTED),
    ).toEqual({ due: { date: '2026-10-20', time: '17:00' } });

    const withFrom = { ...MILK, availableFrom: { date: '2026-10-06' } };

    expect(
      buildSavePatch(withFrom, { ...withFrom, availableFrom: { date: '2026-10-06' } }, COMMITTED),
    ).toEqual({});
  });

  it('sends committed Notes', () => {
    expect(buildSavePatch(MILK, MILK, { title: 'Buy milk', notes: 'Call first' })).toEqual({
      notes: 'Call first',
    });
  });

  it('is the patch of the savable draft', () => {
    const draft = { ...MILK, estimateMinutes: null, areaId: '' };
    const committed = { title: 'Milk', notes: 'x' };

    expect(buildSavePatch(MILK, draft, committed)).toEqual(
      buildTaskPatch(MILK, savableDraft(MILK, draft, committed)),
    );
  });
});
