// SPDX-License-Identifier: MIT

import type { Effect } from 'effect';
import type { HttpApiClient, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { expectTypeOf, test } from 'vitest';
import type { RegistrationResponse } from './schemas';
import type { SampleApi, SamplePasskeys } from './sample-api.fixture';

type Endpoints = HttpApiGroup.Endpoints<typeof SamplePasskeys>;

type PayloadOf<Id extends string> = HttpApiEndpoint.Payload<
  HttpApiEndpoint.WithIdentifier<Endpoints, Id>
>['Type'];

test('register payload carries challengeId and the registration response', () => {
  expectTypeOf<PayloadOf<'register'>['challengeId']>().toEqualTypeOf<string>();
  expectTypeOf<PayloadOf<'register'>['response']>().toEqualTypeOf<RegistrationResponse>();
});

test('registerOptions payload is the host payload fields', () => {
  expectTypeOf<PayloadOf<'registerOptions'>>().toEqualTypeOf<{ readonly token: string }>();
});

test('authenticate succeeds with the host success type', () => {
  type Client = HttpApiClient.ForApi<typeof SampleApi>;

  expectTypeOf<Effect.Success<ReturnType<Client['passkeys']['authenticate']>>>().toEqualTypeOf<{
    readonly name: string;
  }>();
});

test('the group has exactly the eight endpoint identifiers', () => {
  expectTypeOf<HttpApiEndpoint.Identifier<Endpoints>>().toEqualTypeOf<
    | 'registerOptions'
    | 'register'
    | 'authenticateOptions'
    | 'authenticate'
    | 'addOptions'
    | 'add'
    | 'list'
    | 'remove'
  >();
});
