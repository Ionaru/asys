// SPDX-License-Identifier: MPL-2.0

import { Schema } from 'effect';
import { CommandTag, Privacy, TaskStatus, WORK_ACTIVE_HOURS } from '@asys/domain';
import { describe, expect, it } from 'vitest';
import { CommandSchema, commandMeta, toDomainCommand, type CommandRequest } from './commands';

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const json = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

const key = uuid(100);

const requests: readonly CommandRequest[] = [
  {
    _tag: CommandTag.CaptureTask,
    idempotencyKey: key,
    taskId: uuid(1),
    title: 'Title',
    captureText: 'capture',
    areaId: null,
  },
  {
    _tag: CommandTag.TriageTask,
    idempotencyKey: key,
    taskId: uuid(1),
    important: true,
    estimateMinutes: 30,
    areaId: uuid(2),
    expect: { status: TaskStatus.Open, version: 1 },
  },
  {
    _tag: CommandTag.EditTask,
    idempotencyKey: key,
    taskId: uuid(1),
    patch: {
      title: 'New',
      notes: 'n',
      areaId: null,
      availableFrom: { date: '2026-12-14' },
      due: { date: '2026-12-15', time: '10:00' },
      estimateMinutes: null,
      important: false,
    },
    expect: { version: 3 },
  },
  {
    _tag: CommandTag.LogProgress,
    idempotencyKey: key,
    taskId: uuid(1),
    remainingMinutes: 10,
    expect: { status: TaskStatus.Open },
  },
  { _tag: CommandTag.CompleteTask, idempotencyKey: key, taskId: uuid(1), expect: { version: 1 } },
  { _tag: CommandTag.DropTask, idempotencyKey: key, taskId: uuid(1) },
  {
    _tag: CommandTag.AddBlocker,
    idempotencyKey: key,
    linkId: uuid(3),
    taskId: uuid(1),
    blockerId: uuid(4),
  },
  { _tag: CommandTag.RemoveBlocker, idempotencyKey: key, linkId: uuid(3) },
  {
    _tag: CommandTag.CreateArea,
    idempotencyKey: key,
    areaId: uuid(2),
    name: 'Work',
    activeHours: WORK_ACTIVE_HOURS,
    defaultPrivacy: Privacy.Private,
  },
  {
    _tag: CommandTag.UpdateArea,
    idempotencyKey: key,
    areaId: uuid(2),
    patch: { name: 'Renamed', activeHours: WORK_ACTIVE_HOURS, defaultPrivacy: null },
    expect: { version: 2 },
  },
  { _tag: CommandTag.SetTimeZone, idempotencyKey: key, timeZone: 'Europe/Amsterdam' },
  { _tag: CommandTag.SetUrgencyWindow, idempotencyKey: key, days: 3 },
  { _tag: CommandTag.ResolveReviewItem, idempotencyKey: key, reviewItemId: uuid(5) },
];

const capture = requests[0];

const complete = requests[4];

describe('CommandSchema', () => {
  const decode = Schema.decodeUnknownSync(CommandSchema);

  it('covers all 13 commands in the fixtures', () => {
    expect(requests.map((r) => r._tag).sort()).toStrictEqual(Object.values(CommandTag).sort());
  });

  it.each(requests.map((r) => [r._tag, r] as const))('decodes %s from JSON', (_tag, request) => {
    expect(decode(json(request))).toStrictEqual(request);
  });

  it('decodes a CaptureTask without the optional areaId', () => {
    const request = {
      _tag: CommandTag.CaptureTask,
      idempotencyKey: key,
      taskId: uuid(1),
      title: 'Title',
      captureText: 'capture',
    };

    expect(decode(json(request))).toStrictEqual(request);
  });

  it('decodes a fractional estimate so the domain can reject it later', () => {
    const request = { ...requests[1], estimateMinutes: 2.5 };

    expect(decode(json(request))).toStrictEqual(request);
  });

  it('rejects a CaptureTask without an idempotency key', () => {
    const { idempotencyKey: _key, ...request } = capture;

    expect(() => decode(json(request))).toThrow(Schema.SchemaError);
  });

  it('rejects an uppercase idempotency key', () => {
    expect(() =>
      decode({ ...capture, idempotencyKey: '00000000-0000-4000-8000-00000000000A' }),
    ).toThrow(Schema.SchemaError);
  });

  it('rejects an uppercase task id', () => {
    expect(() => decode({ ...complete, taskId: '00000000-0000-4000-8000-00000000000A' })).toThrow(
      /\S/,
    );
  });

  it('rejects an unknown tag', () => {
    expect(() => decode({ ...complete, _tag: 'ArchiveTask' })).toThrow(Schema.SchemaError);
  });

  it('rejects an explicit undefined for an optional key', () => {
    expect(() => decode({ ...capture, areaId: undefined })).toThrow(Schema.SchemaError);
  });
});

