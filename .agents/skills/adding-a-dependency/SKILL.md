---
# SPDX-License-Identifier: EUPL-1.2
name: adding-a-dependency
description: Use when adding, upgrading or removing an npm or JSR package in the ASYS workspace, or when pnpm install, pnpm audit or the licences CI job fails.
---

# Adding a dependency

## Overview

Every dependency is a supply-chain and licence decision (ADR 0011). The workspace is one root `package.json`, with no per-app packages and no `packages:` key in `pnpm-workspace.yaml` (ADR 0010).

## Steps

1. **JSR first.** Check whether the package is published on JSR, for example with `curl -s https://api.jsr.io/scopes/<scope>/packages/<name>`. If it is, run `pnpm add [-D] jsr:@scope/name@x.y.z`, which records `"@scope/name": "jsr:x.y.z"`. Fall back to npm only when it is not on JSR. As of 2026-10, effect, `@effect/*`, drizzle, fast-check and temporal-polyfill are npm only.
2. **Licence.** Production dependencies must be MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC or 0BSD. `node scripts/check-licenses.mts` enforces this and fails closed on unknown expressions. Widening the list is an ADR 0011 change, so ask first.
3. **Version.** Pin exact versions for runtime-critical and tooling packages (Effect, Drizzle, Nx, Vitest, oxlint, oxfmt, Playwright). Angular uses `~`.
   - Effect and Drizzle move together, as a planned task (ADR 0009). An Effect upgrade changes these pins together:
     - `effect` and `@effect/*` in the root `package.json`;
     - the `effect` and `@effect/platform-node-shared` overrides in `pnpm-workspace.yaml` (the `typescript` override is separate);
     - the `effect` pins in `libs/contract/package.json` and `libs/effect-passkeys/package.json`.

     Then recheck the `effect/unstable/sql/SqlError` path in `tsconfig.base.json`, the type test and the `drizzle-orm/effect-postgres` smoke import in `cd.yaml`.

   - A lib manifest's version of a shared package stays equal to the root's.
   - After an oxlint upgrade, check that a banned import still turns lint red, because the boundary bridge is experimental.
4. **Build scripts.** pnpm runs none by default. A package that needs one must be added to `allowBuilds` in `pnpm-workspace.yaml`. Keep that list minimal, and record a reviewed denial as `false`.
5. **Library manifests.** If a buildable lib uses the package, add it to that lib's `package.json` too (for example `libs/effect-passkeys/package.json`).
6. **Boundaries.** The bans live in the root `.oxlintrc.json`:
   - `bannedExternalImports` in `depConstraints`, for the domain, passkeys and contract tags. The domain list is a blocklist, so a new package stays importable from `libs/domain` until you add it there. Domain imports nothing from npm but `temporal-polyfill`.
   - The two PWA `no-restricted-imports` overrides (`apps/pwa/**` and `apps/pwa/src/app/core/api/**`). They share some patterns, which must be changed in both.
   - Some projects add bans in their own `.oxlintrc.json` (contract, effect-passkeys, server).
7. Commit `package.json`, any lib `package.json`, `pnpm-workspace.yaml` and `pnpm-lock.yaml` together.

## Verify

```bash
node scripts/check-licenses.mts
```

```bash
pnpm audit --prod
```

```bash
pnpm exec nx run-many -t lint typecheck build
```

`pnpm audit` cannot see advisories for JSR packages. That is an accepted gap, so say so when a JSR package is added.
