# Ideas from existing tools

On 2026-09-28 fourteen task and calendar tools were scored against fifteen weighted criteria taken from [CONTEXT.md](../../CONTEXT.md), the [ADRs](../adr/) and [scenarios.md](../scenarios.md), each criterion from 0 (not possible) to 3 (fully covered), with two hard constraints: an Android app or good web app, and Google Calendar integration. The best tool, Amazing Marvin, reached 54.3 out of 100, ahead of ClickUp (48.7) and TickTick (47.7), and both judging passes concluded that building ASYS still makes sense.

| # | Tool | Score /100 | In short |
|---|---|---|---|
| 1 | Amazing Marvin | 54.3 | Richest personal task model and native Eisenhower matrix; no places, no movable-anchor playbooks |
| 2 | ClickUp | 48.7 | Best template date remapping; weak on people, meetings and places |
| 3 | TickTick | 47.7 | Strong Android daily driver with geofenced places; no scheduling, no relative-date templates |
| 4 | Motion | 46.0 | Strongest always-on auto-scheduler; weak Android app, no places |
| 5 | Todoist | 44.3 | Polished Android app; deliberately no start dates, no scheduling brain |
| 6 | Morgen | 44.0 | Strong calendar layer with Swiss/EU core hosting; thin as a task manager |
| 7 | Akiflow | 41.3 | Good time-blocking inbox; no templates, no public API |
| 8 | Asana | 40.0 | Relative-date process templates; Google Calendar is one-way |
| 9 | Reclaim.ai | 37.7 | Calendar layer for a stack; no native mobile app |
| 10 | Tasks.org | 36.3 | Only open, EU-self-hostable tool that passes (borderline); no web app, no planning |
| 11 | monday.com | 33.7 | Generic board tool; nothing ASYS-specific |
| 12 | Vikunja | 31.0 | Open and EU-hostable, but fails the Google Calendar constraint |
| 13 | Process Street | 31.0 | Date-field anchors and stop tasks; fails the Google Calendar constraint (Zapier only) |
| 14 | jtx Board | 24.0 | No calendar events at all |

Every tool falls short, with a best score of 1 or 2 out of 3, on what makes ASYS distinctive: Prep and Follow-ups anchored to an Activity, including one from someone else's Invite, that move when it moves; a Task Delegated to a Person who is not a User, with Check-ins until it is done; Playbook items copied once per member of a Group; a Picker that knows the current Place; a Playbook whose Tasks and Activities are offset from an Occasion that can still move afterwards; and a Hidden Privacy level per Area. No tool is both open or EU-hosted and deeply integrated with Google Calendar. Marvin covers the ordinary personal-task layer well; this combination is where ASYS earns its keep.

## Ideas worth borrowing

Each idea names its source in the research evidence. Its status is checked against the glossary, the ADRs and the scenarios: **Already in the design**, **Worth adding** (a small change that fits the model) or **Later** (fits something the design defers).

### Now and the Picker

