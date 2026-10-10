---
# SPDX-License-Identifier: EUPL-1.2
name: changing-a-domain-rule
description: Use when changing how ASYS derives a value (Available, Blocked, Overdue, Urgency, Quadrant, Latest start, Picker ranking, Waiting, Inbox order) or a display format in libs/domain, or when turning a scenario it.todo into a real test.
---

# Changing a domain rule

## Overview

`libs/domain` is the only home of the rules. The server and the PWA call the rules; they never re-implement them. A front-end derives values with the rules named by `RULES_VERSION`, so ADR 0003 makes any rule change at least a minor version, with a changelog entry. No test ties the version to the changelog, so you are the check.

## Steps

1. Read the term in `CONTEXT.md`, the default in `docs/slice-1-plan.md` Decision 4, and the newest sections of `libs/domain/CHANGELOG.md`. If the change alters what a term means, update `CONTEXT.md` first and agree on the wording.
2. Write the failing spec next to the rule (`*.spec.ts`). Use the builders from `src/test/builders.ts` (`aTask`, `aLink`, `anArea`, `aState`, `aReviewItem`), the zone `AMS`, and fixed 2026 instants via `Date.parse('2026-10-14T08:00:00.000Z')`. Add a `fast-check` property when the rule ranges over time or zones (see `picker.spec.ts` and `zoned.spec.ts`).
3. Change the rule while keeping the library pure:
   - `now`, the zone and Settings come in as arguments.
   - `Temporal` is used only in `time/zoned.ts` and `time/display.ts`.
   - Display words come from fixed English tables, never `Intl`.
   - Strings compare by code unit, with `compareCodeUnits` from `lib/compare.ts`, which the PWA also imports from `@asys/domain`. Never add a local copy or use `localeCompare`.
   - Reason unions (`ExclusionReason`, `BlockedReason`) are open: consumers keep a `default` branch.
4. Export new functions through the folder's `index.ts` and `src/index.ts`.
5. In the same commit, bump `RULES_VERSION` in `src/lib/rules-version.ts` and add a section at the top of `CHANGELOG.md`:
   - The heading is `## X.Y.Z (YYYY-MM-DD)`, followed by a one-line summary and `###` subsections of bullets.
   - Bullets use the glossary's capitalised terms and concrete examples (`Due yesterday 17:00`).
   - Say which earlier rule the change replaces.
6. Update the consumers: PWA screens and `apps/pwa/src/app/**` specs that show the value, and `apps/pwa-e2e` specs that assert the text.
7. Update `docs/scenarios.md` and its acceptance criterion if the behaviour it describes changed.

## Scenario specs

- `docs/scenarios.md` S1 to S13 map one-to-one to `libs/domain/src/scenarios/s<N>.spec.ts`. Titles read `S<N>.<criterion> [slice 3] text`.
- An unbuilt criterion is an `it.todo` tagged with its slice or stage. When it becomes executable, turn it into an `it`, drop the tag and keep the `S<N>.<n>` prefix.
- See the new test fail once by breaking the rule.

## Verify

```bash
pnpm exec nx run-many -t lint typecheck test -p domain contract --skip-nx-cache
```

```bash
pnpm exec nx run-many -t typecheck build test -p pwa
```

## Common mistakes

- **Rule changed with no version bump or changelog section.** Nothing fails, but ADR 0003 is broken.
- **`new Date()` or `Date.now()` in library code.** The spec passes today and fails near midnight or across a DST change.
- **Display text built with `toLocaleString`.** The output depends on the machine's locale.
- **Old wording left behind.** A PWA or e2e assertion still expects the previous text.
