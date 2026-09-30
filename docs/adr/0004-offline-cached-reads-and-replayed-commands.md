<!-- SPDX-License-Identifier: EUPL-1.2 -->
# Offline means cached reads and replayed commands, not local-first

The PWA keeps a working set on the phone (all Open and Delegated Tasks, Persons, Places, Areas and Playbooks, and Activities and Occasions from 7 days back to 14 days ahead), derives Now and Today locally with the shared domain package, and queues edits as commands in the app's own storage. Each queued command is validated against the contract package's schemas when it is queued and again before it is replayed, and an Undo cancels a command that is still queued. Queued commands carry an idempotency key and are replayed when the app is open and online; the server stays authoritative and merges them with the ADR 0001 rules, and a status change that no longer applies becomes a Review item instead of a conflict dialog.

## Considered Options

- **Full local-first with CRDT-style merging**: rejected as far more machinery than a single-user system needs.
- **Queue in the service worker**: rejected because the Angular service worker is feature-frozen and cannot hold custom request logic; it only caches the app shell and receives Web Push.
