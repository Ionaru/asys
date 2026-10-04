// SPDX-License-Identifier: EUPL-1.2
import { assert, describe, it } from '@effect/vitest';
import { isApiPath, requestPath } from './paths';

describe('requestPath', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['/inbox?x=1', '/inbox'],
    ['/a#b', '/a'],
    ['/', '/'],
    ['/v1?x=1', '/v1'],
    ['/ngsw.json?ngsw-cache-bust=0.1', '/ngsw.json'],
    ['/%2e%2e/x', '/%2e%2e/x'],
  ];

  for (const [url, path] of cases) {
    it(`reads ${url} as ${path}`, () => {
      assert.strictEqual(requestPath(url), path);
    });
  }
});

describe('isApiPath', () => {
  const api = [
    '/v1',
    '/v1/',
    '/v1/meta',
    '/v1/nope',
    '/V1/meta',
    '/V1',
    '//v1/meta',
    '/v1//meta',
    '/%761/meta',
    '/v%31/meta',
    '/v1/%6Deta',
  ];

  const other = ['/v1x', '/v10', '/V1X', '/', '/health', '/inbox', '/%E0%A4%A', '/v1%2Fmeta'];

  for (const path of api) {
    it(`treats ${path} as an API path`, () => {
      assert.isTrue(isApiPath(path));
    });
  }

  for (const path of other) {
    it(`does not treat ${path} as an API path`, () => {
      assert.isFalse(isApiPath(path));
    });
  }

  it('does not throw on a malformed escape', () => {
    assert.doesNotThrow(() => isApiPath('/%E0%A4%A'));
  });
});
