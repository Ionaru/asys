---
# SPDX-License-Identifier: EUPL-1.2
name: planning-a-slice-piece
description: Use when starting, re-planning, building or closing a slice or a piece of a slice from docs/mvp-plan.md (slice 2 is next), or when recording known limits, verification or departures from a plan.
---

# Planning a slice piece

## Overview

ASYS is built in slices (`docs/mvp-plan.md`). Each slice is cut into pieces that are built and committed one at a time. `docs/slice-1-plan.md` is the worked example, so copy its shape. A plan in `docs/` is the as-built record. Scratch working plans stay out of `docs/`.

## Shape of a slice plan (`docs/slice-<N>-plan.md`)

1. An SPDX line and a title, then **Working agreements**: test-first units, one piece at a time, one commit per verified piece, push only when asked, database tests with `--skip-nx-cache`.
2. **Decisions**: numbered choices that are smaller than an ADR. Each gives what was decided and why, plus a "Decided <date>" line when it was settled after the plan was first written. A decision that is set in stone, and binds later code, becomes an ADR instead (next number 0014).
3. **The pieces**: a table of the pieces, each with what it delivers and its check.
4. One `## Piece N: <name>` section per piece, holding:
   - its units, written as contracts: inputs, expected results, boundaries, and where each rule is enforced;
   - its tests and verification commands.
   - After building, add "Re-planned and built on <date>", **Departures from the plan**, **Verification (<date>)** and **Known limits**.
5. **Facts checked on <date> (piece N)**: the library and tool facts the piece relied on, verified against the installed versions or primary sources. These are dated snapshots, so recheck them after an upgrade.

## Per piece

1. Re-read the slice in `docs/mvp-plan.md`, the scenarios it covers (`mvp-plan.md` has a scenario-to-stage table), the ADRs it touches and the terms in `CONTEXT.md`. Add any new term to `CONTEXT.md` before code uses it.
2. Verify the external facts first: versions, API behaviour, CLI flags. Then write them into "Facts checked".
3. Cut the piece into units that each have a runnable check. Write each unit's tests from its contract, and see every test fail once for the right reason, by stashing the fix or breaking the rule.
4. Build. Follow the skill that matches each unit: `adding-a-domain-command`, `adding-an-owned-table`, `extending-the-server`, `building-pwa-ui` or `writing-e2e-specs`.
5. Run the full gate before committing:

   ```bash
   pnpm exec nx run-many -t lint typecheck build test --skip-nx-cache
   ```

   Then run the rest of what CI runs:
   - `pnpm exec tsc -p scripts/tsconfig.json` and `pnpm exec nx run server:openapi`;
   - `pnpm exec nx e2e pwa-e2e` (Chromium installed, ports 3100 and 4300 free);
   - `pnpm exec nx run pwa-e2e:e2e-image`, with the image stack from the README's "Against the image" recipe running (port 3200 free);
   - `pnpm exec nx format:check --all`;
   - `node scripts/check-spdx.mts`, `pipx run reuse==6.2.0 lint` and `node scripts/check-licenses.mts`;
   - `node scripts/palettes.mts --check`;
   - `pnpm audit --prod`.

   The test and e2e runs need the database up and `nx serve server` stopped.

6. Record the as-built notes, known limits and verification in the plan. Update the README, `CONTEXT.md`, scenarios and the domain CHANGELOG if they changed.
7. Commit once per piece, only when asked. Later outcomes, such as a phone check after a deploy, go in a docs-only follow-up commit.

## Common mistakes

- Planning from memory of library APIs instead of a dated "Facts checked" entry.
- Letting a unit grow until it needs a decision the plan does not make. Split it, or decide and record it.
- Leaving a scenario `it.todo` in place after the piece made it executable.
- Treating counts in old plans ("49 spec files", "fifteen tables") as current.
