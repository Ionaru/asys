// SPDX-License-Identifier: MPL-2.0

import { OpenApi } from 'effect/http-api';
import { describe, expect, it } from 'vitest';
import { Api } from './api';

interface SchemaNode {
  readonly $ref?: string;
  readonly required?: ReadonlyArray<string>;
}

interface Operation {
  readonly security?: ReadonlyArray<Record<string, ReadonlyArray<string>>>;
  readonly responses: Record<string, unknown>;
  readonly requestBody?: {
    readonly content: Record<string, { readonly schema: SchemaNode }>;
  };
}

interface Spec {
  readonly openapi: string;
  readonly info: { readonly title: string; readonly version: string };
  readonly paths: Record<string, Record<string, Operation>>;
  readonly components: {
    readonly schemas: Record<string, SchemaNode>;
    readonly securitySchemes: Record<string, unknown>;
  };
}

const spec = OpenApi.fromApi(Api) as unknown as Spec;

const operation = (path: string, method: string): Operation => {
  const op = spec.paths[path]?.[method];

  if (op === undefined) {
    throw new Error(`missing ${method} ${path}`);
  }

  return op;
};

const statuses = (path: string, method: string) =>
  Object.keys(operation(path, method).responses).sort();

const bodyRequired = (path: string, method: string): ReadonlyArray<string> => {
  const schema = operation(path, method).requestBody?.content['application/json']?.schema;

  if (schema === undefined) {
    throw new Error(`no body for ${method} ${path}`);
  }

  const resolved =
    schema.$ref === undefined
      ? schema
      : spec.components.schemas[schema.$ref.split('/').pop() ?? ''];

  if (resolved === undefined) {
    throw new Error(`unresolved ${schema.$ref}`);
  }

  return resolved.required ?? [];
};

describe('Api OpenAPI document', () => {
  it('declares OpenAPI 3.1.0 with the ASYS title and version 1', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBe('ASYS');
    expect(spec.info.version).toBe('1');
  });

  it('serves exactly the 16 contract paths', () => {
    expect(Object.keys(spec.paths).sort()).toEqual(
      [
        '/v1/commands',
        '/v1/snapshot',
        '/v1/changes',
        '/v1/meta',
        '/v1/auth/register/options',
        '/v1/auth/register',
        '/v1/auth/authenticate/options',
        '/v1/auth/authenticate',
        '/v1/auth/passkeys/options',
        '/v1/auth/passkeys',
        '/v1/auth/passkeys/{credentialId}',
        '/v1/auth/recover',
        '/v1/auth/signout',
        '/v1/auth/me',
        '/v1/auth/recovery-codes',
        '/health',
      ].sort(),
    );
  });

  it.each([
    ['post', '/v1/commands', ['200', '401', '409', '422']],
    ['get', '/v1/changes', ['200', '401', '410']],
    ['post', '/v1/auth/register/options', ['200', '410']],
    ['post', '/v1/auth/register', ['200', '400', '401', '409', '410']],
    ['post', '/v1/auth/authenticate', ['200', '400', '401', '404']],
    ['delete', '/v1/auth/passkeys/{credentialId}', ['204', '401', '404', '409']],
    ['post', '/v1/auth/recover', ['200', '401']],
    ['post', '/v1/auth/signout', ['204', '401']],
    ['get', '/health', ['200', '503']],
  ])('%s %s responds with the contract status set', (method, path, expected) => {
    expect(statuses(path, method)).toEqual(expected);
  });

  describe('security', () => {
    const sessionPaths = [
      '/v1/commands',
      '/v1/snapshot',
      '/v1/changes',
      '/v1/meta',
      '/v1/auth/passkeys/options',
      '/v1/auth/passkeys',
      '/v1/auth/passkeys/{credentialId}',
      '/v1/auth/signout',
      '/v1/auth/me',
      '/v1/auth/recovery-codes',
    ];

    const openPaths = [
      '/v1/auth/register/options',
      '/v1/auth/register',
      '/v1/auth/authenticate/options',
      '/v1/auth/authenticate',
      '/v1/auth/recover',
      '/health',
    ];

    it.each(sessionPaths)('every operation of %s requires the session cookie', (path) => {
      const methods = Object.keys(spec.paths[path] ?? {});

      expect(methods.length).toBeGreaterThan(0);

      for (const method of methods) {
        expect(operation(path, method).security).toEqual([{ session: [] }]);
      }
    });

    it.each(openPaths)('every operation of %s is unauthenticated', (path) => {
      const methods = Object.keys(spec.paths[path] ?? {});

      expect(methods.length).toBeGreaterThan(0);

      for (const method of methods) {
        expect(operation(path, method).security).toEqual([]);
      }
    });

    it('defines the session scheme as the host-prefixed cookie', () => {
      expect(spec.components.securitySchemes['session']).toEqual({
        type: 'apiKey',
        name: '__Host-asys_session',
        in: 'cookie',
      });
    });
  });

  describe('request bodies', () => {
    it('register requires token, timeZone, challengeId and response', () => {
      expect(bodyRequired('/v1/auth/register', 'post')).toEqual(
        expect.arrayContaining(['token', 'timeZone', 'challengeId', 'response']),
      );
    });

    it('register/options requires token and name', () => {
      expect(bodyRequired('/v1/auth/register/options', 'post')).toEqual(
        expect.arrayContaining(['token', 'name']),
      );
    });
  });
});
