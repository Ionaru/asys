// SPDX-License-Identifier: MPL-2.0

import { Schema } from 'effect';
import {
  PERSONAL_ACTIVE_HOURS,
  Privacy,
  TaskKind,
  TaskStatus,
  Voice,
  WORK_ACTIVE_HOURS,
  type Task,
} from '@asys/domain';
import { describe, expect, it } from 'vitest';
import { ActiveHoursSchema, TaskSchema } from './entities';

const id = '00000000-0000-4000-8000-000000000001';

const areaId = '00000000-0000-4000-8000-000000000002';

const json = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

const fullTask: Task = {
  id,
  kind: TaskKind.Task,
  status: TaskStatus.Open,
  title: 'Write report',
  notes: 'Some notes',
  captureText: 'write report',
  areaId,
  availableFrom: { date: '2026-12-14' },
  due: { date: '2026-12-15', time: '10:00' },
  estimateMinutes: 30,
  important: true,
  voice: Voice.OutLoud,
  privacy: Privacy.Hidden,
  dueMoveCount: 0,
  version: 1,
  createdAt: 500_000,
  closedAt: 1_000_000,
};

const nullTask: Task = {
  ...fullTask,
  areaId: null,
  availableFrom: null,
  due: null,
  estimateMinutes: null,
  important: null,
  voice: null,
  privacy: null,
  closedAt: null,
};

describe('TaskSchema', () => {
  const decode = Schema.decodeUnknownSync(TaskSchema);

  it('decodes a full Task to a deep-equal copy', () => {
    expect(decode(json(fullTask))).toStrictEqual(fullTask);
  });

  it('keeps an absent time on a date spec absent', () => {
    expect(decode(json(fullTask)).availableFrom).toStrictEqual({ date: '2026-12-14' });
  });

  it('decodes a Task whose nullable fields are all null', () => {
    expect(decode(json(nullTask))).toStrictEqual(nullTask);
  });

  it('strips an extra key', () => {
    const decoded = decode({ ...(json(fullTask) as object), extra: 1 });

    expect('extra' in decoded).toBe(false);
    expect(decoded).toStrictEqual(fullTask);
  });

  it.each([
    ['a date that does not exist', { due: { date: '2026-02-30' } }],
    ['the time 24:00', { due: { date: '2026-12-15', time: '24:00' } }],
    ['a time with seconds', { due: { date: '2026-12-15', time: '10:00:00' } }],
    ['a NUL in the title', { title: 'a\u0000b' }],
    ['a lone high surrogate in the title', { title: 'a\uD800b' }],
    ['a lone low surrogate in the notes', { notes: '\uDC00' }],
    ['an id that is not a UUID', { id: 'x' }],
    ['an uppercase id', { id: '00000000-0000-4000-8000-00000000000A' }],
  ])('rejects %s', (_name, change) => {
    expect(() => decode({ ...(json(fullTask) as object), ...change })).toThrow(Schema.SchemaError);
  });
});

describe('ActiveHoursSchema', () => {
  const decode = Schema.decodeUnknownSync(ActiveHoursSchema);

  it.each([
    ['WORK_ACTIVE_HOURS', WORK_ACTIVE_HOURS],
    ['PERSONAL_ACTIVE_HOURS', PERSONAL_ACTIVE_HOURS],
  ])('decodes %s to itself', (_name, hours) => {
    expect(decode(json(hours))).toStrictEqual(hours);
  });

  it('rejects a value missing weekday 7', () => {
    const { 7: _sunday, ...rest } = json(WORK_ACTIVE_HOURS) as Record<number, unknown>;

    expect(() => decode(rest)).toThrow(Schema.SchemaError);
  });

  it('rejects a three-element interval', () => {
    expect(() =>
      decode({ ...(json(WORK_ACTIVE_HOURS) as object), 1: [[480, 1080, 1200]] }),
    ).toThrow(Schema.SchemaError);
  });
});
