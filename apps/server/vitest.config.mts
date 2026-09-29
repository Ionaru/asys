import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

// The database tests read their connection URLs from the workspace .env.
const envFile = resolve(import.meta.dirname, '../../.env');
if (!process.env.DATABASE_URL_APP && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/server',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    name: 'server',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    // The tests share one database.
    fileParallelism: false,
    typecheck: {
      enabled: true,
      // Without an explicit tsconfig vitest's tsc checks no file and every type test passes.
      tsconfig: './tsconfig.typecheck.json',
      include: ['src/**/*.test-d.ts'],
    },
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/server',
      provider: 'v8' as const,
    },
  },
}));
