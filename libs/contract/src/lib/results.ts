// SPDX-License-Identifier: MPL-2.0

import { NotApplicableReason, TransitionResultTag } from '@asys/domain';
import { Schema } from 'effect';
import { CommandSchema } from './commands';
import { UuidSchema } from './primitives';

export const CommandResultSchema = Schema.TaggedUnion({
  [TransitionResultTag.Applied]: { seq: Schema.Int },
  [TransitionResultTag.NotApplicable]: {
    reason: Schema.Enum(NotApplicableReason),
    reviewItemId: UuidSchema,
  },
});

export type CommandResult = typeof CommandResultSchema.Type;

/** The Review item kind the server creates for a NotApplicable command. */
export const COMMAND_NOT_APPLICABLE = 'command_not_applicable';

export const CommandNotApplicablePayloadSchema = Schema.Struct({
  command: CommandSchema,
  reason: Schema.Enum(NotApplicableReason),
});
