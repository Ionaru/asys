// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import {
  PasskeyAlreadyRegistered,
  PasskeyChallengeInvalid,
  PasskeyLastCredential,
  PasskeyUnknownCredential,
  PasskeyVerificationFailed,
} from './errors';

describe('passkey errors', () => {
  it('each error class carries its tag', () => {
    expect(new PasskeyChallengeInvalid()._tag).toBe('PasskeyChallengeInvalid');
    expect(new PasskeyVerificationFailed()._tag).toBe('PasskeyVerificationFailed');
    expect(new PasskeyUnknownCredential()._tag).toBe('PasskeyUnknownCredential');
    expect(new PasskeyAlreadyRegistered()._tag).toBe('PasskeyAlreadyRegistered');
    expect(new PasskeyLastCredential()._tag).toBe('PasskeyLastCredential');
  });
});
