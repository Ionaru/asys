// SPDX-License-Identifier: MPL-2.0

import { CommandTag, Privacy, TaskStatus, type Command } from '@asys/domain';
import { Schema } from 'effect';
import { ActiveHoursSchema } from './entities';
import { DateSpecSchema, TextSchema, UuidSchema } from './primitives';

/*
 * Numbers the domain validates itself are Finite here, so a fraction reaches the domain and gets its
 * specific Rejected reason instead of a decode error.
 */

export const ExpectationSchema = Schema.Struct({
  status: Schema.optionalKey(Schema.Enum(TaskStatus)),
  version: Schema.optionalKey(Schema.Int),
});

export const AreaExpectationSchema = Schema.Struct({
  version: Schema.optionalKey(Schema.Int),
});

export const TaskPatchSchema = Schema.Struct({
  title: Schema.optionalKey(TextSchema),
  notes: Schema.optionalKey(TextSchema),
  areaId: Schema.optionalKey(Schema.NullOr(UuidSchema)),
  availableFrom: Schema.optionalKey(Schema.NullOr(DateSpecSchema)),
  due: Schema.optionalKey(Schema.NullOr(DateSpecSchema)),
  estimateMinutes: Schema.optionalKey(Schema.NullOr(Schema.Finite)),
  important: Schema.optionalKey(Schema.NullOr(Schema.Boolean)),
});

export const AreaPatchSchema = Schema.Struct({
  name: Schema.optionalKey(TextSchema),
  activeHours: Schema.optionalKey(ActiveHoursSchema),
  defaultPrivacy: Schema.optionalKey(Schema.NullOr(Schema.Enum(Privacy))),
});

export const CommandSchema = Schema.TaggedUnion({
  [CommandTag.CaptureTask]: {
    idempotencyKey: UuidSchema,
    taskId: UuidSchema,
    title: TextSchema,
    captureText: TextSchema,
    areaId: Schema.optionalKey(Schema.NullOr(UuidSchema)),
  },
  [CommandTag.TriageTask]: {
    idempotencyKey: UuidSchema,
    taskId: UuidSchema,
    important: Schema.Boolean,
    estimateMinutes: Schema.Finite,
    areaId: Schema.optionalKey(Schema.NullOr(UuidSchema)),
    expect: Schema.optionalKey(ExpectationSchema),
  },
  [CommandTag.EditTask]: {
    idempotencyKey: UuidSchema,
    taskId: UuidSchema,
    patch: TaskPatchSchema,
    expect: Schema.optionalKey(ExpectationSchema),
  },
  [CommandTag.LogProgress]: {
    idempotencyKey: UuidSchema,
    taskId: UuidSchema,
    remainingMinutes: Schema.Finite,
    expect: Schema.optionalKey(ExpectationSchema),
  },
  [CommandTag.CompleteTask]: {
    idempotencyKey: UuidSchema,
    taskId: UuidSchema,
    expect: Schema.optionalKey(ExpectationSchema),
  },
  [CommandTag.DropTask]: {
    idempotencyKey: UuidSchema,
    taskId: UuidSchema,
    expect: Schema.optionalKey(ExpectationSchema),
  },
  [CommandTag.AddBlocker]: {
    idempotencyKey: UuidSchema,
    linkId: UuidSchema,
    taskId: UuidSchema,
    blockerId: UuidSchema,
  },
  [CommandTag.RemoveBlocker]: {
    idempotencyKey: UuidSchema,
    linkId: UuidSchema,
  },
  [CommandTag.CreateArea]: {
    idempotencyKey: UuidSchema,
    areaId: UuidSchema,
    name: TextSchema,
    activeHours: ActiveHoursSchema,
    defaultPrivacy: Schema.NullOr(Schema.Enum(Privacy)),
  },
  [CommandTag.UpdateArea]: {
    idempotencyKey: UuidSchema,
    areaId: UuidSchema,
    patch: AreaPatchSchema,
    expect: Schema.optionalKey(AreaExpectationSchema),
  },
  [CommandTag.SetTimeZone]: {
    idempotencyKey: UuidSchema,
    timeZone: TextSchema,
  },
  [CommandTag.SetUrgencyWindow]: {
    idempotencyKey: UuidSchema,
    days: Schema.Finite,
  },
  [CommandTag.ResolveReviewItem]: {
    idempotencyKey: UuidSchema,
    reviewItemId: UuidSchema,
  },
});

export type CommandRequest = typeof CommandSchema.Type;

/** Whether the PWA may queue the command while offline. */
export const commandMeta: { readonly [T in CommandTag]: { readonly offline: boolean } } = {
  [CommandTag.CaptureTask]: { offline: true },
  [CommandTag.TriageTask]: { offline: true },
  [CommandTag.EditTask]: { offline: true },
  [CommandTag.LogProgress]: { offline: true },
  [CommandTag.CompleteTask]: { offline: true },
  [CommandTag.DropTask]: { offline: true },
  [CommandTag.AddBlocker]: { offline: false },
  [CommandTag.RemoveBlocker]: { offline: false },
  [CommandTag.CreateArea]: { offline: false },
  [CommandTag.UpdateArea]: { offline: false },
  [CommandTag.SetTimeZone]: { offline: false },
  [CommandTag.SetUrgencyWindow]: { offline: false },
  [CommandTag.ResolveReviewItem]: { offline: false },
};

export const toDomainCommand = (request: CommandRequest): Command => {
  const { idempotencyKey: _idempotencyKey, ...command } = request;

  return command;
};
