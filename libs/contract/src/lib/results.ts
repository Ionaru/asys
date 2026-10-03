// SPDX-License-Identifier: MPL-2.0

import { TransitionResultTag } from '@asys/domain';
import { Schema } from 'effect';
import { CommandSchema } from './commands';
import { NotApplicableReasonSchema } from './enums';
import { UuidSchema } from './primitives';

export const CommandResultSchema = Schema.Union([
  Schema.TaggedStruct(TransitionResultTag.Applied, { seq: Schema.Int }).annotate({
    identifier: 'AppliedResult',
  }),
  Schema.TaggedStruct(TransitionResultTag.NotApplicable, {
    reason: NotApplicableReasonSchema,
    reviewItemId: UuidSchema,
  }).annotate({ identifier: 'NotApplicableResult' }),
])
  .annotate({ identifier: 'CommandResult' })
  .pipe(Schema.toTaggedUnion('_tag'));

export type CommandResult = typeof CommandResultSchema.Type;

/** The Review item kind the server creates for a NotApplicable command. */
export const COMMAND_NOT_APPLICABLE = 'command_not_applicable';

export const CommandNotApplicablePayloadSchema = Schema.Struct({
  command: CommandSchema,
  reason: NotApplicableReasonSchema,
});
