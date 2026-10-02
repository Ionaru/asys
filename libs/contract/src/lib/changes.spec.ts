// SPDX-License-Identifier: MPL-2.0

import { Schema } from 'effect';
import {
  ChangeEntity,
  ChangeOp,
  Privacy,
  TaskKind,
  TaskStatus,
  WORK_ACTIVE_HOURS,
  type Area,
  type BlockerLink,
  type ReviewItem,
  type Settings,
  type Task,
} from '@asys/domain';
import { describe, expect, it } from 'vitest';
import {
  API_VERSION,
  ChangeEntrySchema,
  ChangesSchema,
  MetaSchema,
  SnapshotSchema,
  type ChangeEntry,
} from './changes';

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const json = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

const task: Task = {
  id: uuid(1),
  kind: TaskKind.Task,
  status: TaskStatus.Open,
  title: 'Title',
  notes: '',
  captureText: 'capture',
  areaId: null,
  availableFrom: null,
  due: { date: '2026-12-15' },
  estimateMinutes: 30,
  important: null,
  voice: null,
  privacy: null,
  dueMoveCount: 0,
  version: 1,
  createdAt: 1_000,
  closedAt: null,
};

const link: BlockerLink = { id: uuid(3), taskId: uuid(1), blockerId: uuid(4) };

const area: Area = {
  id: uuid(2),
  name: 'Work',
  activeHours: WORK_ACTIVE_HOURS,
  defaultPrivacy: Privacy.Private,
  version: 1,
};

const reviewItem: ReviewItem = {
  id: uuid(5),
  kind: 'command_not_applicable',
  subjects: [{ type: 'task', id: uuid(1) }],
  payload: { anything: ['goes', 1] },
  dedupeKey: null,
  createdAt: 2_000,
  resolvedAt: null,
};

const settings: Settings = { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 };

const entries: readonly (readonly [string, ChangeEntry])[] = [
  ['task put', { seq: 1, entity: ChangeEntity.Task, op: ChangeOp.Put, id: task.id, after: task }],
  [
    'blocker put',
    { seq: 1, entity: ChangeEntity.Blocker, op: ChangeOp.Put, id: link.id, after: link },
  ],
  ['blocker remove', { seq: 1, entity: ChangeEntity.Blocker, op: ChangeOp.Remove, id: link.id }],
  ['area put', { seq: 1, entity: ChangeEntity.Area, op: ChangeOp.Put, id: area.id, after: area }],
  [
    'review item put',
    {
      seq: 1,
      entity: ChangeEntity.ReviewItem,
      op: ChangeOp.Put,
      id: reviewItem.id,
      after: reviewItem,
    },
  ],
  ['settings put', { seq: 1, entity: ChangeEntity.Settings, op: ChangeOp.Put, after: settings }],
];

describe('ChangeEntrySchema', () => {
  const decode = Schema.decodeUnknownSync(ChangeEntrySchema);

  it.each(entries)('decodes a %s entry from JSON', (_name, entry) => {
    expect(decode(json(entry))).toStrictEqual(entry);
  });

  it('keeps the after of a blocker put', () => {
    const decoded = decode(json(entries[1][1]));

    expect(decoded).toHaveProperty('after', link);
  });

  it('rejects a task remove', () => {
    expect(() => decode({ seq: 1, entity: 'task', op: 'remove', id: task.id })).toThrow(
      Schema.SchemaError,
    );
  });

  it('strips an id from a settings entry', () => {
    const decoded = decode({ ...(json(entries[5][1]) as object), id: uuid(7) });

    expect('id' in decoded).toBe(false);
    expect(decoded).toStrictEqual(entries[5][1]);
  });

  it('rejects a fractional seq', () => {
    expect(() => decode({ ...(json(entries[0][1]) as object), seq: 1.5 })).toThrow(
      Schema.SchemaError,
    );
  });
});

describe('ChangesSchema', () => {
  it('decodes an empty change list', () => {
    expect(Schema.decodeUnknownSync(ChangesSchema)({ seq: 2, entries: [] })).toStrictEqual({
      seq: 2,
      entries: [],
    });
  });
});

describe('SnapshotSchema', () => {
  it('decodes a snapshot with one row of each kind', () => {
    const snapshot = {
      seq: 5,
      tasks: [task],
      blockers: [link],
      areas: [area],
      reviewItems: [reviewItem],
      settings,
    };

    expect(Schema.decodeUnknownSync(SnapshotSchema)(json(snapshot))).toStrictEqual(snapshot);
  });
});

describe('MetaSchema', () => {
  it('decodes the rules version, API version and settings', () => {
    const meta = { rulesVersion: 'v1', apiVersion: 1, settings };

    expect(Schema.decodeUnknownSync(MetaSchema)(meta)).toStrictEqual(meta);
  });
});

describe('API_VERSION', () => {
  it('is 1', () => {
    expect(API_VERSION).toBe(1);
  });
});
