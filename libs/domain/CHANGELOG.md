<!-- SPDX-License-Identifier: MPL-2.0 -->

# Changelog of the domain rules

`RULES_VERSION` in `src/lib/rules-version.ts` names the rules a front-end derives its values with. Any change to a rule is at least a minor version (ADR 0003).

## 0.8.0 (2026-10-27)

Triage may carry the Title, Notes, Available from and Due set while triaging, validated and applied as an edit is.

### Triage

- `TriageTask` takes four optional fields besides Importance, Estimate and Area: `title`, `notes`, `availableFrom` and `due`. A field that is absent leaves the Task's value alone, and `null` clears Available from or Due. This is what the Inbox's Triage card sends: nothing is saved until the person taps Triage, and then the edits and the triage arrive as one change with one version bump.
- The fields are checked exactly as an edit checks them, and before the Task is looked up: a title that is not a string or is blank after trimming is Rejected `invalid_title`, notes that are not a string `invalid_notes`, and an Available from or Due that is not a valid date, with a valid time if it has one, `invalid_date`. The order is Estimate (`invalid_estimate`), Title, Notes, Available from, Due, and only then `not_found`, the expectation, `not_open` and `unknown_area`. So an invalid title on a Task that does not exist answers `invalid_title`, not `not_found`.
- The title is stored trimmed and the notes exactly as given, as an edit does.
- The Due-move counter follows the 0.7.0 rule: from a Due of Mon 19 Oct 17:00, triaging with Tue 20 Oct 17:00 counts one move and triaging with no Due counts one, while Mon 19 Oct 09:00 counts none. A first Due counts none, and a Triage that carries no Due leaves the counter alone.
- Triage and edit now share one check and one way of applying these four fields, so they cannot drift apart. An edit's results, including its check order, are unchanged.

## 0.7.0 (2026-10-16)

A Task's own explanation, a calendar's date arithmetic, and a Due move that ignores the time.

### Due moves

- The counter of Due moves counts a change of an existing Due's date, or clearing it. Adding, changing or removing the time on the same date does not count. From a Due of Mon 19 Oct 17:00, Tue 20 Oct 17:00 counts one move and clearing the Due counts one, while Mon 19 Oct (the time removed) and Mon 19 Oct 09:00 count none.
- This replaces 0.1.0's rule that the counter "counts every change to an existing Due, including clearing it". A first Due still counts none, and setting the same Due still changes nothing.
- A Due set by taps, a date and then a time, now counts no move: the second tap changes only the time.

### Explaining one Task

- `explainTask(task, tasks, links, settings, now)` explains one Task the way Now would, with four outcomes: Available (the Reason, such as the Quadrant and Latest start, and its text), Waiting (the Reason, the exclusion reasons and their text), Inbox, and Not open (Done, Dropped, Delegated or Skipped).
- An Available Task's text is the one Now shows, such as `Latest start 14:30 · important`, `Due yesterday 17:00` or `No Due`. A Waiting Task's text is the one Now shows in Waiting, such as `Available from Tue 6 Oct · Blocked by Order card`.
- It ignores Areas and the Current Area, so a Task outside the Current Area is explained like any other.
- It reads the Task's own fields from the Task passed in, never from `tasks`, so an unsaved copy can be explained against the saved working set.
- It matches the Picker: for every Task the Picker ranks, or lists as Waiting, the explanation holds the same Reason, exclusion reasons and text.

### Dates

- `addDays(date, days)` adds whole calendar days to a local date with no zone: `2026-10-31` plus 1 is `2026-11-01`, `2028-02-28` plus 1 is `2028-02-29`, and `2026-10-16` minus 16 is `2026-09-30`. It throws a RangeError for an invalid date or a `days` that is not an integer.
- `isoWeekdayOf(date)` gives the ISO weekday of a local date: `2026-10-12` is Monday, `2026-10-16` is Friday and `2026-10-18` is Sunday.
- `formatDate(date, today)` gives the weekday, day and month, never a relative word: `Thu 15 Oct`, and `Mon 4 Jan 2027` when the year differs from today's. `formatDay` keeps every output and uses it for dates that are not today, tomorrow or yesterday.

## 0.6.0 (2026-10-12)

A palette per Area.

### Areas

- An Area has a palette: one of the curated palettes `evergreen`, `harbour`, `moss` and `graphite`, or none, which means the default look. None and an explicit `evergreen` are kept apart, so an Area without a palette follows the User's palette once the appearance settings exist.
- The seeded Personal Area has `harbour`, and Work has none. Only Users created from now on get it.