- **Amazing Marvin, Backburner.** Items whose start date is still in the future, and items waiting on a dependency, move to a visible Backburner list instead of disappearing. ([start dates](https://help.amazingmarvin.com/en/articles/2604753-start-dates); dependencies: Marvin help article 2628279)
  In ASYS: a Task that is not **Available** because its **Available from** has not arrived or it is **Blocked**.
  **Worth adding.** The **Picker** shows only Available Tasks, each with a reason; nothing yet shows the Tasks it leaves out and why (the Available from still to come, or the Task that blocks them).

### Importance, Urgency and Quadrants

- **Amazing Marvin and TickTick, Eisenhower matrix.** Marvin places items in four quadrants with urgency derived from due and end dates; TickTick fills its quadrants from rules with configurable time windows. ([Marvin](https://help.amazingmarvin.com/en/articles/3750593-eisenhower-matrix), [TickTick rules](https://help.ticktick.com/articles/7055782040439881728))
  In ASYS: **Urgency** is derived from the **Latest start** and the **Urgency window**, and the **Quadrant** combines it with **Importance**.
  **Already in the design**, and further: Urgency follows the **Effective due** through the chain of blocked Tasks.

### Playbooks and Occasions

- **ClickUp, Remap dates.** Applying a template asks for a new anchor date, and every task keeps its offset from it (for example -7, -3 or +2 days). (ClickUp help centre, "Remap dates in templates")
  In ASYS: each **Playbook** item's **Offset** from its **Anchor**; creating an **Occasion** from a Playbook dates all items at once.
  **Already in the design**, and further: ClickUp documents only the one-time apply, while moving an Anchor in ASYS moves every item anchored below it again, each from its own Offset (S3, S4, S7, S11).
- **Motion, Project Workflow Templates.** Task dates are set relative to a stage's start or end, and a task can be blocked by other named tasks. ([relative dates](https://www.usemotion.com/blog/relative-dates-for-tasks-in-project-workflow-templates), [projects guide](https://www.usemotion.com/help/project-management/projects/projects-how-to-guide))
  In ASYS: an **Offset** is relative to the start or the end of its **Anchor**; Anchors chain (a Task anchored to an Activity anchored to an Occasion), which plays the part of a stage; a Task can be **Blocked** by several others.
  **Already in the design** (S3's "Set up IT accounts for Fatima" and S7's engraving Task each wait on two Tasks).
- **Process Street, dynamic due dates, Stop Tasks and scheduled runs.** Tasks are due relative to the run's start, its due date or a date field on the run; Stop Tasks hold later steps until earlier ones are done; whole workflows can run on a monthly or yearly schedule. ([dynamic due dates](https://process.st/help/docs/dynamic-due-dates/), [stop tasks](https://process.st/help/stop-tasks/), [scheduled runs](https://process.st/help/docs/scheduled-workflow-runs/))
  In ASYS: the dated field is the **Occasion**, the gate is a Task **Blocked** by every per-member copy, and the scheduled run is a **Series** of Occasions made from a Playbook.
  **Already in the design** (S5's "OK to billing team" and S9's "Give card to Mila" wait on every copy; S1, S5 and S9 are Series of Occasions).

### Anchors and meeting Prep

- **Reclaim.ai, Buffer Time.** Prep and decompression blocks are added before and after any calendar event, including ones organised by others, and move when it moves. ([Smart 1:1s overview](https://help.reclaim.ai/en/articles/5604990-smart-1-1s-overview); that it covers any meeting comes from third-party summaries)
  In ASYS: **Prep** and **Follow-ups** anchored to an **Activity**, including one from someone else's **Invite**.
  **Already in the design**: a Playbook applied to an imported Invite anchors its Prep and Follow-ups to it, so they move when the organiser moves it ([ADR 0001](../adr/0001-asys-owns-all-data.md), S6). ASYS does this per Activity rather than for every meeting, and its Prep are Tasks, not calendar blocks.
- **Motion, chunking.** One task's estimate is split across several calendar blocks. ([task reference](https://www.usemotion.com/help/project-management/task))
  In ASYS: a **Time block** is reserved for one Task, and the **Estimate** is what that Task still needs.
  **Already in the design**: nothing limits a Task to one Time block, and you lower the Estimate as you make progress. Motion also places the chunks automatically; the design has no counterpart for that, since the Picker suggests rather than schedules.

### Delegation and Check-ins

- **Amazing Marvin, Bug Me.** A recurring nag, useful for chasing follow-ups. ([Bug Me](https://help.amazingmarvin.com/en/articles/8950753-bug-me))
  In ASYS: the **Check-in** on a **Delegated** Task.
  **Already in the design**: closing a Check-in with the **Outcome** Not yet creates the next one, by default on the next **Working day**, until Done or **Take back** (S2, S3, S5, S8, S9, S11).

### Privacy and Google Calendar

- **Morgen, Busy Calendars and Calendar Propagation; Reclaim.ai, Visibility.** Morgen keeps event details private and shows others only busy or free, and lets the user choose which events, with how much detail, are copied from one calendar into a shared work calendar. Reclaim has a per-item visibility control (option labels unverified). ([busy calendars](https://www.morgen.so/guides/set-up-your-busy-calendars), [calendar propagation](https://www.morgen.so/guides/how-to-use-morgens-calendar-propagation-workflow), [Reclaim tasks](https://help.reclaim.ai/en/articles/5108936-overview-what-reclaim-tasks-are-and-how-to-create-and-use-them))
  In ASYS: **Privacy**. Private lets colleagues see only that you are busy, Hidden writes only a placeholder title, and each **Area** sets a default.
  **Already in the design**, and further: the core strips the details before Google receives them ([ADR 0005](../adr/0005-calendar-privacy.md)). Copying events in from a second, personal calendar is not covered.

### The Google Tasks mirror

- **Tasks.org and Reclaim.ai, Google Tasks sync.** Tasks.org syncs a whole Google Tasks account both ways; Reclaim syncs only one dedicated list, so tasks created from Gmail into other lists are missed. ([Tasks.org](https://tasks.org/docs/sync_google_tasks/), [Reclaim](https://help.reclaim.ai/en/articles/4293077-overview-reclaim-s-integration-with-google-tasks))
  In ASYS: Google Tasks is a place to capture Tasks and to see and tick off open ones ([ADR 0001](../adr/0001-asys-owns-all-data.md)); what is mirrored follows **Privacy** ([ADR 0005](../adr/0005-calendar-privacy.md)).
  **Already in the design**, avoiding Reclaim's trade-off: ASYS captures from every Google Tasks list, so tasks created from Gmail are not missed, and mirrors each Task into the Google Tasks list of its **Area** ([ADR 0001](../adr/0001-asys-owns-all-data.md)). Unlike Tasks.org it deliberately mirrors only part of the model: Hidden and Delegated Tasks stay out of Google.

### Inbox and Triage

- **Vikunja, Quick Add Magic.** One typed line is parsed into dates, labels, assignees, priority and project. Todoist's Ramble captures tasks from speech. ([Quick Add Magic](https://vikunja.io/help/quick-add-magic/), [Todoist 2026 changelog](https://todoist.com/help/articles/2026-changelog-HD3jJAtLd))
  In ASYS: capture into the **Inbox**, then **Triage**, which gives a Task its **Importance** and **Estimate**.
  **Worth adding**: parsing a captured line for its Due, Available from, Area, Place, Person, Importance and Estimate leaves less for Triage without changing what Triage means.
- **Akiflow, universal inbox and Rituals.** One inbox with bulk actions, and recurring time blocks used for reviews. ([features](https://akiflow.com/features), [time blocking and Rituals](https://product.akiflow.com/help/collections/1069791-time-blocking))
  In ASYS: the **Inbox**, and the **Weekly review**, which is itself a recurring Activity.
  **Already in the design**. Triaging several Inbox Tasks at once is not described, and would be a small addition.

### Weekly review

- **Amazing Marvin, Week Review and Master Review** (unverified). A review that comes up every Monday, and a broader pass that processes the inbox, cleans up projects and sets next actions.
  In ASYS: the **Weekly review**, Friday afternoon unless you change it.
  **Already in the design**. A less frequent, broader review can be a Series of Occasions made from a Playbook, as [ADR 0002](../adr/0002-weekly-execution-scope.md) proposes for a yearly review; there are no Projects to clean up, by the same ADR.
- **TickTick, Suggested Tasks.** A view that sorts tasks into Recently Added, Postponed (due date changed several times), Long Overdue and Upcoming. ([Suggested Tasks](https://help.ticktick.com/articles/7401564165023727616))
  In ASYS: the Weekly review already has you handle **Overdue** Tasks.
  **Worth adding**: showing, in the same step, the Tasks whose Due you have moved several times.

### Places

- **TickTick, Todoist and Tasks.org, location reminders.** A task tied to a named place alerts on arrival (Todoist and Tasks.org also on leaving). ([TickTick](https://help.ticktick.com/articles/7055782395743567872), [Todoist](https://todoist.com/help/articles/use-location-reminders-in-todoist-uGcwH2AJ6), [Tasks.org](https://tasks.org/docs/location/))
  In ASYS: a **Place** has a position and a radius, and the Picker already leaves out Tasks whose Place you are not at (S10).
  **Later, and only with a native app**: a web app cannot watch the phone's location while it is closed (the web Geofencing API was abandoned, see [w3c/geofencing-api](https://github.com/w3c/geofencing-api)), so the PWA cannot alert on arrival. Within the PWA, the equivalent is what the design already does: Now checks your position when you open it and filters by Place.

### Recurrence

- **ClickUp and TickTick, repeat after completion.** ClickUp offers "recur on completion" as a toggle next to the fixed schedule, and TickTick has a "By Completion Date" repeat. (ClickUp feedback board and askyvi.com guide; [TickTick](https://help.ticktick.com/articles/7055782206349770752))
  In ASYS: a **Series** with **Fixed recurrence** or **Floating recurrence**.
  **Already in the design**; the glossary's example is "two weeks after the last coffee check".

### Imports and the API

- **Vikunja, migrators and API.** OAuth-based Todoist and Trello migrators, and a REST API v2 with an OpenAPI 3.1 spec. ([migration](https://vikunja.io/docs/migration-from-third-party-services/), [API v2](https://vikunja.io/docs/api-v2/))
  In ASYS: Todoist and Trello importers as **Add-ons**, using a **Connection** where they need one.
  **Already in the design**: [ADR 0003](../adr/0003-core-add-ons-and-api.md) lists the importers among the Add-ons and exposes the core through a versioned API (`/v1`, additive changes only), and [ADR 0009](../adr/0009-effect-v4-and-drizzle-1-pinned.md) builds that API and its OpenAPI description with Effect's HttpApi.

## Licences

Tasks.org and jtx Board are GPL-3.0 and Vikunja is AGPL-3.0, so their ideas are borrowed as ideas only, never as code. [ADR 0011](../adr/0011-license-eupl-and-mpl.md) puts ASYS under EUPL-1.2 (its domain and contract packages under MPL-2.0) with only MIT or Apache-2.0 dependencies, and copying their code in would put GPL or AGPL terms on the combined work.
