// SPDX-License-Identifier: EUPL-1.2
import { Api, CurrentOwner } from '@asys/contract';
import { Effect } from 'effect';
import { HttpApiBuilder, HttpApiError } from 'effect/http-api';
import { me, regenerateRecoveryCodes, signOut } from '../auth/account';
import { expireSessionCookie } from './cookies';

/** The `account` group: sign-out (which expires the cookie), profile and recovery codes. */
export const AccountLive = HttpApiBuilder.group(Api, 'account', (handlers) =>
  handlers
    .handle('signOut', () =>
      Effect.gen(function* () {
        const owner = yield* CurrentOwner;
        yield* signOut(owner).pipe(Effect.orDie);
        yield* expireSessionCookie;
      }),
    )
    .handle('me', () =>
      Effect.gen(function* () {
        const { ownerId } = yield* CurrentOwner;
        return yield* me(ownerId).pipe(Effect.orDie);
      }),
    )
    .handle('regenerateRecoveryCodes', () =>
      Effect.gen(function* () {
        const owner = yield* CurrentOwner;
        const recoveryCodes = yield* regenerateRecoveryCodes(owner).pipe(
          Effect.catch((error): Effect.Effect<never, HttpApiError.Unauthorized> =>
            error instanceof HttpApiError.Unauthorized ? Effect.fail(error) : Effect.die(error),
          ),
        );
        return { recoveryCodes };
      }),
    ),
);
