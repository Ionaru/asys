<!-- SPDX-License-Identifier: MPL-2.0 -->

# Changelog of the domain rules

`RULES_VERSION` in `src/lib/rules-version.ts` names the rules a front-end derives its values with. Any change to a rule is at least a minor version (ADR 0003).

## 0.2.0 (2026-10-03)

The working set and how change-log entries apply to it, and the Inbox count.

### The working set

- The working set is what the snapshot returns: the Open and Delegated Tasks, the blocker links of those Tasks, all Areas, the unresolved Review items and the Settings.
- Change entries apply in list order, and each sees the result of the previous one.
- A Task put with status Open or Delegated is appended, or replaces the Task with the same id in place.
- A Task put with status Done, Dropped or Skipped removes the Task and the blocker links it owns. Links that name it as their blocker stay.
- A blocker put is kept only while its Task is Open or Delegated in the working set at that point, and is upserted by id. Otherwise it is ignored. The blocker Task need not be in the set.
- A blocker remove drops the link with that id, if any.
- An Area put is upserted by id.
- A Review item put is upserted by id while unresolved, and removes the item once it is resolved.
- A Settings put replaces the Settings unless the time zone and urgency window are unchanged.
- A list of entries that changes nothing returns the same state, and any part of the state that no entry changed keeps its identity.

### Inbox count

- The **Inbox count** is the number of Tasks in the Inbox plus the number of unresolved Review items.

## 0.1.0 (2026-10-01)

The first rules: the time model, Areas and Active hours, the derived state of a Task, the Picker, and the Task-loop commands of Slice 1.

### Dates and deadlines

- Available from and Due are a local date with an optional local time, resolved in the Current time zone.
- A timed Due resolves to its time. A date-only Due resolves to the last millisecond of its day: the next local day's start minus 1 ms.
- A date-only Available from resolves to the start of its day.
- A wall time in a daylight-saving gap or overlap resolves with Temporal's `compatible` rule: the later time in a gap, the earlier offset in an overlap.
- **Overdue** holds for an Open or Delegated Task when now is after its Due instant. Being Blocked does not matter.
- **Available** holds for an Open Task out of the Inbox when now is at or after its Available from and it is not Blocked.
- **Effective due** is the earliest of the Task's own Due and the Latest starts of the Open or Delegated Tasks it blocks, followed down the whole chain. A Task already on the path being followed contributes nothing, so a cycle of links cannot loop.
- **Latest start** is Effective due minus the Estimate. A missing Estimate counts as 0.
- **Urgent** holds when the Latest start is at or before now plus the Urgency window, counted in calendar days in the Current time zone. The window is 2 days unless changed, and can be 1 to 14.
- **Quadrant**: important and urgent is Do, important only is Plan, urgent only is Delegate, neither is Drop.
- A recurring Task is never labelled Drop. Recurring Tasks arrive in Slice 3, which enforces and tests this.

### Blocking, Inbox and Areas

- A Task is **Blocked** while a Task it waits for is Open or Delegated. A blocker that is Done, Dropped, Skipped or not in the working set does not block.
- A Task is in the **Inbox** while it is Open and has no Importance or no Estimate.
- An Area's **Active hours** are half-open minute intervals per ISO weekday, taken in the Current time zone. The seeded Work Area is Monday to Friday 08:00 to 18:00; the seeded Personal Area is every day, all day, with default Privacy Hidden.
- A Task without an Area, or with an Area that is not known, has no Active-hours limit.

### The Picker

- **Ranked** holds the Available Tasks inside their Area's Active hours, in this order: Overdue first; then Quadrant (Do, Plan, Delegate, Drop); then earliest Latest start, with none last; then creation time; then id.
- **Waiting** holds the Open, triaged Tasks that are not Available, with their reasons: not yet Available (with the moment it becomes so), then Blocked (with the blockers). It is ordered by creation time, then id.
- A Task outside its Area's Active hours appears in neither list.
- Delegated and Inbox Tasks appear in neither list.
- The reason line is `Overdue` when it applies, the Quadrant, and `start by YYYY-MM-DD HH:MM` in the Current time zone when there is a Latest start, joined by `·`.
- Ids are compared by UTF-16 code units, never by locale.

### Commands

- Each command is a pure function of the state, the command and the moment. It returns Applied with its changes, NotApplicable with a reason, or Rejected with a reason.
- Commands carry client-made ids for the entities they create, so transitions stay pure and offline capture has stable ids.
- Checks run in a fixed order, and the first failing one decides the result:
  1. validation that needs no state (Rejected);
  2. the target exists (Rejected `not_found`);
  3. the expectation (NotApplicable `expectation_failed`);
  4. the status precondition (NotApplicable `not_open`);
  5. validation that reads state (Rejected).
- An expectation (`status`, `version`) exists only on Triage, edit, log progress, complete and drop, and a `version` expectation on updating an Area.
- A new Task or Area starts at version 1, and every applied change to one raises its version by 1.
- A command that would change nothing is Applied with no changes and no version change. Resolving a Review item twice is such a command.
- **Capture** stores the title trimmed and the captured text exactly as given. The new Task is Open, with no Area unless one is given.
- **Triage** needs an Open Task, Importance and an Estimate. **Log progress** needs an Open Task with an Estimate, and sets it to a smaller positive value.
- Estimates and remaining time are whole minutes from 1 to 100 000.
- **Edit** works in any status. `null` clears the Area, Available from, Due, Estimate or Importance. The title is trimmed and cannot be empty.
- The **Due-move counter** counts every change to an existing Due, including clearing it. Setting a first Due or the same Due does not count.
- **Complete** and **Drop** apply to Open Tasks only and change nothing but that Task.
- **Adding a blocker** rejects a link to itself, a duplicate link and any link that would close a cycle. Links do not change the Tasks they join.
- The Current time zone must be an IANA time zone name; a UTC offset is not accepted.
