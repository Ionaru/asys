<!-- SPDX-License-Identifier: EUPL-1.2 -->
# The new Task editor

This plan replaces the Task editor's long form with the maintainer's design from the "Task editing" canvas (column "Final": a card with bottom sheets). Today's editor (`apps/pwa/src/app/features/task/`) has a Save button, native date and time inputs, an Area select, inline Drop and blocker pickers, and the bottom nav underneath. The new one is a full-screen phone screen:
- a top bar with Back, a "Saved" status and More;
- a card with the Title edited in place, Add notes, Importance, an Estimate ruler, rows for Area, Available from and Due that open bottom sheets, and a reason line with a strong QuadrantChip;
- a "Blocked by" section button that opens a sheet;
- a pinned footer with Done and Log progress.

There is no Save button: every change saves at once.

The plan was drawn up on 2026-10-16:
- five readers mapped the shell, the domain helpers, the write path, the tests and the design's CSS against the code;
- a fact check covered the browser and library facts;
- three critics reviewed the draft (codebase fit, behaviour and concurrency, UX and tests), and an Opus judge confirmed 25 of their findings against the code, which are folded in;
- the maintainer settled decisions 1 to 5 the same day.

The work sits outside the slice plan and is done before slice 2, on the branch `task-editor`. Line numbers below were read on 2026-10-16, and the builder re-reads each file before editing it.

## Working agreements

These are slice 1's agreements, in short:

- **One unit at a time,** each with a runnable check. A unit with behaviour gets an implementer and a test-writer from one contract; wiring and styling units go to the implementer alone.
- **Test-first where behaviour can be pinned.** Each new test is seen to fail once for the right reason before the unit counts.
- **One commit per verified piece, when the maintainer asks.** Nothing is pushed unless asked. A push to `main` deploys to production, so the work ends in a pull request.
- **One builder per checkout.** Only one process builds or runs tests at a time.
- **SPDX headers.** Every new file carries the SPDX line in its comment form: MPL-2.0 under `libs/domain/`, EUPL-1.2 elsewhere.

## Decisions

### Decided by the maintainer on 2026-10-16

1. **The bottom nav hides on `/tasks/:taskId`.** The editor draws its own top bar and footer.
2. **What the design leaves out is folded in.** The Overdue and Blocked badges and the Inbox state join the reason line. The Blocked by sheet lists what the Task waits for (with Remove), finds a Task to add, and links the Tasks it blocks. Captured text sits under Notes in the card. Effective due goes, because Latest start already counts dependants.
3. **The reason line uses Now's wording.** It shows the QuadrantChip plus the text Now would show, from one new domain function that explains a single Task, and it previews the unsaved draft.
4. **Dates past the two-week calendar** use an "Other date" field under it.
5. **A Due move counts only when the Due's date changes or the Due is cleared.** Adding, changing or removing its time does not. This is a domain rule change.

### Decided in the plan

6. **What saves when.** Taps save at once: Importance, an Estimate cell, an Area, a date, a time, Remove. Typed values commit on `change` (blur or Enter): Title, Notes, the Estimate's Other minutes, Other date, Other time. The editor keeps a committed copy of Title and Notes, set on `change`, on Enter in the Title, and at each flush point. The patch takes Title and Notes only from that copy, so a half-typed Title is never sent and never rewritten under the caret.
7. **The save loop.** One save runs at a time.
   - **Trigger.** An effect reads a `computed` key: the canonical JSON of `buildSavePatch(baseline, model, committed)`, plus `awaitingSync().has(taskId)`, `leaving()`, the missing and read-only states and a `stopped` flag. It requests a save when the patch is non-empty, nothing blocks it, and the key differs from `lastRefusedKey`.
   - **Queueing.** A request while a send is in flight marks "again".
   - **Building the patch.** The loop waits a microtask, so `#follow` has run against the latest store. It builds the patch at send time and returns without writing any signal when the patch is empty.
   - **After Applied.** It re-baselines from the store and applies `settleSaved` only to the keys the sent patch carried. `#follow` keeps the baseline and model objects when no field changed.
