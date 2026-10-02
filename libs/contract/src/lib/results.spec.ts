// SPDX-License-Identifier: MPL-2.0

import { Schema } from 'effect';
import { CommandTag, NotApplicableReason } from '@asys/domain';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_NOT_APPLICABLE,
  CommandNotApplicablePayloadSchema,
  CommandResultSchema,
} from './results';

const reviewItemId = '00000000-0000-4000-8000-000000000009';

describe('CommandResultSchema', () => {
  const decode = Schema.decodeUnknownSync(CommandResultSchema);

  it('decodes Applied to itself', () => {
    expect(decode({ _tag: 'Applied', seq: 3 })).toStrictEqual({ _tag: 'Applied', seq: 3 });
  });

  it('decodes NotApplicable to itself', () => {
    const result = { _tag: 'NotApplicable', reason: 'expectation_failed', reviewItemId };

    expect(decode(result)).toStrictEqual(result);
  });

  it('rejects Rejected, which is an error rather than a result', () => {
    expect(() => decode({ _tag: 'Rejected', reason: 'cycle' })).toThrow(Schema.SchemaError);
  });
});

describe('COMMAND_NOT_APPLICABLE', () => {
  it('is the review item kind for a NotApplicable command', () => {
    expect(COMMAND_NOT_APPLICABLE).toBe('command_not_applicable');
  });
});

describe('CommandNotApplicablePayloadSchema', () => {
  it('decodes a command with the reason it was not applicable', () => {
    const payload = {
      command: {
        _tag: CommandTag.CompleteTask,
        idempotencyKey: '00000000-0000-4000-8000-000000000100',
        taskId: '00000000-0000-4000-8000-000000000001',
      },
      reason: NotApplicableReason.NotOpen,
    };

    expect(Schema.decodeUnknownSync(CommandNotApplicablePayloadSchema)(payload)).toStrictEqual(
      payload,
    );
  });
});
