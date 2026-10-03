// SPDX-License-Identifier: MPL-2.0

import {
  NotApplicableReason,
  Privacy,
  RejectedReason,
  TaskKind,
  TaskStatus,
  Voice,
} from '@asys/domain';
import { Schema } from 'effect';

/*
 * One schema instance per enum: OpenAPI component names come from the `identifier` annotation, and two
 * instances with the same identifier would be emitted as `TaskStatus` and `TaskStatus_1`.
 */

export const TaskKindSchema = Schema.Enum(TaskKind).annotate({ identifier: 'TaskKind' });

export const TaskStatusSchema = Schema.Enum(TaskStatus).annotate({ identifier: 'TaskStatus' });

export const VoiceSchema = Schema.Enum(Voice).annotate({ identifier: 'Voice' });

export const PrivacySchema = Schema.Enum(Privacy).annotate({ identifier: 'Privacy' });

export const NotApplicableReasonSchema = Schema.Enum(NotApplicableReason).annotate({
  identifier: 'NotApplicableReason',
});

export const RejectedReasonSchema = Schema.Enum(RejectedReason).annotate({
  identifier: 'RejectedReason',
});
