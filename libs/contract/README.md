<!-- SPDX-License-Identifier: MPL-2.0 -->

# contract

The ASYS API contract: the [Effect Schema](https://effect.website) description of every value the server and its clients exchange. The server decodes client commands with it, encodes change-log entries with it and, from piece 4 of slice 1, declares its HTTP API with it; the PWA validates queued commands with it before it stores and replays them ([ADR 0004](../../docs/adr/0004-offline-cached-reads-and-replayed-commands.md)).

- `src/lib/primitives.ts`: ids (lowercase UUIDs), text (no NUL, no unpaired UTF-16 surrogate, both of which PostgreSQL rejects), local dates and times, `DateSpec` and instants.
- `src/lib/entities.ts`: Task, BlockerLink, Area with its Active hours, Review item and Settings.
- `src/lib/commands.ts`: the 13 slice 1 commands as one tagged union, each a domain `Command` plus its `idempotencyKey`, with `commandMeta` (which commands may be queued offline) and `toDomainCommand`.
- `src/lib/results.ts`: `CommandResult` (`Applied` with the change-log `seq`, or `NotApplicable` with the Review item it created) and the payload of that Review item.
- `src/lib/changes.ts`: change-log entries, the `since` response, the snapshot and `Meta` with `API_VERSION`.
- `src/lib/errors.ts`: `CommandRejected`, `IdempotencyKeyReused` and `ChangesExpired`.

Every schema only narrows its value: its `Type` is exactly the plain TypeScript type of `@asys/domain`, and the type tests (`*.test-d.ts`) fail when the two drift apart. The library may depend on `@asys/domain` and `effect`, never on Drizzle, the SQL driver, Node platform packages or Angular.

## Licence

MPL-2.0, like `@asys/domain`: third-party front-ends that bundle it keep their own licence, while changes to these files stay open ([ADR 0011](../../docs/adr/0011-license-eupl-and-mpl.md)). The text is in `LICENSE`.

## Building and testing

Run `nx build contract` to build the library and `nx test contract` to run its runtime and type tests via [Vitest](https://vitest.dev/).
