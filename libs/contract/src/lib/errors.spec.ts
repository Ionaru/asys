// SPDX-License-Identifier: MPL-2.0

import { RejectedReason } from '@asys/domain';
import { describe, expect, it } from 'vitest';
import {
  ChangesExpired,
  CommandRejected,
  IdempotencyKeyReused,
  SignInFailed,
  SignUpLinkInvalid,
} from './errors';

describe('errors', () => {
  it('CommandRejected carries its tag and reason', () => {
    const error = new CommandRejected({ reason: RejectedReason.Cycle });

    expect(error._tag).toBe('CommandRejected');
    expect(error.reason).toBe('cycle');
  });

  it('IdempotencyKeyReused carries its tag', () => {
    expect(new IdempotencyKeyReused()._tag).toBe('IdempotencyKeyReused');
  });

  it('ChangesExpired carries its tag and the sequence number', () => {
    const error = new ChangesExpired({ after: 4 });

    expect(error._tag).toBe('ChangesExpired');
    expect(error.after).toBe(4);
  });

  it('SignUpLinkInvalid carries its tag', () => {
    expect(new SignUpLinkInvalid()._tag).toBe('SignUpLinkInvalid');
  });

  it('SignInFailed carries its tag', () => {
    expect(new SignInFailed()._tag).toBe('SignInFailed');
  });
});
