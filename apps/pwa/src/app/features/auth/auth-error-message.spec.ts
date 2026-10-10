// SPDX-License-Identifier: EUPL-1.2
import { AuthError } from '../../core/api/auth-api';
import { GENERIC_MESSAGE } from '../../core/data/outcome-message';
import { messageForAuthError, type AuthErrorMessages } from './auth-error-message';

const OTHER_ERRORS = Object.values(AuthError).filter((error) => error !== AuthError.Unauthorized);

describe('messageForAuthError', () => {
  it('says nothing for Unauthorized', () => {
    expect(messageForAuthError(AuthError.Unauthorized)).toBeNull();
  });

  it('says nothing for Unauthorized even when messages are given', () => {
    const messages: AuthErrorMessages = { [AuthError.Network]: 'Offline.' };

    expect(messageForAuthError(AuthError.Unauthorized, messages)).toBeNull();
  });

  it('says nothing for Unauthorized when a caller forces an override past the types', () => {
    const forced = { [AuthError.Unauthorized]: 'Sign in again.' } as AuthErrorMessages;

    expect(messageForAuthError(AuthError.Unauthorized, forced)).toBeNull();
  });

  it.each(OTHER_ERRORS)('says GENERIC_MESSAGE for %s without messages', (error) => {
    expect(messageForAuthError(error)).toBe(GENERIC_MESSAGE);
  });

  it.each(OTHER_ERRORS)(
    'says GENERIC_MESSAGE for %s when only other errors have a message',
    (error) => {
      const others = OTHER_ERRORS.filter((other) => other !== error);
      const messages: AuthErrorMessages = Object.fromEntries(
        others.map((other) => [other, `Message for ${other}.`]),
      );

      expect(messageForAuthError(error, messages)).toBe(GENERIC_MESSAGE);
    },
  );

  it.each(OTHER_ERRORS)('says the given message for %s', (error) => {
    const messages: AuthErrorMessages = { [error]: `Message for ${error}.` };

    expect(messageForAuthError(error, messages)).toBe(`Message for ${error}.`);
  });

  it('keeps each message with its own error', () => {
    const messages: AuthErrorMessages = {
      [AuthError.ChallengeInvalid]: 'Try again.',
      [AuthError.LastPasskey]: 'You cannot remove your only passkey.',
    };

    expect(messageForAuthError(AuthError.ChallengeInvalid, messages)).toBe('Try again.');
    expect(messageForAuthError(AuthError.LastPasskey, messages)).toBe(
      'You cannot remove your only passkey.',
    );
    expect(messageForAuthError(AuthError.Network, messages)).toBe(GENERIC_MESSAGE);
  });
});
