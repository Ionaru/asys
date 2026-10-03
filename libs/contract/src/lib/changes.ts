// SPDX-License-Identifier: MPL-2.0

import { ChangeEntity, ChangeOp } from '@asys/domain';
import { Schema } from 'effect';
import {
  AreaSchema,
  BlockerLinkSchema,
  ReviewItemSchema,
  SettingsSchema,
  TaskSchema,
} from './entities';
import { TextSchema, UuidSchema } from './primitives';

/** The domain `Change` union, each entry with its change-log seq. */
export const ChangeEntrySchema = Schema.Union([
  Schema.Struct({
    seq: Schema.Int,
    entity: Schema.Literal(ChangeEntity.Task),
    op: Schema.Literal(ChangeOp.Put),
    id: UuidSchema,
    after: TaskSchema,
  }).annotate({ identifier: 'TaskPutEntry' }),
  Schema.Struct({
    seq: Schema.Int,
    entity: Schema.Literal(ChangeEntity.Blocker),
    op: Schema.Literal(ChangeOp.Put),
    id: UuidSchema,
    after: BlockerLinkSchema,
  }).annotate({ identifier: 'BlockerPutEntry' }),
  Schema.Struct({
    seq: Schema.Int,
    entity: Schema.Literal(ChangeEntity.Blocker),
    op: Schema.Literal(ChangeOp.Remove),
    id: UuidSchema,
  }).annotate({ identifier: 'BlockerRemoveEntry' }),
  Schema.Struct({
    seq: Schema.Int,
    entity: Schema.Literal(ChangeEntity.Area),
    op: Schema.Literal(ChangeOp.Put),
    id: UuidSchema,
    after: AreaSchema,
  }).annotate({ identifier: 'AreaPutEntry' }),
  Schema.Struct({
    seq: Schema.Int,
    entity: Schema.Literal(ChangeEntity.ReviewItem),
    op: Schema.Literal(ChangeOp.Put),
    id: UuidSchema,
    after: ReviewItemSchema,
  }).annotate({ identifier: 'ReviewItemPutEntry' }),
  Schema.Struct({
    seq: Schema.Int,
    entity: Schema.Literal(ChangeEntity.Settings),
    op: Schema.Literal(ChangeOp.Put),
    after: SettingsSchema,
  }).annotate({ identifier: 'SettingsPutEntry' }),
]).annotate({ identifier: 'ChangeEntry' });

export type ChangeEntry = typeof ChangeEntrySchema.Type;

export const ChangesSchema = Schema.Struct({
  seq: Schema.Int,
  entries: Schema.Array(ChangeEntrySchema),
}).annotate({ identifier: 'Changes' });

export type Changes = typeof ChangesSchema.Type;

export const SnapshotSchema = Schema.Struct({
  seq: Schema.Int,
  tasks: Schema.Array(TaskSchema),
  blockers: Schema.Array(BlockerLinkSchema),
  areas: Schema.Array(AreaSchema),
  reviewItems: Schema.Array(ReviewItemSchema),
  settings: SettingsSchema,
}).annotate({ identifier: 'Snapshot' });

export type Snapshot = typeof SnapshotSchema.Type;

export const API_VERSION = 1;

export const MetaSchema = Schema.Struct({
  rulesVersion: TextSchema,
  apiVersion: Schema.Int,
  settings: SettingsSchema,
}).annotate({ identifier: 'Meta' });

export type Meta = typeof MetaSchema.Type;
