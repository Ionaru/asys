import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs from the workspace root and connects as the table owner.
if (!process.env.DATABASE_URL_OWNER) process.loadEnvFile('.env');
const url = process.env.DATABASE_URL_OWNER;
if (!url) throw new Error('DATABASE_URL_OWNER is not set (see .env)');

export default defineConfig({
  dialect: 'postgresql',
  schema: './apps/server/src/db/schema.ts',
  out: './apps/server/drizzle',
  dbCredentials: { url },
});