8. **What is never sent.** A blank Title, and an Estimate or Importance cleared to null while the stored one is set. They show as field errors ("Needs a title", "Needs an Estimate", "Needs an Importance") through `p[asys-field-error]` with `aria-invalid` and `aria-describedby`. The rest of the patch still saves.
9. **Outcomes and status.** Two always-present live regions never speak at once.
   - **The top bar's region** reads "Saved" when the last loop ended Applied, nothing is in flight, the patch is empty and no field error from decision 8 holds. Otherwise it is empty.
   - **The status line under it** carries messages. Try again sits next to it, outside the region.
   - **Failed:** the outcome message plus Try again, which rebuilds the patch from the current draft. The loop also asks the store for a poll.
   - **Rejected or KeyReused:** the message, and the key is remembered, so it is not resent until a field changes.
   - **NotApplicable:** the message, autosave stops and the card turns read-only, so no further Review items are made.
   - **Applied but the follow-up poll failed:** the loop stops and the sync note shows. The effect resumes once `awaitingSync` no longer holds the Task.
10. **Flushes and actions.**
    - **Flush points.** Each one commits the text and requests a save: Done (before `DoneUndo.complete`), destroy, and `visibilitychange` to hidden or `pagehide`. The last two send through `DataApi.runCommand(command, key, { keepalive: true })` with `CommandAttempts.keyFor`, as `DoneUndo` does.
    - **After destroy.** The loop finishes its in-flight send and sends at most the one patch flushed at destroy.
    - **When nothing is sent.** Nothing is sent while `leaving()` holds, while the Task is missing from the store, or while the card is read-only.
    - **Done.** Done is disabled only by `leaving()`, `awaitingSync` and the read-only states, never by an autosave in flight, so one tap is enough.
    - **Log progress and Drop.** Both stay enabled during an autosave. When activated, they wait for the loop to go idle, then send.
11. **Dates and times.**
    - **Quick chips.** Today, Tomorrow, and the first Monday at least two days ahead, each labelled with `formatDay` capitalised ("Mon 19 Oct").
    - **The calendar.** It is a named group of the 14 days from this week's Monday, under an `aria-hidden` Mon to Sun header. Past days are disabled.
    - **Day labels.** They use `formatDate` ("Thu 15 Oct", "Today, Tue 13 Oct", a year only across a year boundary). Today has `aria-current="date"`, and every chip and day has `aria-pressed`.
    - **Picking and removing.** Picking a date keeps the time. "Remove Due" or "Remove Available from" clears date and time; "Remove time" keeps the date.
    - **Time chips.** 09:00, 10:00, 12:00, 14:00, 17:00 and 18:00.
    - **Closing.** Any pick closes its sheet, including a valid Other date or Other time committed on `change`.
12. **Sheets are native `<dialog closedby="any" autofocus>` opened with `showModal()`.**
    - **What it gives.** A focus trap, Escape, a tap on the backdrop, the top layer above the shell's fixed bars, and focus returned to the opener. The dialog itself takes focus, so the Blocked by sheet does not raise the Android keyboard.
    - **The body.** It comes from a projected `<ng-template>` rendered only while open.
    - **Motion.** Enter only, with a `@starting-style` rise and a backdrop fade on the motion tokens; closing is instant. The kill switches gain `*::backdrop`.
    - **Placement and focus.** Every sheet sits outside its opener's conditional, and focus falls back to the hidden `h1` when the opener is gone.
13. **jsdom has no `showModal` or `close`.** A setup file `apps/pwa/src/test-setup.ts` gives `HTMLDialogElement` minimal `show`, `showModal` and `close` through `Object.defineProperty`.
    - **Wiring.** It goes in through `setupFiles` in the pwa `test` target, `tsconfig.spec.json`'s `include` and `tsconfig.app.json`'s `exclude`.
    - **What unit specs cover.** The open state and Close.
    - **What e2e covers.** Escape, the backdrop and focus return.
14. **The Title morph moves to the Title `textarea`.**
    - **The textarea.** It carries `task-editor__title`, `data-task-id`, `data-morph`, `aria-label="Title"`, `enterkeyhint="done"` and `field-sizing: content`.
    - **Enter and newlines.** Enter and a line-break `beforeinput` commit without a newline, except while composing. Newlines typed or pasted become spaces.
    - **The heading.** A visually hidden `h1` (`task-editor__heading`, the stored title, no `data-task-id`) is the page heading and the focus fallback.
    - **The shell.** `ShellLayout.#focusTitle` focuses only an element marked `data-focus-title`, which Now's titles carry beside `data-task-id`; the textarea carries none. (The first build skipped form controls by tag name; the review of 2026-10-17 replaced that with the marker.)
