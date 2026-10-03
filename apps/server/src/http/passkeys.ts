// SPDX-License-Identifier: EUPL-1.2
import { Api, CurrentOwner, PasskeysGroup } from '@asys/contract';
import { makePasskeyHandlers } from '@ionaru/effect-passkeys/server';
import { Effect } from 'effect';
import { revokeOtherSessions } from '../auth/account';
import { signIn } from '../auth/sign-in';
import { signUp, signUpBegin } from '../auth/sign-up';
import { setSessionCookie } from './cookies';

/**
 * The `passkeys` group over the passkey library: sign-up and sign-in set the session cookie,
 * and removing a passkey ends the Owner's other sessions. Database failures are defects.
 */
export const PasskeysLive = makePasskeyHandlers(Api, PasskeysGroup, {
  hooks: {
    onRegisterBegin: signUpBegin,
    onRegistered: (registration, payload) =>
      Effect.gen(function* () {
        const { recoveryCodes, session } = yield* signUp(registration, payload);
        yield* setSessionCookie(session.token);
        return { recoveryCodes };
      }),
    onAuthenticated: (passkey) =>
      Effect.gen(function* () {
        const { me, session } = yield* signIn(passkey).pipe(Effect.orDie);
        yield* setSessionCookie(session.token);
        return me;
      }),
    onRemoved: revokeOtherSessions,
  },
  currentUserId: CurrentOwner.useSync((owner) => owner.ownerId),
});
