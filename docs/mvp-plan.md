# MVP plan

This plan splits the design in [CONTEXT.md](../CONTEXT.md), the [ADRs](adr/) and the [scenarios](scenarios.md) into a first version and a series of later stages. It was drawn up on 2026-09-29 from three independent cuts (one for daily value, one for architecture, one for scenario coverage) that were then merged and checked for coverage and dependency errors. It is a plan, not a decision record: stages can be reordered as real use shows what matters, and anything marked **proposed** fills a gap the design leaves open (see [Open questions](#open-questions)).

Backups, retention of personal data about Persons (and Anonymise suggestions), goals, projects, email features and organisation-level collaboration are out of scope everywhere, and are not staged.

## The MVP in one day

The MVP is the smallest ASYS a manager would open every day on an Android phone instead of a task app next to a bare Google Calendar, built on the foundations the ADRs say must not be retrofitted.

A day with it looks like this. A Morning briefing push arrives, with generic counts only. **Today** shows the day's work-calendar events, imported read-only from Google Calendar as Activities, with the Gaps between them. **Now** shows the Available Tasks that fit the current Gap, Current voice and the Areas' Active hours, ranked by Urgency and Importance, each with a one-line reason; Tasks left out because of their Voice are listed under Not here (urgent ones above the ranking), and a collapsed **Waiting** list shows Tasks that are not yet Available and why. Anything captured from the in-app quick add or the Android share sheet waits in the Inbox until Triage. Tasks can block each other, so Effective due and Latest start follow the chain. Tasks can be Delegated to a Person, with Check-ins that chain through Not yet until Done or Take back, and they can repeat through a Series. On Friday a Weekly review screen empties the Inbox and the Overdue list. On a train, the app keeps reading its working set and queues edits until it is back online.

ASYS writes nothing to Google in the MVP. That keeps Privacy, Guests and sent Invites out of the first version, and nothing it does can reach the employer's Workspace.

## What the MVP contains

The MVP is built in four slices, each usable on its own.

### Slice 1: foundations and the Task loop

**Server foundations** (ADR 0003, 0007, 0011, 0012).
- Every table, including the change log, jobs, idempotency keys and add-on schemas, carries `owner_id`, the one `nullif(current_setting('app.owner_id', true), '')::uuid` policy and ENABLE plus FORCE ROW LEVEL SECURITY in custom SQL. A CI test connected as the app role lists every table and fails if one lacks any of these, so the guard does not depend on remembering it per table.
- Pre-owner lookups are narrow `SECURITY DEFINER` functions owned by `asys_lookup`: passkey credential, session cookie, recovery code, Sign-up link and job claim. The Sign-up link CLI pre-allocates the future owner id on the link row, so that table follows the same RLS rule as every other.
- A per-owner change log, written in the same transaction as each change. Sequence numbers come from a per-owner counter row updated in that transaction, so they commit in order; this is tested with concurrent writers. Entries are after-images in the contract shape. The MVP serves ADR 0003's change stream by polling: one endpoint for a snapshot of the working set with its current number, one for `changes?after=n`, answering 410 once a number is older than the 30-day retention, which a pruning job enforces. A pushed stream (SSE) is the one deferred part of ADR 0003 (Stage 7), and whether HttpApi can stream is still to be checked.
- The jobs table: one worker, a claim function using `FOR UPDATE SKIP LOCKED`, Effect Schedule backoff, per-owner Cron rows, a unique per-owner `dedupe_key` (so a Reminder is moved rather than duplicated when its Anchor moves later), and the age of the oldest due job on `/health`.
- `libs/contract` in Effect Schema and a `/v1` command API. Every mutation is a named command with a client idempotency key, an offline-capable flag and an optional expected status or version. A command whose expectation no longer holds returns a defined "not applicable" result and creates a Review item in the same transaction (ADR 0004); the Done-then-Drop replay is the first test. `/v1/meta` returns the rules version and every setting needed to derive values. OpenAPI is generated but not published. The session cookie is the only credential.
- EUPL-1.2 and MPL-2.0 licence files and SPDX headers from the first commit. The ADR 0009 type test and runtime smoke import stay in CI, and database tests run with `--skip-nx-cache`.

**Domain rules** in `libs/domain`: plain TypeScript with no Effect, Drizzle or Angular import, enforced by the module-boundary rule (ADR 0010), written test-first before any screen.
- The time model. Available from and Due are a local date with an optional local time, resolved against the Current time zone (start of day, end of day); Activities are an instant plus a duration.
- The Offset value type and its resolver, with Working day arithmetic: days, Working days, weeks and months, before or after, from the start or the end, with an optional time of day and, for Activities, a duration. The MVP needs it for Series dates and Check-in dates; Stage 1 builds the Anchor engine on top of it.
- Derived state: Inbox, Available, Blocked (as a tagged union of reasons, so later reasons can be added), Overdue, Effective due, Latest start, Urgency, Quadrant, Gap and Current voice.
- The Picker ranking. **Proposed**, since the glossary only says "ranked by Urgency and Importance, each with a reason": Overdue first, then Quadrant order Do, Plan, Delegate, Drop, then earliest Latest start, then how well the Estimate fits the Gap. A recurring Task is never labelled Drop. Quadrant is a label and part of the reason; nothing acts on the Delegate and Drop suggestions yet.
- Command transitions as pure functions (state and clock in, changes out): complete, drop (including its cascade to an open Check-in), delegate, close a Check-in with an Outcome, and the next Occurrence of a Series. The server, the PWA and the offline outbox all apply the same functions, and the scenario criteria run against them.
- `RULES_VERSION` with a changelog from the start; nothing is published to npm yet.

**Sign-in** (ADR 0006): several passkeys, hashed one-time recovery codes and a session cookie. The first User comes from a Sign-up link printed by a server CLI; there is no admin screen and no open sign-up. Sign-in identities are stored as (provider, subject) rows apart from Connections, so Sign in with Google can be added later without a schema change. The public hostname is fixed before the first passkey is enrolled, because passkeys, Web Push and the Google redirect are all bound to it.

**Tasks.** Title, Notes, Area, Available from, Due, Estimate (in minutes, lowered by a "log progress" action) and Importance. The lifecycle is Open, Done and Dropped, stored as a status enum that already holds Delegated and Skipped; Inbox, Available, Blocked and Overdue are derived. A `kind` column holds `task` and `check_in` now, with `member_template` reserved for Stage 3. A nullable needed Voice and a nullable Privacy (reserved, no effect until Stage 2) exist from the first migration. Each Task keeps a count of how often its Due was moved, since the pruned change log cannot rebuild it. There are no Subtasks yet: ADR 0002 names a parent Task with Subtasks plus blocked-by links as the way to hold a small project, and the MVP ships only the blocked-by half.

**Blocked-by links**: an edge table allowing several blockers per Task, rejecting cycles. A Task is Blocked while any of its blockers is Open or Delegated, and Effective due and Latest start follow the whole chain (S11.7).

**Areas** with per-weekday Active hours, seeded with Work (weekdays 8 to 18) and Personal (every day); a Working day is a weekday inside the Area's Active hours, with no public holidays. The Area's default Privacy column exists (Personal Hidden, ADR 0005) but has no effect until Stage 2. The PWA reports the device's time zone when it changes, and the server keeps one Current time zone per User.

**Inbox and Triage.** Capture takes a title and stores the raw text, so line parsing can be added later. A Task is in the Inbox until Triage has given it both Importance and an Estimate; the Triage command requires both. Triage handles one Task at a time.

**Review items** as a general table: a kind, references to what it concerns, a payload, a resolved time, and a dedupe key unique among open items, so "one Review item per pair" can be enforced later. Each is created in the same transaction as its cause. Slice 1 only builds the table and the list in the Inbox; generators arrive with the features that raise them.

**The PWA shell and data client.** An installable PWA on the public hostname over TLS: a manifest with a Web Share Target entry for capture from the share sheet, and the Angular service worker caching the app shell (it cannot hold custom request logic, ADR 0004). One data client loads the working set from the snapshot, keeps it current from the change log, and sends every edit as a command with an idempotency key; every screen reads from it, so Slice 4 adds persistence and a queue without reworking screens. The share sheet is tried on the phone at the end of this slice.

**Now, first version**: Available Tasks ranked with their reasons, filtered by Active hours, and the Waiting list (the Available from still to come, or the Task that blocks it), which is the Marvin Backburner idea marked Worth adding in [the tool research](research/existing-tools.md). Without a calendar every moment counts as a Gap, and there is no Voice filter or Not here yet.

### Slice 2: the calendar, Gaps and Voice

**Google Connection and Google Calendar import**, the first Add-on (ADR 0001, 0003). It lives in its own Postgres schema with a cursor on the change log, and uses only core commands and the one extension point built now: registering a job kind (webhook routes wait for Stage 7).
- One work Connection with a read-only calendar scope, requested incrementally so write scopes can be added later. The refresh token is encrypted at rest, and when it lapses a "needs re-authorisation" Review item is raised.
- A job polls the primary calendar every few minutes with a sync token and expands recurring events to instances. It imports only events the User accepted or marked tentative, and events the User organised, as ADR 0001 says; declined and unanswered invitations are skipped. Busy or Free comes from Google's transparency flag, and an event cancelled or deleted in Google becomes a Cancelled Activity.
- Each imported Activity keeps a stable identity (event id plus instance start), its organiser and attendee emails, and a change-log entry whenever the organiser moves or cancels it; Stage 1 anchors Prep to exactly these. Workable, its allowed Voice and Notes are ASYS-only fields kept apart from the Google fields; marking a recurring event Workable applies to all its instances. An `origin` column (google, asys) and a nullable needed Voice exist for Stage 2. Imported Activities are otherwise read-only, so S6.1 holds by construction.

**Today**: a read-only timeline of the day's Activities and Gaps, with the Tasks and Check-ins Due today above it and the time Google was last read. Tapping a Gap opens Now for that Gap.

**Gap-aware Now.** A Gap is time with no Activity or only Workable ones, so a Free, non-Workable Activity also ends a Gap. A Task fits when its Estimate is no longer than the Gap. While a non-Workable Activity is under way, Now shows it and previews the next Gap.

**Voice**, as a filter only (decided 2026-09-29): Silent, Out loud and Closed door on Tasks (needed) and on Workable Activities (allowed, asked for when marking one Workable). Current voice is the one picked in Now, kept on that phone only until the next Activity starts or ends and for at most 2 hours; otherwise the least-allowing Workable Activity under way; otherwise unknown, and nothing is left out. The Place step is Stage 4, so the function already takes an optional Place voice and the MVP passes none. Now gains the Voice filter and the Not here list, with urgent Tasks above the ranking.

### Slice 3: people, delegation and repetition

**Persons**: name, email (lowercase and unique per owner, since it is the matching key for Roles and Groups later) and Notes, with Tasks linked to Persons. Foreign keys to a Person never cascade on delete, so dates and states survive a manual Anonymise later.

**Delegation and Check-ins.** Delegating takes the Task out of the working lists and creates a Check-in: a Task row of kind `check_in` pointing at the Delegated Task, due one day before its Due unless changed, with a `dated_by_hand` flag so Stage 1 can let Playbook-timed Check-ins follow the Due. **Proposed** defaults so a Check-in never lands in the Inbox: Importance copied from the Delegated Task, an Estimate of 5 minutes, and Available from at the start of its day. Outcomes are Done, Not yet and Take back. Not yet creates the next Check-in on the next Working day of the Delegated Task's Area, never on a date already past, and asks whether it is by message (no Voice) or by phone (Out loud, or Closed door when the closed Check-in needed it). Dropping a Delegated Task drops its open Check-in (S8.8), and a Delegated Task can be Overdue (S8.7).

**Series for Tasks**, with Fixed recurrence and Skipped. The schema is generic from the start, because ADR 0001 makes the Occurrence the unit across ASYS and Google and a Task-only table would be migrated in Stage 2: one series table with a kind (task, activity, occasion; only task is used), a mode (fixed or floating; only fixed is used), the rule, empty Role bindings, and a template (title, Notes, Area, Importance, Estimate, Voice, and Available from and Due as Offsets from the Occurrence's date). Occurrences are unique on (series, date), so creating them is idempotent. Rules: every N days or weeks on chosen weekdays, a day of the month, the nth weekday, the last Working day, and a yearly date. **Proposed**: a job creates each Task Occurrence when it becomes Available, whether or not the previous one is closed, so a Skipped or missed Occurrence does not affect later ones. Editing an Occurrence never changes its Series; "this and following" ends the Series and starts a new one.

**Weekly review, simplified.** The glossary makes it a recurring Activity, but the MVP authors no Activities, so a seeded Task Series (Fridays at 15:00) opens a review screen instead: the Inbox and its Review items, Overdue Tasks, Delegated Tasks, Check-ins due within 7 days, and the next 7 days of Activities. Each section is a named query in `libs/domain`, so later stages add theirs.

S8 needs no Google at all, which makes it the first end-to-end target of this slice.

### Slice 4: offline and the Morning briefing

**Offline** (ADR 0004). The data client from Slice 1 now persists its working set in IndexedDB: Open and Delegated Tasks, their blocked-by links and Person links, Persons, Areas, open Review items, the settings (Urgency window, Current time zone, Morning briefing time) and Activities from 7 days back to 14 days ahead. A test proves Now can be derived from the working set alone. The everyday commands (capture, Triage, edit, complete, drop, delegate, close a Check-in, log progress) can be queued; each is validated against the contract schema when queued and again before replay, and replayed only while the app is open and online. A replayed command that no longer applies becomes a Review item. The PWA asks to reload when the server's rules version differs from its own. There is no background sync and no Undo of queued commands yet. This slice comes last because no scenario criterion depends on it, so it is the first to shrink if time runs short.

**Morning briefing over Web Push**, the second Add-on and the only Reminder in the MVP. It is sent at a time the User sets, in the Current time zone, from a per-owner Cron row that runs once after downtime (ADR 0012). Until Privacy exists its text is always generic counts, such as "4 Activities, 6 Tasks need you", which is ADR 0005's "every notification generic" setting applied as a fixed rule. One push subscription per device, VAPID keys from server configuration, and the service worker only receives the push. The "Activity about to start with open Prep" Reminder waits for Prep in Stage 1.

## Later stages

Each stage lists what it adds and what the MVP already holds so that it is additive. Items inside a stage, and whole stages whose dependencies are met, can be pulled forward when real use shows they are what keeps the old tool open.

### Stage 1: Prep on other people's meetings

The Anchor engine: Offsets applied to a moving Anchor, chained Anchors, every anchored item moved exactly once, Done, Dropped and Skipped items keeping their dates, a hand edit rewriting the Offset, Detach and Attach. Playbooks with Roles, applied to an imported Activity, with Roles filled by matching the Invite's guests to Persons by email and an empty Role raising a Review item. Prep and Follow-ups. Playbook-timed Check-ins that follow their Task's Due. The Reminder for an Activity about to start with open Prep, and a Review item when a cancelled Invite still has open Prep.

This is the most distinctive part of ASYS: [the tool research](research/existing-tools.md) found every surveyed tool falling short on it (Reclaim's buffer blocks and ClickUp's date remapping come closest). It needs only the MVP's read-only import, makes S6 complete apart from Place, and proves the engine that S1, S3, S4, S7, S9, S11 and S12 need. It is a stage of its own because it is the riskiest code and deserves a proven daily loop first.

*Already in the MVP*: dates stored as materialised local dates rather than resolved lazily, so the Picker and the offline store do not change; the tested Offset resolver; stable identities and change-log entries for imported Activities; unique Person emails; the `dated_by_hand` flag; job dedupe keys; open-text Review item kinds with dedupe keys. **Proposed**: Playbooks are first authored as JSON validated by the contract schema, with a live date preview, and the scenario Playbooks become seed fixtures. Playbook items leave out Place until Stage 4 adds it as an optional field.

### Stage 2: Occasions and writing to Google Calendar

Occasions created from Playbooks; Activities authored by ASYS; Series of Activities and Occasions on the 8-week Occurrence horizon; the Skipped cascade (open Prep Skipped, Activity Cancelled); Upcoming and Past; the Weekly review as a real recurring Activity. ASYS-authored Activities are written to Google Calendar as one event per Occurrence (ADR 0001), and a time change made in Google to one of them is accepted as the User's own edit. Privacy (Visible, Private, Hidden) takes effect, with the core reducing the data before the add-on sees it (ADR 0005), and notifications follow each item's Privacy. The Person page lists the Series bound to a Person, and a manual Anonymise raises a Review item while such a Series is active. Guests are stored but not yet sent.

This is the first point at which anything reaches the employer's Workspace, which is why the Privacy reduction is built here and not earlier. It needs a dry-run mode and a kill switch before the first real write, and property tests showing that no title, Notes, location, Person name or Voice leaves in a Private or Hidden item.

*Already in the MVP*: the generic series table and unique Occurrence key; the Activity `origin` column, ASYS-only fields kept apart from Google's, and a nullable needed Voice (which Playbook Activity items now fill, such as Closed door on the S1 and S3 calls); nullable Privacy on Tasks and Activities with Area defaults; generic notification text; incremental OAuth scopes; non-cascading Person keys.

### Stage 3: Guests, Invites and Groups

Guests on ASYS Activities (Persons, Groups invited through their Google Group addresses as a whole, and Roles), with Google sending Invites, updates and cancellations, and an Activity with Guests never Hidden. Groups, first with members kept by hand (the fallback ADR 0001 requires), then with members read from Google Groups. Per-member copies of a Playbook Task, made once when it becomes Available, leaving out the Persons who fill the Occasion's other Roles; a dependant Blocked until the copies exist; a Review item for each member without a Person.

It comes after Stage 2 because only a Playbook Task can be copied per member. The trial proved `memberships.list` against the real Workspace, but it returns direct members only and needs the sensitive `cloud-identity.groups.readonly` scope, so nested groups stay hand-kept.

*Already in the MVP*: Person email as the matching key; the reserved `member_template` Task kind; the Blocked reason union; a Connection that can hold several scopes; Review item dedupe keys.

### Stage 4: Places and Voice clash

Places with a position, a radius and a Voice (asked for when created); Tasks limited to Places; the position read when Now opens, with nothing left out while it is unknown; the Place step of Current voice; Voice clash warnings shown inline when the User causes one, and one Review item per pair when one arises by itself, moving nothing.

Places depend on nothing after the MVP and can be pulled forward on their own if picking a Voice by hand turns out not to be enough. Voice clash needs Activities that ASYS authors and moves, so it waits for Stage 2. A PWA can only check the position while it is open; alerts on arrival would need a native app.

*Already in the MVP*: Picker exclusion reasons as an extensible union, Current voice accepting a Place voice, the ordered Voice comparison, and dedupe keys for one Review item per pair.

### Stage 5: Google Tasks

Capture from every Google Tasks list (including Tasks created from Gmail) into the Inbox, and a mirror into the Google Tasks list of each Task's Area under its Privacy: Visible with title and notes, Private with the title only, Hidden not at all. Delegated Tasks are not mirrored while their Check-ins are. Ticking off works both ways, and the notes carry a line linking back to ASYS (ADR 0001, 0005).

It needs Privacy from Stage 2 and has the hardest sync (Google Tasks has no change notifications, so it polls). Quick add and the share sheet cover capture until then. If capture from Gmail is missed early, the import-only half can be split off and pulled forward.

*Already in the MVP*: the raw capture text; Check-ins as separate Task rows; the Privacy columns. The add-on keeps the external references and the Area-to-list mapping in its own schema.

### Stage 6: planning aids and polish

Subtasks (one level, sharing their parent's Anchor, not inheriting its Voice); Floating recurrence; Time blocks; the rest of the Weekly review (untouched Time blocks, coming Occasions, acting on Delegate and Drop suggestions); parsing a captured line for its dates, Area, Place, Person, Importance and Estimate; Triage of several Tasks at once; the list of Tasks whose Due moved several times; Undo of queued commands; a form-based Playbook editor; a manual "plan my day" (ADR 0002). No scenario criterion needs any of these, and each is additive, so each can be pulled ahead of Stage 1 on the evidence of real use. Subtasks are the likeliest candidate.

*Already in the MVP*: the Due-move counter, the raw capture text, the series `mode` column, and Weekly review sections as named queries.

### Stage 7: open platform

Sign in with Google (name and email only), API tokens, a pushed change stream, Google Calendar push channels with renewal jobs and the webhook-route extension point, the MPL-2.0 domain and contract packages published with semantic versions, published OpenAPI documentation, the prerendered `site` app (ADR 0008), and the Todoist and Trello importers. None of this helps the single User's day, and polling is enough for one User.

*Already in the MVP*: sign-in identities apart from Connections; the lookup-function pattern, so each new pre-owner lookup is one more function; an additive-only `/v1`; the rules version and changelog; a contract package free of server code; SPDX headers.

### Not planned

Alerts on arrival at a Place (native app only, since the web Geofencing API was abandoned) and organisation-level collaboration (out of scope; ADR 0007 notes it would reopen the one-owner-per-record rule).

## Where each glossary term lands

| Where | Terms |
|---|---|
| MVP | Task, Estimate, Notes, Area, Active hours, Working day, Current time zone, Available from, Due, Overdue, Effective due, Latest start, Available, Blocked, Importance, Urgency, Urgency window, Quadrant (Do, Plan, Delegate, Drop, as labels), Open, Done, Dropped, Delegated, Check-in, Outcome, Take back, Person, Series, Occurrence, Fixed recurrence, Skipped (for Task Occurrences), Inbox, Triage, Review item, Picker, Now, Not here, Gap, Today, Voice (Silent, Out loud, Closed door), Current voice, User, Sign-up link, Connection, Add-on (Google Calendar import, Web Push) |
| MVP, cut down | Activity, Busy, Free, Workable, Cancelled and Invite (imported from Google only); Offset (the value type and resolver, without Anchors); Reminder (the Morning briefing only); Morning briefing (generic text only); Weekly review (a screen opened by a Task Series) |
| Stage 1 | Anchor, Offset (applied to moving Anchors), Prep, Follow-up, Detach, Attach, Playbook, Role |
| Stage 2 | Occasion, Upcoming, Past, Privacy (Visible, Private, Hidden), Anonymise (the manual action only) |
| Stage 3 | Guest, Invite (sent), Group |
| Stage 4 | Place, Voice clash |
| Stage 6 | Subtask, Floating recurrence, Time block |
| Add-ons | Google Tasks (Stage 5); Todoist and Trello importers (Stage 7) |

## Scenario coverage

"MVP" lists the acceptance criteria of [scenarios.md](scenarios.md) that pass in the MVP with hand-made Tasks instead of Playbooks. A criterion with a later half is listed as partial.

| Scenario | MVP | Later |
|---|---|---|
| S1 Monthly 1:1 call | none | Stage 2: 1, 2 (Google's cancellation to the Guest in Stage 3), 5, 6. Stage 3: 3, 4. Stage 4: 7. Until then: a first-Tuesday Task Series for the talking points, with the call made in Google and imported. |
| S2 Team lunch | 4, 7, 8; 5 with the Check-in dated by hand | Stage 1: 5 timed by the Playbook. Stage 2: the date moves in 3. Stage 3: 1, 2, Google's update in 3. Stage 5: 6. |
| S3 Onboarding | 3, 6; the Check-in date in 5 | Stage 2: 1, 2, 7, 8. Stage 3: 4. Stage 4: 9. Stage 5: the mirror half of 5. |
| S4 Offboarding | 5; the Check-in dates in 6, set by hand | Stage 2: 1, 2, 7, 8. Stage 3: 3, 4. Stage 5: the mirror half of 6. |
| S5 Month-end hours | 7, 9 (with the train imported as a Workable Activity, or Silent picked by hand); the date rule of 1 as a Task Series | Stage 2: the Occasion in 1, and 8. Stage 3: 2, 3, 4, 6. Stage 5: 5. |
| S6 Candidate interview | 1, 5 | Stage 1: 2, 3, 4, 6, 8. Stage 5: 7. Place Office on the Prep is Stage 4 (not a criterion). |
| S7 Birth leave | 3 | Stage 1: Detach in 2. Stage 2: 1, 2, the dates in 6. Stage 3: 4, 5, the signature copies in 6. |
| S8 Year-end leave | 1, 2, 3, 5, 6, 7, 8; 9 with Out loud picked by hand | Stage 4: the Place half of 9. Stage 5: 4, which holds until then only because nothing is mirrored. |
| S9 Birthday card | 6 | Stage 2: 1, 7, 8. Stage 3: 2, 3, 4. Stage 5: 5. |
| S10 Evening session | 4, 6 | Stage 2: the date moves in 3. Stage 3: 1, 2, Google's update in 3. Stage 4: 5. |
| S11 New client placement | 6, 7; the Check-in date in 5; the Silent train and hand-picked Closed door in 9 | Stage 2: 8. Stage 3: 1 to 4. Stage 4: the Out loud Office half of 9. Stage 5: the mirror half of 5. |
| S12 Client intake | none | Stage 2: 3 (dates), 4, 5, 6. Stage 3: 1, 2, Google's update in 3, 7. Until then: both sessions made in Google and imported. |

Criteria that hold only because a feature is missing (such as S8.4 and S6.7, where nothing is mirrored) are tagged with the stage that makes them a real check, not counted as covered.

## Definition of done

1. Every MVP criterion in the table above runs as an executable test against `libs/domain`, with the scenario's real 2026 dates; every other criterion exists as a pending test tagged with its stage.
2. The owner-isolation tests of ADR 0007 pass with two owners, and the table-enumerating RLS test is green.
3. For two consecutive weeks of real use, all new work is captured in ASYS and the old task app is not opened to add anything. The old backlog is moved in by hand, or by a one-off script that posts it to the capture command.

## Risks

- **The daily-value bet.** The MVP leaves out what makes ASYS distinctive (Anchors, Playbooks, Groups). If Now, delegation and Voice are not clearly better than the old tool, Stage 1 never gets real use. The two-week gate tests this early, and Stage 1 comes next.
- **Google's publishing status.** The trial found the Google app External in Testing mode, where test sign-ins expire after 7 days and production use needs verification. A weekly re-consent would break the calendar import and every later Google stage, so this is settled before Slice 2, by checking the real refresh-token behaviour rather than assuming it.
- **The employer can cut the work account** (ADR 0006). Sign-in survives, but Today and Gaps go empty, with the re-authorisation Review item as the only signal.
- **Row-level security per table.** Drizzle cannot emit FORCE, so every table, add-on schemas included, needs hand-written SQL; the enumerating test is the guard.
- **Time semantics** are the likeliest source of subtle bugs: date-only versus instant, end-of-day Due after a time zone change, Working-day and month Offsets across daylight saving time, and later, exactly-once Anchor moves. They are built and property-tested in `libs/domain` before the screens.
- **Change-log ordering.** If numbers are not serialised per owner, a client can read past a number that commits later and miss a change; the counter row is tested with concurrent writers.
- **Pinned release candidates** (ADR 0009) block upgrades: keep the persistence layer thin and upgrade Effect and Drizzle together as a planned task.
- **No unit-test runner in the PWA** until the vitest split with Angular is settled (ADR 0010), so logic stays in `libs/domain` and components stay thin.
- **Capture speed on the phone** is weaker than in native apps (no widget or assistant), and the share sheet depends on the installed PWA's share target. A slow capture path is the likeliest reason to fall back to the old tool.
- **iOS** must still be supported, but Web Push and the share target are proven on Android first and not yet checked on iOS.
- **The public hostname** is bound into passkeys, Web Push and the Google redirect; changing it after enrolment breaks sign-in.
- **The scenarios were written from the same model as the design**, so passing them proves consistency, not fit with real use. The two-week gate, and the first real month-end and onboarding after Stages 2 and 3, are the real test.
- **ASYS becomes the only home of the User's Tasks** (ADR 0001). Backups stay out of scope because the VPS handles them, but losing the database costs more once ASYS is the daily tool.

## Open questions

1. Where does the current backlog live (Google Tasks, paper, another app)? If it is Google Tasks, the import-only half of Stage 5 may move forward.
2. Is the proposed Picker ranking right: Overdue, then Quadrant (Do, Plan, Delegate, Drop), then earliest Latest start, then Estimate fit?
3. When is a Task Occurrence created: when it becomes Available, whether or not the previous one is closed (proposed), or only once the previous one is closed, which avoids stacking missed weekly Tasks?
4. What is the default Check-in for a Delegated Task without a Due? The glossary only defines one day before the Due.
5. Are the proposed Check-in defaults right (Importance of its Task, a 5-minute Estimate, Available from the start of its day)?
6. Is Workable time such as the train ride in Google Calendar? If not, the MVP only has the Voice picked by hand, and S11.9's reason text needs either local-only Activities or Stage 2.
7. How are imported all-day events (leave, holidays) handled, and do they end a Gap?
8. Is the Weekly review as a screen opened by a Task Series acceptable until Stage 2?
9. Which Area's Active hours decide the Working days of an anchored item whose Area differs from its Anchor's (S4 puts 'Disable accounts' in IT under a People Ops Occasion)? Proposed: the Area of the item being placed. This must be settled before Stage 1.
10. Is authoring Playbooks as validated JSON acceptable for Stage 1, with the form editor in Stage 6?
11. Which public hostname will the passkeys be bound to, and is a CLI-printed Sign-up link acceptable for the first User?
12. Should a date-only Due set in one time zone keep its end-of-day meaning in the new zone after travel (proposed), or keep its original instant?
