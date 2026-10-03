// SPDX-License-Identifier: EUPL-1.2
import { Api } from '@asys/contract';
import { Layer } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { AccountLive } from './account';
import { AuthLive } from './auth';
import { AuthenticationLive } from './authentication';
import { DataLive } from './data';
import { HealthLive } from './health';
import { PasskeysLive } from './passkeys';

/**
 * The ASYS API: the contract's `Api` with the five group handlers, the protected groups
 * provided with the cookie-session `AuthenticationLive`.
 */
export const apiLayer = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([
    DataLive.pipe(Layer.provide(AuthenticationLive)),
    PasskeysLive.pipe(Layer.provide(AuthenticationLive)),
    AuthLive,
    AccountLive.pipe(Layer.provide(AuthenticationLive)),
    HealthLive,
  ]),
);
