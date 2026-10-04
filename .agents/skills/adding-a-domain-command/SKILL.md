---
# SPDX-License-Identifier: EUPL-1.2
name: adding-a-domain-command
description: Use when adding, renaming or changing the payload of an ASYS domain Command (a CommandTag such as CaptureTask, EditTask or UpdateArea), or when a user action needs a new kind of write through POST /v1/commands.
---

# Adding a domain command

## Overview

A Command crosses four projects: `libs/domain` decides, `libs/contract` encodes, `apps/server` loads state and persists, and `apps/pwa` sends. Several places fail only at runtime, or only through a hard-coded count. Work through the whole list, even when a step looks optional.

Every domain write goes through `POST /v1/commands`. Never add a bespoke mutation endpoint for domain data. Auth endpoints are the only exception.

## Steps

**Docs first.** If the action brings a new user-facing verb (Snooze, Defer, ...), add it to `CONTEXT.md` before code uses it. Check it against the existing _Avoid_ lines: "defer date" is already avoided under Available from.

**Domain** (`libs/domain/src/lib/commands/`), test-first:

1. In `command.ts`, add `CommandTag.X`, the `X` interface (`_tag: CommandTag.X`) and its member of the `Command` union. Add any new `RejectedReason` or `NotApplicableReason` members.
2. Add `xCommand(state, command, now)` returning `TransitionResult` to the family file (`task-commands.ts`, `area-commands.ts`, `blocker-commands.ts`, `review-commands.ts`, `settings-commands.ts`).
   - A function in an existing family file is already exported, because `commands/index.ts` uses `export *`. Only a new family file needs a new line there.
   - Keep the check order: stateless validation, `not_found`, the `expect` precondition, the status precondition, then validation that reads state.
   - A no-op is `Applied` with `changes: []`.
   - Clients mint the ids of created entities.
   - Name an unused `now` as `_now`.
3. Add the `case` in `apply-command.ts`. Its `default` casts its way past exhaustiveness, so a missing case still compiles.
4. Specs:
   - Test the family spec. If the command has `expect`, extend any cross-command table in it, such as the expectation test "is checked by editTask, logProgress and dropTask as well" in `task-commands.spec.ts`.
   - Add the row in `apply-command.spec.ts` and raise its hard-coded command count.
   - If a scenario criterion is now executable, turn its `it.todo` in `src/scenarios/s<N>.spec.ts` into an `it`.
5. **Rules version.** A new command, a new reason, or a changed check order or precondition is a rule change (ADR 0003). `libs/domain/CHANGELOG.md` documents each command, and which ones carry an expectation. Bump `RULES_VERSION` and add a CHANGELOG section, following `changing-a-domain-rule` step 5, and correct any changelog sentence the new command makes false.

**Contract** (`libs/contract/src/lib/`):

6. In `commands.ts`, add the member to `CommandSchema` as `<Tag>Command`, with `idempotencyKey: UuidSchema`. Add its `commandMeta` entry; the mapped type forces it.
   - Reuse the primitives in `primitives.ts` (`UuidSchema`, `TextSchema`, `LocalDateSchema`, `DateSpecSchema`, ...). Their filters reject malformed values, such as `2026-02-30`, at decode with a 400. So never write a spec that expects such a value to reach the domain.
   - Numbers the domain validates stay `Schema.Finite`, so the domain returns its own `Rejected` reason.
   - Optional fields use `Schema.optionalKey`.
7. Add new entities or fields to `entities.ts` and `changes.ts`, with a case in the matching `*.test-d.ts`. Give each exported schema `.annotate({ identifier })`, and declare each enum once, in `enums.ts`.
8. Specs:
   - In `commands.spec.ts`, append a fixture to `requests` (at the end, so the `at(n)` indexes stay valid), plus its `uuidFields` and `textFields` rows. If its `commandMeta` is `{ offline: true }`, add the tag to the `offline` array, or "marks X as offline: false" fails.
   - In `openapi-components.spec.ts`, add it to `commandMembers` and raise `toHaveLength(N)`.
   - Raise the count in test titles and in `libs/contract/README.md`.
   - Find every count with `grep -rnwE '13|thirteen' libs/domain/src/lib/commands libs/contract/src/lib libs/contract/README.md`. The count was 13 at the end of slice 1.

