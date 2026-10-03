// SPDX-License-Identifier: MPL-2.0

import { makePasskeyGroup } from '@ionaru/effect-passkeys/api';
import { Schema } from 'effect';
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from 'effect/http-api';

import {
  Authentication,
  HealthSchema,
  MeSchema,
  NameSchema,
  RecoverResultSchema,
  RecoveryCodeInputSchema,
  RecoveryCodesSchema,
  SignUpTokenSchema,
  TimeZoneSchema,
} from './auth';
import { API_VERSION, ChangesSchema, MetaSchema, SnapshotSchema } from './changes';
import { CommandSchema } from './commands';
import {
  ChangesExpired,
  CommandRejected,
  IdempotencyKeyReused,
  SignInFailed,
  SignUpLinkInvalid,
} from './errors';
import { CommandResultSchema } from './results';

/** The Owner's data: commands, snapshot, changes and meta. */
export const DataGroup = HttpApiGroup.make('data')
  .add(
    HttpApiEndpoint.post('runCommand', '/commands', {
      payload: CommandSchema,
      success: CommandResultSchema,
      error: [CommandRejected, IdempotencyKeyReused],
    }),
    HttpApiEndpoint.get('snapshot', '/snapshot', { success: SnapshotSchema }),
    HttpApiEndpoint.get('changes', '/changes', {
      query: { after: Schema.Int },
      success: ChangesSchema,
      error: ChangesExpired,
    }),
    HttpApiEndpoint.get('meta', '/meta', { success: MetaSchema }),
  )
  .prefix('/v1')
  .middleware(Authentication);

/** Passkey sign-up, sign-in and management, built by the passkey library. */
export const PasskeysGroup = makePasskeyGroup('passkeys', Authentication, {
  prefix: '/v1/auth',
  registerBegin: { token: SignUpTokenSchema, name: NameSchema },
  registerBeginErrors: [SignUpLinkInvalid],
  registerFinish: { token: SignUpTokenSchema, timeZone: TimeZoneSchema },
  registerFinishSuccess: RecoveryCodesSchema,
  registerFinishErrors: [SignUpLinkInvalid],
  authFinishSuccess: MeSchema,
});

/** Sign-in with a recovery code (no session yet). */
export const AuthGroup = HttpApiGroup.make('auth')
  .add(
    HttpApiEndpoint.post('recover', '/recover', {
      payload: Schema.Struct({ code: RecoveryCodeInputSchema }),
      success: RecoverResultSchema,
      error: SignInFailed,
    }),
  )
  .prefix('/v1/auth');

/** The signed-in Owner's account: sign-out, profile and recovery codes. */
export const AccountGroup = HttpApiGroup.make('account')
  .add(
    HttpApiEndpoint.post('signOut', '/signout'),
    HttpApiEndpoint.get('me', '/me', { success: MeSchema }),
    HttpApiEndpoint.post('regenerateRecoveryCodes', '/recovery-codes', {
      success: RecoveryCodesSchema,
    }),
  )
  .prefix('/v1/auth')
  .middleware(Authentication);

/** The unauthenticated health probe. */
export const HealthGroup = HttpApiGroup.make('health').add(
  HttpApiEndpoint.get('health', '/health', {
    success: HealthSchema,
    error: HttpApiError.ServiceUnavailable,
  }),
);

/** The ASYS HTTP API: the single source of the OpenAPI document and the server's handlers. */
export const Api = HttpApi.make('asys')
  .add(DataGroup, PasskeysGroup, AuthGroup, AccountGroup, HealthGroup)
  .annotateMerge(OpenApi.annotations({ title: 'ASYS', version: String(API_VERSION) }));
