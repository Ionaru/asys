// SPDX-License-Identifier: MIT

import { Context, Schema } from 'effect';
import { HttpApi, HttpApiError, HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api';
import { makePasskeyGroup } from './group';

export class SampleUser extends Context.Service<SampleUser, { readonly id: string }>()(
  'sample/SampleUser',
) {}

export class SampleAuth extends HttpApiMiddleware.Service<SampleAuth, { provides: SampleUser }>()(
  'sample/SampleAuth',
  {
    error: HttpApiError.Unauthorized,
    security: { session: HttpApiSecurity.apiKey({ key: 'sid', in: 'cookie' }) },
  },
) {}

export class SampleGone extends Schema.TaggedError<SampleGone>()(
  'SampleGone',
  {},
  { httpApiStatus: 410 },
) {}

export const SamplePasskeys = makePasskeyGroup('passkeys', SampleAuth, {
  prefix: '/v1/auth',
  registerBegin: { token: Schema.String },
  registerBeginErrors: [SampleGone],
  registerFinish: { token: Schema.String },
  registerFinishSuccess: Schema.Struct({ ok: Schema.Boolean }),
  authFinishSuccess: Schema.Struct({ name: Schema.String }),
});

export const SampleApi = HttpApi.make('sample').add(SamplePasskeys);
