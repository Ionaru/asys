<!-- SPDX-License-Identifier: EUPL-1.2 -->
# Durable jobs live in an ASYS jobs table

Jobs such as Reminders, the Morning briefing, Google polling and push-channel renewal, and imports are rows in an ASYS-owned table behind a small Jobs service. A job is created in the same transaction as the change that causes it, so a crash cannot lose a Reminder and a rolled-back change cannot fire one; a worker claims due jobs across owners through one narrow database function using `FOR UPDATE SKIP LOCKED` and runs each job under its owner's row-level security; retries use Effect's Schedule backoff; recurring jobs such as each User's Morning briefing use Effect's core Cron with one next-run row per recurring job, so a run missed during downtime executes once; and the age of the oldest due job is reported on the health endpoint.

## Considered Options

- **`effect/cluster`**: rejected for now because it is marked unstable, creates and migrates its own tables at startup (which the app role of ADR 0007 cannot own), does not separate storage per owner, and runs cron once per cluster rather than per owner. The Jobs interface is kept narrow so it can be swapped in later.
- **pg-boss**: stable, but rejected because it has no Effect adapter, so creating a job inside a Drizzle transaction would need a hand-made bridge.

## Consequences

The claim function reads across owners, so like every pre-owner lookup in ADR 0007 it cannot belong to the table-owning role, which FORCE ROW LEVEL SECURITY binds too. It belongs to the lookup role (or a sibling role set up the same way) with only the column privileges it needs: SELECT on the due and owner columns and UPDATE on the claim columns. The worker then runs each claimed job in a transaction that sets that job's owner. The health endpoint's age of the oldest due job reads across owners too, through a second function owned by the lookup role that returns only an interval, never an owner or a row.