### Commands

- **Create Area** takes an optional palette; leaving it out gives none. An unknown palette is Rejected `invalid_palette`, checked after the name, the Active hours and the default Privacy, and before the duplicate id.
- **Update Area** can set a palette or clear it to none, and an unknown one is Rejected `invalid_palette`. Setting the palette an Area already has changes nothing.

## 0.5.0 (2026-10-12)

The Current Area: the Areas whose Tasks Now ranks, a pick that overrides them, and a count of the Tasks the other Areas hold.

### The Current Area

- With no pick, the Current Area is every Area within its Active hours at that moment. With the seeded Areas in Amsterdam on a weekday, 07:59 gives Personal, 08:00 gives Work, 17:59 gives Work and 18:00 gives Personal. Overlapping Areas are all current, and at a moment inside no Area's hours none is.
- A pick replaces that with one Area until its end, which is worked out when the pick is made: the next moment that day at which the picked Area comes into its Active hours, or the start of the next local day, whichever is earlier. An interval that starts where the one before it ends is not a new entry.
- On a weekday, Personal picked at 07:30 or at 10:00 ends at 18:00, and Work picked at 06:00 ends at 08:00 and does not come back at 18:00. Work picked at 17:30, or on a Saturday, ends at midnight.
- The start of the next local day follows the time zone: a pick on Sun 25 Oct in Amsterdam, a 25-hour day, ends at 00:00 CET on Mon 26 Oct.
- On a day when the clocks change, an interval start is read as one wall-clock time: a start in the hour the clocks skip counts an hour later (02:30 on 29 Mar is 03:30), and a start in the hour they repeat counts at its first pass only.
- A pick whose end has passed, or whose Area no longer exists, gives way to the Areas within Active hours.

### The Picker

- This replaces the rule of 0.1.0 under which a Task outside its Area's Active hours appeared in neither list and was not counted.
- The Picker ranks and lists under Waiting the Tasks of the Current Area, and Tasks without an Area or with an Area it does not know, as before.
- A Task that is Available but belongs to an Area outside the Current Area is counted under its Area, with how many of those are Overdue, such as Work 4 (1 Overdue). It is still neither ranked nor Waiting.
- Inbox, Blocked and not-yet-Available Tasks of such an Area are neither listed nor counted. Areas with nothing counted are left out, and the counts are ordered by the Area's name, then its id, in code units.
- Asked without a Current Area, the Picker uses each Area's Active hours at that moment, as before.

### Seeded Areas

- Personal is now seeded with Monday to Friday 00:00 to 08:00 and 18:00 to 24:00, and Saturday and Sunday all day, instead of every day all day: `Mon–Fri 00:00–08:00, 18:00–24:00 · Sat–Sun, all day`. Only Users created from now on get it.

## 0.4.0 (2026-10-09)

The moment line of the Now screen, the summary of the Waiting section, and the fact of the reason line on its own.

### The moment line

- The moment reads as the weekday, the day, the month and the 24-hour time in the Current time zone, joined by a middle dot between spaces: `Fri 9 Oct · 14:05`.
- It never reads `today` and never carries a year, even across New Year: `Fri 1 Jan · 00:59`.
- Weekday and month names come from the same fixed English tables as the day formats. The day has no leading zero and the time does.
- Seconds are dropped, not rounded: 14:05:59 reads `14:05`.
- The local day and date change at local midnight: 22:30 UTC on Sunday 4 Oct reads `Mon 5 Oct · 00:30` in Amsterdam. When daylight saving ends, both 00:30 UTC and 01:30 UTC on 25 Oct read `Sun 25 Oct · 02:30`.

### The Waiting summary

- While the Waiting section is closed, one line says when the next Waiting Task becomes Available: `Next Available` and the Task's own Available from (`Next Available Tue 6 Oct`, `Next Available tomorrow 09:00`).
- The Task whose moment of becoming Available is earliest decides, whatever the list order. On a tie, the first in the list decides.
- A Task without an Available from reads the time its moment falls at (`Next Available 15:30`, or the day and the time on another day).
- A Task that is both Blocked and not yet Available counts by its not-yet-Available moment.
- There is no line (`null`) when no Waiting Task is waiting for a moment: the list is empty, or every Waiting Task is only Blocked. Unknown reasons are ignored.

