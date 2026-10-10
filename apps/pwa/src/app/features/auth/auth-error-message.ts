// SPDX-License-Identifier: EUPL-1.2
import { AuthError } from '../../core/api/auth-api';
import { GENERIC_MESSAGE } from '../../core/data/outcome-message';

/** What a screen says for particular errors instead of `GENERIC_MESSAGE`. */
export type AuthErrorMessages = Partial<Record<Exclude<AuthError, AuthError.Unauthorized>, string>>;

/**
 * The sentence a signed-in screen shows for a failed auth call; null when there is nothing to say.
 *
 * Unauthorized means the session ended and the redirect to sign in is coming, so it says nothing
 * and cannot be overridden. Any other error says its entry in `messages`, or `GENERIC_MESSAGE`.
 */
export const messageForAuthError = (
  error: AuthError,
  messages: AuthErrorMessages = {},
): string | null => {
  if (error === AuthError.Unauthorized) {
    return null;
  }

  return messages[error] ?? GENERIC_MESSAGE;
};
