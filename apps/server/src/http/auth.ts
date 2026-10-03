// SPDX-License-Identifier: EUPL-1.2
import { Api } from '@asys/contract';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { recover } from '../auth/sign-in';
import { setSessionCookie } from './cookies';

/** The `auth` group: recovery-code sign-in, which sets the session cookie. */
export const AuthLive = HttpApiBuilder.group(Api, 'auth', (handlers) =>
  handlers.handle('recover', ({ payload }) =>
    Effect.gen(function* () {
      const result = yield* recover(payload);
      yield* setSessionCookie(result.session.token);
      return { recoveryCodesLeft: result.recoveryCodesLeft };
    }),
  ),
);
