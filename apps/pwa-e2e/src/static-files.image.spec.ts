// SPDX-License-Identifier: EUPL-1.2

// This spec runs only against the image (pwa-e2e:e2e-image), because the dev server serves no ngsw.json.
import { createHash } from 'node:crypto';
import { expect, test } from './support/fixtures.ts';

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const CHUNK_PREFIX = '/chunk-';

interface NgswManifest {
  readonly hashTable: Record<string, string>;
}

test('serves every file the service worker installs, unchanged', async ({ request }) => {
  const manifestResponse = await request.get('/ngsw.json');
  expect(manifestResponse.status(), 'GET /ngsw.json').toBe(200);
  const { hashTable } = (await manifestResponse.json()) as NgswManifest;
  const paths = Object.keys(hashTable);
  expect(paths.length, 'ngsw.json hashTable has entries').toBeGreaterThan(0);

  const failures: string[] = [];
  const chunkCacheControls: string[] = [];
  for (const path of paths) {
    const response = await request.get(path);
    if (response.status() !== 200) {
      failures.push(`${path}: ${response.status()}`);
      continue;
    }
    const sha1 = createHash('sha1')
      .update(await response.body())
      .digest('hex');
    if (sha1 !== hashTable[path]) failures.push(`${path}: hash differs`);
    if (path.startsWith(CHUNK_PREFIX))
      chunkCacheControls.push(response.headers()['cache-control'] ?? '');
  }
  expect(failures, 'files the service worker installs that are missing or changed').toEqual([]);

  expect(chunkCacheControls.length, 'ngsw.json lists at least one /chunk- file').toBeGreaterThan(0);
  expect(chunkCacheControls, 'a /chunk- file is served with the immutable cache-control').toContain(
    IMMUTABLE_CACHE_CONTROL,
  );
});

test('serves the app shell with its security headers', async ({ request }) => {
  const response = await request.get('/', { headers: { accept: 'text/html' } });
  expect(response.status(), 'GET /').toBe(200);
  const headers = response.headers();
  expect(headers['content-type'], 'content-type').toMatch(/^text\/html/);
  expect(headers['cache-control'], 'cache-control').toBe('no-cache');
  expect(headers['content-security-policy'], 'content-security-policy').toBeTruthy();
  expect(headers['x-content-type-options'], 'x-content-type-options').toBe('nosniff');
});
