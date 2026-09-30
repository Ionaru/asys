<!-- SPDX-License-Identifier: EUPL-1.2 -->
# One Nx workspace on the classic path-alias layout

The repository is one Nx 23 workspace using `tsconfig.base.json` path aliases (without `baseUrl`), because Angular does not support Nx's newer project-references layout, and Nx's module-boundary rules are what keep the domain package free of Angular, Effect and Drizzle. This was chosen on the condition that it does not block TypeScript 6 or 7: TypeScript 6 works (Angular 22 requires it), and TypeScript 7 is blocked by Angular itself, whose compiler needs the TypeScript JavaScript API that 7.0 does not ship, which would equally block pnpm workspaces with the Angular CLI. Nx and the module-boundary rule (through `@typescript-eslint/utils`) also still load the TypeScript 6 API, for which Nx documents installing TypeScript 6 and 7 side by side.

Linting is oxlint through `@nx/oxlint`, and formatting is oxfmt; the module-boundary rule runs in oxlint through `@nx/oxlint/boundaries-plugin`.

## Considered Options

- **pnpm workspaces with the Angular CLI and a lint rule for import boundaries**: rejected because it hits the same Angular ceiling while losing Nx's module-boundary rules, generators and caching.
- **ESLint and Prettier**: Nx's defaults, replaced by oxlint and oxfmt for speed; ESLint's Angular template rules and `@nx/dependency-checks` have no oxlint equivalent and are given up.

## Consequences

The classic layout holds only while `pnpm-workspace.yaml` has no `packages:` key: it carries pnpm 11 settings (overrides, build approvals), and a `packages:` key would switch later Nx generators to the project-references layout. `create-nx-workspace` must run outside AI-agent environments (or with their variables, such as `CLAUDECODE`, unset), because in its agent mode it ignores the preset and scaffolds the other layout. The classic base config sets `strict: false`, so each project turns strict on itself. Vitest has one version for the whole workspace: `@effect/vitest` requires 5, while Angular 22.1 peers on 4 (22.2 accepts 5), so the PWA has no unit tests until that is settled.

The module-boundary bridge is experimental in Nx and relies on oxlint's JS-plugin API, which is outside oxlint's semver policy: oxlint is pinned exactly and upgraded deliberately, repeating the check that a banned import turns lint red. If the bridge breaks, the fallback is ESLint running only `@nx/enforce-module-boundaries`. oxfmt leaves `docs/` and `CONTEXT.md` alone to keep their hand formatting.

Revisit this if Angular gains TypeScript 7 support while Nx still needs the TypeScript 6 API: Nx would then be the only blocker, and the move is to Nx's newer layout or to pnpm workspaces with the Angular CLI.