describe('commandMeta', () => {
  const offline = [
    CommandTag.CaptureTask,
    CommandTag.TriageTask,
    CommandTag.EditTask,
    CommandTag.LogProgress,
    CommandTag.CompleteTask,
    CommandTag.DropTask,
  ];

  it('has exactly the 13 command tags as keys', () => {
    expect(Object.keys(commandMeta).sort()).toStrictEqual(Object.values(CommandTag).sort());
  });

  it.each(Object.values(CommandTag).map((tag) => [tag, offline.includes(tag)] as const))(
    'marks %s as offline: %s',
    (tag, expected) => {
      expect(commandMeta[tag].offline).toBe(expected);
    },
  );
});

describe('toDomainCommand', () => {
  it.each(requests.map((r) => [r._tag, r] as const))(
    'drops the idempotency key of %s and keeps the rest',
    (_tag, request) => {
      const { idempotencyKey: _key, ...rest } = request;

      const result = toDomainCommand(request);

      expect('idempotencyKey' in result).toBe(false);
      expect(result).toStrictEqual(rest);
    },
  );

  it('does not mutate the request', () => {
    const request = { ...capture };

    toDomainCommand(request);

    expect(request).toStrictEqual(capture);
    expect(request.idempotencyKey).toBe(key);
  });
});

const withField = (request: CommandRequest, path: string, value: unknown): unknown => {
  const copy = json(request) as Record<string, unknown>;
  const keys = path.split('.');
  const last = keys.pop() as string;
  const parent = keys.reduce((node, k) => node[k] as Record<string, unknown>, copy);

  parent[last] = value;

  return copy;
};

const at = (index: number): CommandRequest => requests[index] as CommandRequest;

const uuidFields: readonly (readonly [string, CommandRequest, string])[] = [
  ['CaptureTask.idempotencyKey', at(0), 'idempotencyKey'],
  ['CaptureTask.taskId', at(0), 'taskId'],
  ['CaptureTask.areaId', at(0), 'areaId'],
  ['TriageTask.taskId', at(1), 'taskId'],
  ['TriageTask.areaId', at(1), 'areaId'],
  ['EditTask.taskId', at(2), 'taskId'],
  ['EditTask.patch.areaId', at(2), 'patch.areaId'],
  ['LogProgress.taskId', at(3), 'taskId'],
  ['CompleteTask.taskId', at(4), 'taskId'],
  ['DropTask.taskId', at(5), 'taskId'],
  ['AddBlocker.linkId', at(6), 'linkId'],
  ['AddBlocker.taskId', at(6), 'taskId'],
  ['AddBlocker.blockerId', at(6), 'blockerId'],
  ['RemoveBlocker.linkId', at(7), 'linkId'],
  ['CreateArea.areaId', at(8), 'areaId'],
  ['UpdateArea.areaId', at(9), 'areaId'],
  ['ResolveReviewItem.reviewItemId', at(12), 'reviewItemId'],
];

const textFields: readonly (readonly [string, CommandRequest, string])[] = [
  ['CaptureTask.title', at(0), 'title'],
  ['CaptureTask.captureText', at(0), 'captureText'],
  ['EditTask.patch.title', at(2), 'patch.title'],
  ['EditTask.patch.notes', at(2), 'patch.notes'],
  ['CreateArea.name', at(8), 'name'],
  ['UpdateArea.patch.name', at(9), 'patch.name'],
  ['SetTimeZone.timeZone', at(10), 'timeZone'],
];

describe('CommandSchema field validation', () => {
  const decode = Schema.decodeUnknownSync(CommandSchema);

  it.each(
    uuidFields.flatMap(([name, request, path]) => [
      [`${name} uppercase`, request, path, '00000000-0000-4000-8000-00000000000A'] as const,
      [`${name} not a UUID`, request, path, 'x'] as const,
    ]),
  )('rejects %s', (_name, request, path, value) => {
    expect(() => decode(withField(request, path, value))).toThrow(Schema.SchemaError);
  });

  it.each(
    textFields.flatMap(([name, request, path]) => [
      [`${name} with NUL`, request, path, 'a\u0000b'] as const,
      [`${name} with a lone surrogate`, request, path, 'a\uD800b'] as const,
    ]),
  )('rejects %s', (_name, request, path, value) => {
    expect(() => decode(withField(request, path, value))).toThrow(Schema.SchemaError);
  });
});
