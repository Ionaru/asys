# The server runs on Effect v4 and Drizzle ORM 1.0, pinned to release candidates

The server is built on Effect v4 (HttpApi for the REST API, OpenAPI and the change stream; Layers for the core and its add-ons) with Drizzle ORM 1.0 through its native Effect integration (`drizzle-orm/effect-postgres` on `@effect/sql-pg`), accepting release candidates now to avoid a large migration once both reach stable. Because both move quickly, versions are pinned exactly with no ranges (`effect`, `@effect/sql-pg`, `@effect/platform-node` and `@effect/vitest` at 4.0.0-rc.117; `drizzle-orm` and `drizzle-kit` at 1.0.0-rc.4), one `effect` version is forced across the workspace, and a CI type test fails if a Drizzle transaction's error type degrades to `any`; the two are upgraded together as a planned task, never by a routine install.

## Considered Options

- **Hono 4 with Drizzle 0.45, pg-boss and Zod**: stable today and fully capable, but rejected because it would mean a large migration later.
- **NestJS**: rejected as too heavy on boilerplate.
- **Effect v3 (stable)**: rejected because it guarantees a major migration to v4.

## Consequences

Effect 4.0.0-rc.118 renamed `effect/unstable/*` to flat paths while Drizzle 1.0.0-rc.4's types still import the old ones, so moving past rc.117 waits for a Drizzle release on the new paths. `skipLibCheck` is required, since Drizzle's own type files do not compile under strict TypeScript, which is why the CI type test exists. HttpApi only accepts Effect Schema, so the contract package is written in Effect Schema; the domain package stays plain TypeScript with no `effect` import. The first implementation step is a trial run of this pairing against a real PostgreSQL.
