// SPDX-License-Identifier: MPL-2.0

import { IsoWeekday, Privacy, TaskKind, TaskStatus, Voice } from '@asys/domain';
import { Schema } from 'effect';
import { DateSpecSchema, InstantSchema, TextSchema, UuidSchema } from './primitives';

export const MinuteIntervalSchema = Schema.Tuple([Schema.Finite, Schema.Finite]);

/**
 * A Struct with the seven numeric weekday keys: Schema.Record over an Enum throws at module load.
 * The domain validates the intervals themselves.
 */
export const ActiveHoursSchema = Schema.Struct({
  [IsoWeekday.Monday]: Schema.Array(MinuteIntervalSchema),
  [IsoWeekday.Tuesday]: Schema.Array(MinuteIntervalSchema),
  [IsoWeekday.Wednesday]: Schema.Array(MinuteIntervalSchema),
  [IsoWeekday.Thursday]: Schema.Array(MinuteIntervalSchema),
  [IsoWeekday.Friday]: Schema.Array(MinuteIntervalSchema),
  [IsoWeekday.Saturday]: Schema.Array(MinuteIntervalSchema),
  [IsoWeekday.Sunday]: Schema.Array(MinuteIntervalSchema),
});

export const TaskSchema = Schema.Struct({
  id: UuidSchema,
  kind: Schema.Enum(TaskKind),
  status: Schema.Enum(TaskStatus),
  title: TextSchema,
  notes: TextSchema,
  captureText: TextSchema,
  areaId: Schema.NullOr(UuidSchema),
  availableFrom: Schema.NullOr(DateSpecSchema),
  due: Schema.NullOr(DateSpecSchema),
  estimateMinutes: Schema.NullOr(Schema.Int),
  important: Schema.NullOr(Schema.Boolean),
  voice: Schema.NullOr(Schema.Enum(Voice)),
  privacy: Schema.NullOr(Schema.Enum(Privacy)),
  dueMoveCount: Schema.Int,
  version: Schema.Int,
  createdAt: InstantSchema,
  closedAt: Schema.NullOr(InstantSchema),
});

export const BlockerLinkSchema = Schema.Struct({
  id: UuidSchema,
  taskId: UuidSchema,
  blockerId: UuidSchema,
});

export const AreaSchema = Schema.Struct({
  id: UuidSchema,
  name: TextSchema,
  activeHours: ActiveHoursSchema,
  defaultPrivacy: Schema.NullOr(Schema.Enum(Privacy)),
  version: Schema.Int,
});

/** The subject id is Text, not UUID, so later Review item kinds can reference other ids. */
export const ReviewSubjectSchema = Schema.Struct({
  type: TextSchema,
  id: TextSchema,
});

export const ReviewItemSchema = Schema.Struct({
  id: UuidSchema,
  kind: TextSchema,
  subjects: Schema.Array(ReviewSubjectSchema),
  payload: Schema.Unknown,
  dedupeKey: Schema.NullOr(TextSchema),
  createdAt: InstantSchema,
  resolvedAt: Schema.NullOr(InstantSchema),
});

export const SettingsSchema = Schema.Struct({
  timeZone: TextSchema,
  urgencyWindowDays: Schema.Int,
});
