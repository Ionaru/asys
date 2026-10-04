// SPDX-License-Identifier: EUPL-1.2
import {
  CommandTag,
  NotApplicableReason,
  TaskKind,
  TaskStatus,
  WORK_ACTIVE_HOURS,
  type Area,
  type DomainState,
  type ReviewItem,
  type Task,
} from '@asys/domain';

import { reviewCopy, type ReviewCopy } from './review-copy';

const KEY = '00000000-0000-4000-8000-000000000001';

const FALLBACK: ReviewCopy = { question: 'ASYS needs a decision.', reason: '', taskId: null };

const EXPECTATION_FAILED = 'It was closed or changed elsewhere first.';

const NOT_OPEN = 'It was already Done or Dropped.';

const task = (id: string, title: string): Task => ({
  id,
  title,
  kind: TaskKind.Task,
  status: TaskStatus.Open,
  notes: '',
  captureText: '',
  areaId: null,
  availableFrom: null,
  due: null,
  estimateMinutes: 30,
  important: true,
  voice: null,
  privacy: null,
  dueMoveCount: 0,
  version: 1,
  createdAt: 1,
  closedAt: null,
});

const area = (id: string, name: string): Area => ({
  id,
  name,
  activeHours: WORK_ACTIVE_HOURS,
  defaultPrivacy: null,
  version: 1,
});

const state = (tasks: readonly Task[], areas: readonly Area[] = []): DomainState => ({
  tasks,
  links: [],
  areas,
  reviewItems: [],
  settings: { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 },
});

const WITH_TASK = state([task('t1', 'Call Marit')], [area('a1', 'Work')]);

const EMPTY = state([]);

const item = (payload: unknown, kind = 'command_not_applicable'): ReviewItem => ({
  id: 'r1',
  kind,
  subjects: [],
  payload,
  dedupeKey: null,
  createdAt: 1,
  resolvedAt: null,
});

const payload = (command: Record<string, unknown>, reason = 'expectation_failed') => ({
  command: { ...command, idempotencyKey: KEY },
  reason,
});

describe('reviewCopy', () => {
  describe('for each command tag', () => {
    const cases: readonly [string, Record<string, unknown>, string, string][] = [
      [
        CommandTag.TriageTask,
        {
          _tag: CommandTag.TriageTask,
          taskId: 't1',
          important: true,
          estimateMinutes: 30,
          expect: { status: 'open' },
        },
        'Triaging “Call Marit” no longer applies.',
        'Triaging a Task no longer applies.',
      ],
      [
        CommandTag.EditTask,
        { _tag: CommandTag.EditTask, taskId: 't1', patch: { title: 'x' }, expect: { version: 1 } },
        'Editing “Call Marit” no longer applies.',
        'Editing a Task no longer applies.',
      ],
      [
        CommandTag.LogProgress,
        {
          _tag: CommandTag.LogProgress,
          taskId: 't1',
          remainingMinutes: 10,
          expect: { status: 'open' },
        },
        'Logging progress on “Call Marit” no longer applies.',
        'Logging progress on a Task no longer applies.',
      ],
      [
        CommandTag.CompleteTask,
        { _tag: CommandTag.CompleteTask, taskId: 't1', expect: { status: 'open' } },
        'Marking “Call Marit” Done no longer applies.',
        'Marking a Task Done no longer applies.',
      ],
      [
        CommandTag.DropTask,
        { _tag: CommandTag.DropTask, taskId: 't1', expect: { status: 'open' } },
        'Dropping “Call Marit” no longer applies.',
        'Dropping a Task no longer applies.',
      ],
    ];

    it.each(cases)(
      '%s names the Task when it is in the working set',
      (_tag, command, found, _missing) => {
        expect(reviewCopy(item(payload(command)), WITH_TASK)).toEqual({
          question: found,
          reason: EXPECTATION_FAILED,
          taskId: 't1',
        });
      },
    );

    it.each(cases)(
      '%s says a Task when it is not in the working set',
      (_tag, command, _f, missing) => {
        expect(reviewCopy(item(payload(command)), EMPTY)).toEqual({
          question: missing,
          reason: EXPECTATION_FAILED,
          taskId: null,
        });
      },
    );

    it('UpdateArea names the Area and has no taskId', () => {
      const command = {
        _tag: CommandTag.UpdateArea,
        areaId: 'a1',
        patch: { name: 'Job' },
        expect: { version: 1 },
      };

      expect(reviewCopy(item(payload(command, 'not_open')), WITH_TASK)).toEqual({
        question: 'Changing the Area “Work” no longer applies.',
        reason: NOT_OPEN,
        taskId: null,
      });
    });

    it('UpdateArea for a missing Area reads Changing an Area no longer applies.', () => {
      const command = { _tag: CommandTag.UpdateArea, areaId: 'gone', patch: {} };

      expect(reviewCopy(item(payload(command)), WITH_TASK)).toEqual({
        question: 'Changing an Area no longer applies.',
        reason: EXPECTATION_FAILED,
        taskId: null,
      });
    });

    it('UpdateArea never has a taskId, even if the id is also a Task id', () => {
      const command = { _tag: CommandTag.UpdateArea, areaId: 't1' };
      const copy = reviewCopy(item(payload(command)), state([task('t1', 'Call Marit')]));

      expect(copy.taskId).toBeNull();
      expect(copy.question).toBe('Changing an Area no longer applies.');
    });
  });

  describe('the reasons', () => {
    const command = { _tag: CommandTag.CompleteTask, taskId: 't1' };

    it('expectation_failed', () => {
      expect(
        reviewCopy(item(payload(command, NotApplicableReason.ExpectationFailed)), WITH_TASK).reason,
      ).toBe(EXPECTATION_FAILED);
    });

    it('not_open', () => {
      expect(
        reviewCopy(item(payload(command, NotApplicableReason.NotOpen)), WITH_TASK).reason,
      ).toBe(NOT_OPEN);
    });
  });

  describe('the fallback', () => {
    const command = { _tag: CommandTag.CompleteTask, taskId: 't1' };

    it.each<[string, ReviewItem]>([
      ['another kind', item(payload(command), 'other')],
      ['a null payload', item(null)],
      ['a string payload', item('nope')],
      ['a payload without a command', item({ reason: 'expectation_failed' })],
      ['a null command', item({ command: null, reason: 'expectation_failed' })],
      ['a string command', item({ command: 'x', reason: 'expectation_failed' })],
      ['an unknown tag', item(payload({ _tag: 'CaptureTask', taskId: 't1' }))],
      ['a command without a tag', item(payload({ taskId: 't1' }))],
      ['a tag whose id is not a string', item(payload({ _tag: CommandTag.DropTask, taskId: 5 }))],
      ['a tag without its id', item(payload({ _tag: CommandTag.DropTask }))],
      [
        'UpdateArea with only a taskId',
        item(payload({ _tag: CommandTag.UpdateArea, taskId: 't1' })),
      ],
      ['an unknown reason', item(payload(command, 'whatever'))],
      ['a missing reason', item({ command })],
    ])('says ASYS needs a decision for %s', (_name, review) => {
      expect(reviewCopy(review, WITH_TASK)).toEqual(FALLBACK);
    });
  });
});