15. **Icons.** `ChevronLeft` (Back) and `Clock` (the time button) join `IconName`. The design mirrors chevron-right and draws its own clock.
16. **`--scrim`.** It is a token of its own group in `libs/design-tokens/src/themes/*.tokens.json`: light `#1a1d20` at 40%, dark `#000000` at 60%, Voice only `#000000` at 70%.
    - **Wiring.** `'scrim.*'` joins `SCHEME_TOKENS` in `terrazzo.config.mts`, and `scrim` joins `ThemeFile` in `scripts/palettes.mts` with a cross-theme presence check. The 9 palette files are regenerated.
    - **The check.** `--scrim` must appear in all 13 blocks of the built tokens CSS.
    - **The design system.** The note goes to the design system artifact only with a go-ahead.
17. **The Estimate ruler** is a `layout` of `EstimateField`. Triage keeps the chips. In the ruler, typed Other minutes commit on `change`.
18. **Blocked by summary.** "Waits for no other Task." / "Waits for Bravo task." / "Waits for A and B." / "Waits for A and 2 more.", then " No Task waits for this one." / " 1 Task waits for this one." / " 3 Tasks wait for this one."
19. **Domain 0.7.0.** One rule change (decision 5) and new API: `explainTask`, `addDays`, `isoWeekdayOf` and `formatDate`.
20. **The nav flag.**
    - **The route.** Route `data.hideNav: true` on `tasks/:taskId`.
    - **Reading it.** The shell reads it from the leaf route after each successful navigation, through a `leafRoute` helper extracted from `routeMotion`.
    - **What it changes.** The host class `shell--bare` sets `--shell-nav-height: 0px` in CSS (not inline, so the height observer's cleanup cannot undo it) and drops the page's top padding.
    - **View transitions.** On Push the nav's view-transition groups exist only on the old side and fade out; on Pop they exist only on the new side and fade in.

## The pieces

| Piece | Delivers | Check |
|---|---|---|
| 1. Foundations | Domain 0.7.0 (`explainTask`, date helpers, Due moves), `--scrim`, `asys-sheet` with the jsdom setup file and two icons, the nav hidden on the editor | Domain and PWA lint, typecheck, test and build; `palettes.mts --check` |
| 2. Controls | `asys-date-pick`, `asys-time-pick`, `asys-date-spec-row`, `asys-choice-row`, the Estimate ruler, SectionHeader's open action | PWA lint, typecheck, test and build |
| 3. The editor | `buildSavePatch`, `previewTask`, `blockerSummary`, `asys-task-blockers`, the editor rewritten with autosave | PWA checks and `nx e2e pwa-e2e` |
| 4. End to end and docs | `editor.spec.ts` rewritten, the view-transition, phone-width and known-limits specs updated, the docs | The whole CI table |

## Piece 1: foundations

**U1 Domain** (`changing-a-domain-rule`)
- `time/zoned.ts`: `addDays(date, days): LocalDate` and `isoWeekdayOf(date): IsoWeekday`, on Temporal plain dates.
- `time/display.ts`: `formatDate(date, today)` ("Thu 15 Oct", with the year when it differs), with `formatDay` built on it.
- `picker/explain.ts`: `enum TaskExplanationTag { Available, Waiting, Inbox, NotOpen }` and `explainTask(task, tasks, links, settings, now)`. It ignores the Current Area. Its results by tag:
  - **Available:** `{ reason, reasonText }`.
  - **Waiting:** `{ reason, reasons, reasonText }`, where the text is the Waiting text and the reason is computed as for an Available Task.
  - **Inbox** and **NotOpen.**
- The Reason computation moves out of `pick`'s loop into a helper both use. A `fast-check` property checks that `explainTask` agrees with `pick(..., areas.map((a) => a.id))` for every Task that `pick` ranks or lists as Waiting.
- Decision 5 in `commands/task-commands.ts` and its spec.
- `RULES_VERSION` 0.7.0 and a CHANGELOG section.

**U2 Scrim token and kill switches:** decision 16, then `*::backdrop` in both kill switches of `apps/pwa/src/styles.css`.

**U3 `ui/sheet`:**
- the `asys-sheet` dialog with the grip, an `h2` title, an icon-only Close button, and the body template rendered only while open;
- `open = model<boolean>(false)` and `title = input.required<string>()`;
- decision 13 and the two icons.

**U4 Shell:** decision 20 and the `#focusTitle` change from decision 14, with `shell-layout.spec.ts` and `app.routes.spec.ts`.

## Piece 2: controls

- **U5 `ui/date-pick` and `ui/time-pick`:** the sheet bodies from decision 11.
- **U6 `ui/date-spec-row`** (`FormValueControl<DateSpec | null>`):
  - a row button that opens a date sheet;
  - while a date is set, a trailing time button (Clock, the time; "Due at 17:00, change time" or "Add a time") that opens a "Time" sheet with "Due tomorrow" as context.
- **U7 `ui/choice-row`** (`FormValueControl<string>`): a row that opens a sheet of `aria-pressed` options, used for the Area.
- **U8 The Estimate ruler:** decision 17.
- **U9 SectionHeader's open action:**
  - `aria-haspopup="dialog"`;
  - a trailing icon;
  - no body;
  - an `activate` output.

## Piece 3: the editor

- **U10 Pure helpers** in `features/task/`: `buildSavePatch(baseline, draft, committed)`, `previewTask(task, draft)` and `blockerSummary(waitsFor, blocksCount)`.
- **U11 `asys-task-blockers`:**
  - the open-action SectionHeader and its sheet: Waits for with Remove, "Find a Task" and its candidates, the blocker message, and Blocks as links;
  - the AddBlocker and RemoveBlocker logic, moved unchanged;
  - after an add the sheet stays open and focus goes to "Find a Task"; after a Remove, focus goes to the next Remove.
- **U12 The editor rewritten.**
  - **Top bar.** Rendered in every state: Back, the Saved status, and More while Open.
  - **Heading and status.** The hidden `h1` and the status line.
  - **The card.**
    - Title, Notes or "Add notes", Captured text.
    - Importance, the Estimate ruler, the Area row, and the Available from and Due rows.
    - The reason line from `explainTask(previewTask(...))`.
  - **Under the card.** The blockers section, then a sticky footer with Done and Log progress (its sheet holds `asys-log-progress-form`).
  - **The More sheet.** Drop through `asys-inline-confirm`.
  - **Autosave.** Decisions 6 to 10.
  - **Removed.** `DateSpecField` and its spec, since the editor was its only consumer.

## Piece 4: end to end and docs

- **`editor.spec.ts`** is rewritten. It checks:
  - the hidden nav and Back;
  - a Due through the sheets and 45 min, then "Saved" and the TopPick's Latest start;
  - a Title edit;
  - Done in one tap after typing or a tap;
  - the Blocked by sheet;
  - Drop through More;
  - Escape and the backdrop closing a sheet, with focus back on its opener.
- **`view-transitions.spec.ts`:** the editor side of the morph becomes the textarea, and the nav groups must not paint over the page on Push and Pop.
- **`phone-width.spec.ts`:** the centred-nav check moves to `/settings`, and the editor's footer must cover no part of the card.
- **`known-limits.spec.ts`:** the two Due tests go.
- **Docs.** This plan's summary and known limits move into `docs/slice-1-plan.md` "Pulled ahead before slice 2", and this file goes. `AGENTS.md`, the design-tokens README, `building-pwa-ui` and the domain CHANGELOG are updated.

## Known limits

- **Reopened editors.** An editor reopened on the same Task cannot see the previous editor's last flushed send. If both change the same field within one round trip, the older value can land last.
- **The Undo bar.** It is inert while a sheet is open, and its window keeps running.
- **Failed sends that applied.** A Failed send whose request did apply on the server can be overwritten by the next poll's baseline. This is true today with Save.
- **Due moves.** Correcting a mis-tapped Due date counts one Due move.
- **Unverified.** It is not known whether a tap on `::backdrop` closes a `closedby="any"` dialog on Android; the phone check decides. The e2e suite runs Chromium only.
- **A Done and the page going away.** A Done waits for the editor's last save before it sends, except when the app is hidden or closed before that Done has gone out, during the Undo window or while it still waits for the save. Then the Done goes out at once with keepalive beside the edit's own send, it can land first, and the edit becomes a Review item.
- **The Undo bar and focus.** While the Undo bar shows on the editor, a focused control can sit under it, because the scroll padding counts only the editor's own bar and footer.
- **A remote rename while typing.** A Title being typed while another device renames the Task can send the other device's title back once. The server takes it as a no-op.

## Facts checked on 2026-10-16

- **Browser support** (MDN browser-compat-data and Playwright's `browsers.json`):
  - `<dialog closedby="any">`: Chrome 134, desktop and Android.
  - `field-sizing: content`: Chrome 123.
  - `::backdrop` inherits custom properties: Chrome 122.
  - `@starting-style` and `transition-behavior: allow-discrete`: Chrome 117.
  - Playwright 1.63.0 runs Chromium 153.0.8010.12.
- **Dialog focus.** `showModal()` focuses the first focusable descendant unless an element, or the dialog itself, has `autofocus` (whatwg/html #8199).
- **jsdom.** 30.1.1 is installed, and 30.1.3 is the newest. Neither has `show`, `showModal` or `close`, and only `open` is reflected (jsdom issue #3294 is open).
- **Angular.** The unit-test builder in `@angular/build` 22.2.1 has `setupFiles`.
- **Font Awesome.** `@fortawesome/pro-regular-svg-icons` 7.3.1 has `faChevronLeft` and `faClock`.
- **The code.** `terrazzo.config.mts` has `SCHEME_TOKENS = ['color.*', 'shadow.*']`, and `editTask` counts a time added to a date-only Due as a move (`task-commands.spec.ts:404`).

## As built (2026-10-16)

Built on 2026-10-16 in the order of the pieces. Each unit with behaviour had an implementer and a test-writer from one contract. Each unit's new tests were then seen to fail for the right reason against planted bugs, with the source restored after:
- the old Due-move rule, and a null Latest start in `explainTask`;
- the sheet's close handler;
- the nav flag, and the focus filter;
- past days enabled, the ruler committing on `input`, and the open action emitting nothing;
- Remove time keeping the time;
- candidates disabled by any send, and `savableDraft` using the typed title;
- four save-loop mutations;
- four editor mutations.

**Departures from the plan**
- **The save loop is a service of its own**, `TaskDraftSaver` (`features/task/task-draft-saver.ts`, unit U12a), provided by the editor next to `CommandAttempts`. The editor (U12b) only renders and wires, so the loop is tested on its own (75 specs) and the editor's spec tests the wiring (103 specs).
- **`TaskDraftSaver` has `resume()` beside `halt()`**, so a Drop that is not Applied lets saving go on.
- **The destroy flush is skipped when the Task has left the store.** A held Done is the usual case, so a Done never resends the edit it flushed itself. `flush()` called directly still sends with the Task gone, as Done needs.
- **The Reason and exclusion-reason computations that `pick` and `explainTask` share** live in the internal `picker/reasons.ts`, which the package does not export.
- **The sheet's title input is `heading`, not `title`**, so it never becomes the host's native tooltip.
- **`DateSpecRow` and `ChoiceRow` keep their sheet state in plain signals.** A first draft declared them as models, which made them public inputs.
- **Reopening More clears a stale Drop confirmation and its message.**
- **The PWA's unit-test builder runs one spec with `--include=apps/pwa/src/...`, not `-- <path>`.** `AGENTS.md` now says so.

**Facts checked on 2026-10-16 (building)**
- The unit-test builder of `@angular/build` 22.2.1 rejects positional arguments ("Schema does not support positional arguments") and takes `--include=<workspace-relative path>` for a single spec.
- jsdom delivers a dispatched `MouseEvent` to a disabled button, while `HTMLElement.click()` honours `disabled`. Specs press a disabled button with `click()`.

**Verification (2026-10-16)**
- **Pieces 1 to 3:** the gates passed. Piece 1 ran `nx run-many -t lint typecheck build test --skip-nx-cache` over all seven projects, plus `format:check`, `check-spdx`, `palettes.mts --check` and the scripts' `tsc`. Pieces 2 and 3 ran the same targets over `pwa`.
- **End to end:** `nx e2e pwa-e2e` passed, 64 tests and none flaky. That run includes the rewritten `editor.spec.ts` (10 tests), the editor parts of `view-transitions.spec.ts` and `phone-width.spec.ts`, and `known-limits.spec.ts` without its Due tests. `capture.spec.ts`'s badge recorder now records each badge once: with the nav inside an `@if`, the badge was seen twice on load, although it popped once.
- **Screenshots** of the editor and each sheet, light and dark at 390 and 375 px, were compared with the design.

**Review (2026-10-16).**
- **How it ran.** A review workflow ran four Sonnet reviewers (correctness and concurrency, accessibility and design, the repo's conventions, and the tests), then an Opus judge who checked each finding against the code.
- **What it kept.** 25 findings, all medium or low. They were fixed in three rounds, each again with an implementer and a test-writer, and each fix's tests were seen to fail with the fix reverted. The two medium correctness findings and the medium accessibility findings were the largest changes.
- **The saver.**
  - An Applied save now follows the store for the fields it did not carry. Before, another device's change that arrived in the same poll could be reverted by the next autosave.
  - A Failed or Refused state clears once nothing is left to save.
- **The editor.**
  - A save's message wins over the Log progress confirmation.
  - Focus goes to the heading when the Log progress or More button is gone as its sheet closes.
  - The editor publishes its bar and footer heights on the root element, and `.task-editor-open` (in `styles.css`) sets `scroll-padding-block` there, so a focused control is not hidden under them (WCAG 2.4.11).
  - The footer wraps at a large Text size.
  - The Title is at least `--tap-target` tall.
  - In the More sheet the confirmation replaces the Drop button.
- **Done.** A held Done waits for the editor's flushed edit: `DoneUndo.complete` takes an optional `after` promise, which its normal send awaits. A keepalive send cannot wait, which is a known limit.
- **Small UI fixes.**
  - Other date explains a typed past date.
  - `ChoiceRow`'s styles and `Sheet`'s template went back inline, per the 100-line rule.
  - `TaskBlockers` members that only the class reads became ES private.
- **Tests.** The remaining test gaps were closed.

**Second review (2026-10-17).**
- **How it ran.** A code review of pull request #30 reported 14 findings: seven correctness, and seven on efficiency, simplification, reuse, conventions and altitude. Each was fixed as a unit with an implementer and, where the behaviour could be pinned, a test-writer, then judged against its contract by an Opus pass. Each new test was seen to fail with its fix reverted or broken by hand.
- **Done and the page going away.** A Done that already left its Undo window but still waits for the editor's save is sent at once with keepalive when the page is hidden or closed, or when `DoneUndo` is destroyed. Before, nothing sent it, and a kill lost it. Its waiting run does the keepalive send itself, so `flush()` resolves exactly when that send has been handled.
- **The editor.**
  - The editors publishing their chrome are counted, so going from one editor to another (`@for` builds the new one before it destroys the old) keeps `.task-editor-open`.
  - Back and Done leave at most once; a second Back no longer goes back two entries.
  - The Undo bar names the Title being saved, not the stored one.
  - The Overdue and Blocked badges come from `isOverdue` and `isBlocked` on the previewed Task again, so an Inbox Task and a Delegated Task show them too.
  - A newline typed or pasted into the Title becomes a space without moving the caret. A textarea's value holds only LF, so no CR case exists.
  - The reason line's preview reads a draft memoised field by field, so typing in the Title or Notes no longer rebuilds `explainTask`.
- **The Blocked by summary** names only blockers that are still Open or Delegated; a link to a closed Task stays in the sheet with Remove.
- **Cleanups.** `observeBlockSize` (`core/platform`) replaces the two copies in the shell and the editor; `routeMotion` walks the route once; the picker's reason types moved to `picker/reason-types.ts`, ending two runtime import cycles; `EditorSheet` replaces a string-literal union; the dead Title validator went; the badge pair is one template.