**Server** (`apps/server/src/`):

9. Add the `case` to `commands/load-state.ts`. Its `switch` has no `default` and returns nothing, so typecheck does **not** catch a missing case. The command then runs against empty state and answers `not_found`. Only a `run-command.spec.ts` test against the real database catches this.
10. If the command has an `expect` field and can be NotApplicable, add it to `commands/not-applicable.ts`, which throws for any tag it does not list.
11. For a new entity (a new `ChangeEntity`):
    - Add `db/schema.ts` and its migrations (`adding-an-owned-table`), plus `db/mappers.ts`, `commands/persist-changes.ts`, `changes/change-log.ts` and `changes/snapshot.ts` (`readSnapshot`).
    - Add its `<table>_pkey` to `DUPLICATE_ID_CONSTRAINTS` in `commands/run-command.ts`. Otherwise an id collision becomes a 500 instead of `CommandRejected`.
    - In the contract, add it to `ChangeEntrySchema` and `SnapshotSchema`. In the domain, add it to `DomainState` and `working-set/apply-changes.ts`.
    - `change_entity` is a Postgres enum, so add the value to its tuple in `schema.ts`, with an `ALTER TYPE ... ADD VALUE` migration.
12. For a new value of an existing database enum, update the literal tuple in `schema.ts` and add a migration. `db/schema-enums.spec.ts` compares the tuple with the domain enum by itself. For a brand-new database enum, add a row to `schema-enums.spec.ts` and `schema-enums.test-d.ts`.
13. Add a spec to `commands/run-command.spec.ts`.

**PWA** (`apps/pwa/src/app/`):

14. Regenerate the client. The `build`, `serve`, `typecheck` and `test` targets of `pwa` run `pwa:api-client` themselves; run `pnpm exec nx run pwa:api-client` by hand only for plain `tsc` or an editor. Until it is regenerated, `SHAPES.command` in `core/api/wire.ts` fails typecheck, because the generated `Command` lacks the new member. Never edit `src/generated` by hand.
15. Exhaustive switches:
    - `core/data/command-subject.ts`: every new tag needs a `case`. It is compile-checked, and it drives `CommandAttempts` and the sync.
    - `core/data/outcome-message.ts`: one `case` per new `RejectedReason`. It is compile-checked.
    - `features/inbox/review-copy.ts` is **not** compile-checked; its switches have a `default`. If the command can become NotApplicable, add its `taskQuestion` case (or the Area branch) by hand, or the Inbox shows the generic "ASYS needs a decision."
16. In the screen:
    - List `CommandAttempts` in the component's `providers`; it is `autoProvided: false`.
    - Take a key from `keyFor(command)`, call `DataStore.send(command, key)`, then call `attempts.settle(...)` and show `outcomeMessage(outcome)`.
    - Check `destroyRef.destroyed` after the await.
17. Add an e2e seed helper in `apps/pwa-e2e/src/support/seed.ts` if specs need it.

## Verify

```bash
pnpm exec nx run-many -t lint typecheck build -p domain contract server pwa
```

```bash
pnpm exec nx run-many -t test -p domain contract server pwa --skip-nx-cache
```

The server tests need the database up and `nx serve server` stopped. See each new test fail once by breaking the rule it covers.

## Common mistakes

| Mistake                                     | Symptom                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| No `load-state.ts` case                     | Every call answers `not_found`, though typecheck and unit tests pass   |
| No `not-applicable.ts` entry                | Server defect (500) on the first stale `expect`                        |
| Command count not raised                    | `apply-command.spec.ts` (`toBe`) and `openapi-components.spec.ts` fail |
| `offline: true` without the `offline` array | `commands.spec.ts` "marks X as offline: false" fails                   |
| No `review-copy.ts` case                    | The Inbox shows the generic fallback text; nothing fails               |
| No CHANGELOG section or version bump        | Nothing fails, but the documented rules are now false                  |
| `Schema.Int` for a domain-validated number  | A 400 decode error instead of the domain's `Rejected`                  |
