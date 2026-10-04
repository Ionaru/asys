// SPDX-License-Identifier: EUPL-1.2

// The two e2e stacks. The dev stack: API on 3100, dev server on 4300, database asys_e2e. The image stack: the
// production image from deploy/compose.e2e.yaml, published on 3200, in the compose project asys-e2e. Loaded by Node
// type stripping (scripts/*.mts), Playwright's loader and tsc alike, so: only node: builtins, no enums, no
// import.meta, nothing read at import.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';

export const E2E_API_PORT = 3100;

export const E2E_PWA_PORT = 4300;

export const E2E_ORIGIN = `http://localhost:${E2E_PWA_PORT}`;

export const E2E_DATABASE = 'asys_e2e';

export const E2E_IMAGE_PORT = 3200;

export const E2E_IMAGE_ORIGIN = `http://localhost:${E2E_IMAGE_PORT}`;

export const E2E_IMAGE_PROJECT = 'asys-e2e';

export const E2E_IMAGE_COMPOSE_FILES = ['deploy/compose.yaml', 'deploy/compose.e2e.yaml'] as const;

export const Stack = { Dev: 'dev', Image: 'image' } as const;

export type StackName = (typeof Stack)[keyof typeof Stack];

export interface E2eEnv {
  readonly PORT: string;
  readonly ASYS_PUBLIC_ORIGIN: string;
  readonly ASYS_RP_ID: string;
  readonly DATABASE_URL_APP: string;
  readonly DATABASE_URL_OWNER: string;
}

/** Walks up from `dir` (pass `import.meta.dirname` or `__dirname`) to the directory holding pnpm-workspace.yaml. */
export const workspaceRootFrom = (dir: string): string => {
  let current = resolve(dir);
  while (!existsSync(resolve(current, 'pnpm-workspace.yaml'))) {
    const parent = dirname(current);
    if (parent === current) throw new Error('The workspace root was not found');
    current = parent;
  }
  return current;
};

const withDatabase = (url: string, database: string): string => {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
};

/** Reads `<root>/.env`, falling back to process.env per key. Errors name the key only, never a value. */
export const loadE2eEnv = (root: string): { env: E2eEnv; postgresUrl: string } => {
  let file: Record<string, string | undefined> = {};
  const path = resolve(root, '.env');
  if (existsSync(path)) file = parseEnv(readFileSync(path, 'utf8'));
  const required = (key: string): string => {
    const value = file[key] ?? process.env[key];
    if (!value) throw new Error(`${key} is not set (see .env)`);
    return value;
  };
  const owner = new URL(required('DATABASE_URL_OWNER'));
  const postgres = new URL(`postgresql://${owner.host}/postgres`);
  postgres.username = 'postgres';
  postgres.password = required('POSTGRES_PASSWORD');
  return {
    env: {
      PORT: String(E2E_API_PORT),
      ASYS_PUBLIC_ORIGIN: E2E_ORIGIN,
      ASYS_RP_ID: 'localhost',
      DATABASE_URL_APP: withDatabase(required('DATABASE_URL_APP'), E2E_DATABASE),
      DATABASE_URL_OWNER: withDatabase(owner.toString(), E2E_DATABASE),
    },
    postgresUrl: postgres.toString(),
  };
};

/** Throws unless both URLs point at asys_e2e, so nothing here can touch the dev database. */
export const assertE2eDatabase = (env: E2eEnv): void => {
  for (const url of [env.DATABASE_URL_APP, env.DATABASE_URL_OWNER]) {
    if (new URL(url).pathname !== `/${E2E_DATABASE}`) {
      throw new Error(`Refusing to run: the database is not ${E2E_DATABASE}`);
    }
  }
};

export const childEnv = (env: E2eEnv): NodeJS.ProcessEnv => ({ ...process.env, ...env });