### The reason line

- The fact of the reason line is now available on its own, so a front-end can colour an Overdue Due. The line itself is unchanged: `Due yesterday 17:00 · important` still reads the same.

## 0.3.0 (2026-10-04)

The display formats, the reason and Waiting lines in the design system's style, the Inbox order, the blocker lists and the Active hours text.

### Display formats

- **Days** read `today`, `tomorrow` or `yesterday`, else the weekday, day and month, such as `Sat 3 Oct`. The year follows when it differs from today's, such as `Mon 4 Jan 2027`.
- Day and month names come from fixed English tables (`Mon` to `Sun`, `Jan` to `Dec`), never from `Intl`.
- A Due or Available from reads as its day, then its own time when it has one: `today 17:00`, `Tue 6 Oct`.
- **Times** are 24-hour `HH:MM` in the Current time zone: the time alone on today's local day (`14:30`), else the day and the time (`tomorrow 09:00`, `Sat 10 Oct 14:30`).
- An instant 1 ms before a minute boundary shows the next minute, so a date-only Due's Latest start reads `23:30`, not `23:29`. The exception is the end of a local day, which shows as the ending day's `23:59`; it is found by the change of local date, so a day that starts at 01:00 (daylight saving in some zones) is handled too.
- **Estimates** read `5 min`, `59 min`, `1 h`, `1 h 05` and `2 h`.

### The reason line

- This replaces the rule of 0.1.0, which listed `Overdue`, the Quadrant and `start by YYYY-MM-DD HH:MM`.
- The reason line of a ranked Task is one fact:
  - when it is Overdue, `Due` and the Task's own Due with a day word (`Due yesterday 17:00`, `Due yesterday`);
  - otherwise, with a Latest start, `Latest start` and its time, or its day and time (`Latest start 14:30`, `Latest start Sat 10 Oct 14:30`);
  - otherwise `No Due`.
- ` · important` follows when the Task is important: `Latest start 14:30 · important`, `No Due · important`.
- Overdue and the Quadrant are no longer in the line. Front-ends show them as a badge and a chip.

### The Waiting line

- Each Waiting Task has a one-line reason, its known reasons joined by a middle dot between spaces:
  - not yet Available: `Available from` and the Task's own Available from (`Available from Tue 6 Oct`, `Available from tomorrow 09:00`);
  - Blocked: `Blocked by A`, `Blocked by A and B`, or `Blocked by A and 2 more`. Blocker titles are ordered by title, then id, in code units.
- Unknown reasons are skipped, and a Task with no known reason reads `Waiting`.

### Inbox order

- The Inbox Tasks and the unresolved Review items are each ordered by creation time, then id.

### Blockers

- A Task may be made to wait for an Open or Delegated Task that is not itself, is not already its blocker, and does not already wait for it, directly or through other Tasks, following every link.
- **Blocks** lists the Open or Delegated Tasks that wait for a Task directly.
- Both lists are ordered by title, then id, in code units.

### Active hours text

- A day's intervals read `08:00–18:00`, with an en dash, joined by `, `. A whole day reads `all day`.
- Days with equal hours are grouped: consecutive days as a range (`Mon–Fri`, `Sat–Sun`), others with commas (`Mon, Wed, Fri`), and all seven as `Every day`.
- Groups go Monday first and are joined by a middle dot between spaces: `Mon–Fri 08:00–18:00`, `Every day, all day`, `Mon 09:00–12:00, 13:00–17:00 · Sat 10:00–12:00`.
- An Area without hours reads `No Active hours`.
- In a time input, an end of `00:00` means the end of the day.

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
- **Triage** needs an Open Task, Importance and an Estimate (since 0.8.0 it may also carry a Title, Notes, Available from and Due). **Log progress** needs an Open Task with an Estimate, and sets it to a smaller positive value.
- Estimates and remaining time are whole minutes from 1 to 100 000.
- **Edit** works in any status. `null` clears the Area, Available from, Due, Estimate or Importance. The title is trimmed and cannot be empty.
- The **Due-move counter** counts every change to an existing Due, including clearing it. Setting a first Due or the same Due does not count.
- **Complete** and **Drop** apply to Open Tasks only and change nothing but that Task.
- **Adding a blocker** rejects a link to itself, a duplicate link and any link that would close a cycle. Links do not change the Tasks they join.
- The Current time zone must be an IANA time zone name; a UTC offset is not accepted.
