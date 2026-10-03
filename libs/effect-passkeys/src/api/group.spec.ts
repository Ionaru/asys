// SPDX-License-Identifier: MIT

import { Schema } from 'effect';
import { HttpApi, OpenApi } from 'effect/http-api';
import { makePasskeyGroup } from './group';
import { describe, expect, it } from 'vitest';
import { SampleApi, SampleAuth, SampleGone } from './sample-api.fixture';

interface Operation {
  readonly security?: ReadonlyArray<Record<string, ReadonlyArray<string>>>;
  readonly responses: Record<string, unknown>;
  readonly requestBody?: {
    readonly content: Record<string, { readonly schema: SchemaNode }>;
  };
}

interface SchemaNode {
  readonly $ref?: string;
  readonly required?: ReadonlyArray<string>;
  readonly properties?: Record<string, { readonly type?: string }>;
}

interface Spec {
  readonly paths: Record<string, Record<string, Operation>>;
  readonly components: { readonly schemas: Record<string, SchemaNode> };
}

const toolsFor = (spec: Spec) => {
  const operation = (path: string, method: string): Operation => {
    const op = spec.paths[path]?.[method];

    if (op === undefined) {
      throw new Error(`missing ${method} ${path}`);
    }

    return op;
  };

  const statuses = (path: string, method: string) =>
    Object.keys(operation(path, method).responses).sort();

  const bodySchema = (path: string, method: string): SchemaNode => {
    const schema = operation(path, method).requestBody?.content['application/json']?.schema;

    if (schema === undefined) {
      throw new Error(`no body for ${method} ${path}`);
    }

    if (schema.$ref === undefined) {
      return schema;
    }

    const resolved = spec.components.schemas[schema.$ref.split('/').pop() ?? ''];

    if (resolved === undefined) {
      throw new Error(`unresolved ${schema.$ref}`);
    }

    return resolved;
  };

  return { operation, statuses, bodySchema };
};

const spec = OpenApi.fromApi(SampleApi) as unknown as Spec;

const { operation, statuses, bodySchema } = toolsFor(spec);

describe('makePasskeyGroup OpenAPI output', () => {
  it('serves exactly the contract paths and methods under the prefix', () => {
    const shape = Object.fromEntries(
      Object.entries(spec.paths).map(([path, ops]) => [path, Object.keys(ops).sort()]),
    );

    expect(shape).toEqual({
      '/v1/auth/register/options': ['post'],
      '/v1/auth/register': ['post'],
      '/v1/auth/authenticate/options': ['post'],
      '/v1/auth/authenticate': ['post'],
      '/v1/auth/passkeys/options': ['post'],
      '/v1/auth/passkeys': ['get', 'post'],
      '/v1/auth/passkeys/{credentialId}': ['delete'],
    });
  });

  it('documents the contract response statuses', () => {
    expect(statuses('/v1/auth/register/options', 'post')).toEqual(['200', '410']);
    expect(statuses('/v1/auth/register', 'post')).toEqual(['200', '400', '401', '409']);
    expect(statuses('/v1/auth/authenticate', 'post')).toEqual(['200', '400', '401', '404']);
    expect(statuses('/v1/auth/passkeys', 'post')).toEqual(['201', '400', '401', '409']);
    expect(statuses('/v1/auth/passkeys/{credentialId}', 'delete')).toEqual([
      '204',
      '401',
      '404',
      '409',
    ]);
  });

  it('protects only the four passkey management endpoints', () => {
    const protectedOps = [
      operation('/v1/auth/passkeys/options', 'post'),
      operation('/v1/auth/passkeys', 'post'),
      operation('/v1/auth/passkeys', 'get'),
      operation('/v1/auth/passkeys/{credentialId}', 'delete'),
    ];
    const publicOps = [
      operation('/v1/auth/register/options', 'post'),
      operation('/v1/auth/register', 'post'),
      operation('/v1/auth/authenticate/options', 'post'),
      operation('/v1/auth/authenticate', 'post'),
    ];

    for (const op of protectedOps) {
      expect(op.security).toEqual([{ session: [] }]);
    }

    for (const op of publicOps) {
      expect(op.security).toEqual([]);
    }
  });

  it('requires the host token in the registerOptions body', () => {
    expect(bodySchema('/v1/auth/register/options', 'post').required).toContain('token');
  });

  it('requires challengeId and response in the register body', () => {
    expect(bodySchema('/v1/auth/register', 'post').required).toEqual(
      expect.arrayContaining(['challengeId', 'response']),
    );
  });
});

describe('makePasskeyGroup without a prefix', () => {
  const OtherPasskeys = makePasskeyGroup('other', SampleAuth, {
    registerFinish: { challengeId: Schema.Number, token: Schema.String },
    registerFinishSuccess: Schema.Struct({ ok: Schema.Boolean }),
    registerFinishErrors: [SampleGone],
    authFinishSuccess: Schema.Struct({ name: Schema.String }),
    authFinishErrors: [SampleGone],
  });

  const otherSpec = OpenApi.fromApi(
    HttpApi.make('other-api').add(OtherPasskeys),
  ) as unknown as Spec;

  const other = toolsFor(otherSpec);

  it('serves the paths without a prefix', () => {
    expect(Object.keys(otherSpec.paths).sort()).toEqual(
      [
        '/register/options',
        '/register',
        '/authenticate/options',
        '/authenticate',
        '/passkeys/options',
        '/passkeys',
        '/passkeys/{credentialId}',
      ].sort(),
    );
  });

  it('documents the host errors of register and authenticate as 410', () => {
    expect(other.statuses('/register', 'post')).toContain('410');
    expect(other.statuses('/authenticate', 'post')).toContain('410');
  });

  it('keeps the library challengeId as a string over the host Schema.Number', () => {
    const body = other.bodySchema('/register', 'post');

    expect(body.properties?.['challengeId']?.type).toBe('string');
    expect(body.required).toEqual(expect.arrayContaining(['challengeId', 'response', 'token']));
  });
});
