// SPDX-License-Identifier: EUPL-1.2

// Smoke-tests the running deployment stack: the PWA, the headers, the API guards and the signup link.
// Usage: `node scripts/smoke-image.mts [--project <compose project>]` after
// `docker compose -f deploy/compose.yaml up -d --wait`. The default project is `asys`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';

const root = resolve(import.meta.dirname, '..');

const COMPOSE_FILE = resolve(root, 'deploy/compose.yaml');

const ENV_FILE = resolve(root, 'deploy/.env');

const PORT = 3000;

const IMMUTABLE = 'public, max-age=31536000, immutable';

const STATUS = {
  ok: 200,
  unauthorized: 401,
  notFound: 404,
} as const;

const { values } = parseArgs({ options: { project: { type: 'string', default: 'asys' } } });

const project = values.project;

let failed = false;

const report = (name: string, problem: string | undefined): void => {
  if (problem === undefined) {
    console.log(`ok ${name}`);
  } else {
    failed = true;
    console.log(`FAIL ${name}: ${problem}`);
  }
};

const docker = (args: readonly string[]): string =>
  execFileSync('docker', [...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const compose = (args: readonly string[]): string =>
  docker(['compose', '-f', COMPOSE_FILE, '-p', project, ...args]);

const baseUrl = (): string => {
  const id = compose(['ps', '-q', 'asys']).trim();
  if (id === '') throw new Error('the asys container is not running');
  const ip = docker([
    'inspect',
    '--format',
    '{{(index .NetworkSettings.Networks "edge").IPAddress}}',
    id,
  ]).trim();
  if (ip === '') throw new Error('the asys container has no address on the edge network');
  return `http://${ip}:${PORT}`;
};

const publicOrigin = (): string | undefined => {
  const fromFile = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, 'utf8')) : {};
  return fromFile['ASYS_PUBLIC_ORIGIN'] ?? process.env['ASYS_PUBLIC_ORIGIN'];
};

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const fetchPath = async (base: string, path: string, accept?: string): Promise<Response> =>
  fetch(`${base}${path}`, {
    headers: accept === undefined ? {} : { accept },
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });

// Runs one check and reports the thrown message as the failure reason.
const check = async (name: string, run: () => Promise<string | undefined>): Promise<void> => {
  try {
    report(name, await run());
  } catch (error) {
    report(name, error instanceof Error ? error.message : 'unknown error');
  }
};

const expectStatus = (response: Response, status: number): string | undefined =>
  response.status === status ? undefined : `expected ${status}, got ${response.status}`;

const checkIndex = async (base: string): Promise<string | undefined> => {
  const response = await fetchPath(base, '/', 'text/html');
  const wrongStatus = expectStatus(response, STATUS.ok);
  if (wrongStatus !== undefined) return wrongStatus;
  if (!(response.headers.get('content-type') ?? '').startsWith('text/html')) {
    return 'content-type is not text/html';
  }
  if (response.headers.get('cache-control') !== 'no-cache') return 'cache-control is not no-cache';
  if (response.headers.get('content-security-policy') === null)
    return 'content-security-policy is missing';
  if (response.headers.get('x-content-type-options') !== 'nosniff') {
    return 'x-content-type-options is not nosniff';
  }
  return undefined;
};

const checkManifest = async (base: string): Promise<string | undefined> => {
  const response = await fetchPath(base, '/manifest.webmanifest');
  const wrongStatus = expectStatus(response, STATUS.ok);
  if (wrongStatus !== undefined) return wrongStatus;
  return (response.headers.get('content-type') ?? '').startsWith('application/manifest+json')
    ? undefined
    : 'content-type is not application/manifest+json';
};

const checkHashedFiles = async (base: string): Promise<string | undefined> => {
  const ngsw = await fetchPath(base, '/ngsw.json');
  const wrongStatus = expectStatus(ngsw, STATUS.ok);
  if (wrongStatus !== undefined) return `ngsw.json: ${wrongStatus}`;
  const { hashTable } = (await ngsw.json()) as { hashTable: Record<string, string> };
  const paths = Object.keys(hashTable);
  if (paths.length === 0) return 'ngsw.json has an empty hashTable';
  const missing: string[] = [];
  let immutableChunk = false;
  for (const path of paths) {
    const response = await fetchPath(base, path);
    if (response.status !== STATUS.ok) {
      missing.push(`${path} (${response.status})`);
      continue;
    }
    if (path.startsWith('/chunk-') && response.headers.get('cache-control') === IMMUTABLE) {
      immutableChunk = true;
    }
  }
  if (missing.length > 0) return `not served: ${missing.join(', ')}`;
  return immutableChunk ? undefined : `no /chunk-* path answers cache-control: ${IMMUTABLE}`;
};

const checkStatus = (path: string, status: number) => async (base: string) =>
  expectStatus(await fetchPath(base, path), status);

// The link carries a secret token, so only the shape is checked and nothing is printed.
const checkSignupLink = (origin: string | undefined): string | undefined => {
  if (origin === undefined) return 'ASYS_PUBLIC_ORIGIN is not set';
  let output: string;
  try {
    output = compose(['exec', '-T', 'asys', 'node', '/app/main.js', 'signup-link']);
  } catch {
    return 'the signup-link command failed';
  }
  const firstLine = output.split('\n')[0] ?? '';
  return new RegExp(`^${escapeRegExp(origin)}/signup#token=[A-Za-z0-9_-]{43}$`).test(firstLine)
    ? undefined
    : 'the first line is not a signup link for ASYS_PUBLIC_ORIGIN';
};

let base: string | undefined;

try {
  base = baseUrl();
} catch (error) {
  report('container', error instanceof Error ? error.message : 'unknown error');
}

if (base !== undefined) {
  const url = base;
  await check('index', () => checkIndex(url));
  await check('health', () => checkStatus('/health', STATUS.ok)(url));
  await check('manifest', () => checkManifest(url));
  await check('hashed-files', () => checkHashedFiles(url));
  await check('api-requires-auth', () => checkStatus('/v1/meta', STATUS.unauthorized)(url));
  await check('api-unknown-path', () => checkStatus('/v1/nope', STATUS.notFound)(url));
  report('signup-link', checkSignupLink(publicOrigin()));
}

process.exit(failed ? 1 : 0);
