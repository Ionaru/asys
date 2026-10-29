<!-- SPDX-License-Identifier: EUPL-1.2 -->
# The new Triage card

This plan replaces the Inbox's Triage card with the maintainer's design from the "Task editing" canvas (page "Triage", column "Final": the action-bar direction). The old card had progress, a heading title, the raw text, Importance and Estimate chips, an "Area: Work Change" select, and a footer with Triage (disabled until both were chosen), Later, Edit and Drop behind an inline confirmation. The new one is a small editor:
- a head with the progress ("1 of 3") and a More button;
- the Title edited in place, Notes or "Add notes", Importance and the Estimate ruler, each with a "Needed" marker in its label, and rows for Area, Available from and Due that open bottom sheets;
- a last line with the strong QuadrantLabel and Now's reason once Importance and an Estimate are chosen, and until then "Pick an Importance and an Estimate to triage.";
- a pinned action bar with Drop and Triage ("Triage as Plan" once it can go);
- an Undo bar after Triage or Drop, as after Done;
- a More sheet with Open in the editor, Blocked by and Drop.

A Triage tapped while Importance or the Estimate is missing changes nothing but the markers and the line under the card, which turn `danger` with an exclamation icon.

The work sits outside the slice plan and is done before slice 2, in pull request #57.

## Decisions

1. **The final column is built.** Later goes, as the design has none, and Edit becomes "Open in the editor" in More. Drop's inline confirmation goes too: Undo replaces it, as for Done.
2. **Triage carries the card's edits.** `TriageTask` takes optional `title`, `notes`, `availableFrom` and `due`, checked and applied as an edit does them (domain 0.8.0). Nothing on the card saves until Triage, so the edits and the triage are one change, the Undo window holds them whole, and a Drop simply discards them.
3. **Triage and Drop get Done's Undo window.** The shell's `DoneUndo` becomes `UndoWindow` and holds one Done, Triage or Drop at a time; a new one sends the one before. `DataStore.hold` takes any of the three. A Triage hold applies only while its Task is in the Inbox at the version it was triaged at, which the command expects, and is let go once the synced Task has left it. Any other command for a Task whose Triage is held waits for that Triage to be sent first. The bar reads "Triaged as Plan" with a check, or "Dropped" with an xmark.
4. **The Undo bar stays the shell's.** It sits on the bottom nav, under the action bar, as it does under the Task editor's footer. The design draws it above the action bar.
5. **The card comes first and the Review items follow it**, as the design system's InboxTemplate has it, now that the card's actions are pinned to the bottom. Slice 1 put the Review items first.
6. **"Needed" belongs to the Label atom** (`need: LabelNeed`, with `None`, `Needed` and `Missing`). SegmentedControl and EstimatePicker pass it through.
7. **ActionBar is an organism** (`footer[asys-action-bar]`): large Buttons in a sticky row on the nav, or on the Undo bar where the nav is hidden. The Task editor's footer uses it too. Triage grows 2:1 against Drop.
8. **Captured text stays** under Notes when it differs from the title, as in the Task editor. The design leaves it out.
9. **Open in the editor saves the person's own changes first**, as one EditTask, then opens `/tasks/:id`. A failure shows its message and stays.
10. **Blocked by opens the Task editor's Blocked by sheet on the Inbox.** TaskBlockers takes `header` (false leaves out its SectionHeader) and a public `open` model. `TaskBlockerActions`, `blockerSummary`, `task-patch` and `task-preview` move to `core/data/` so both screens share them.
11. **The empty card** shows when there is no Inbox Task and no Review item: "Inbox is empty" and "New captures land here.", with "3 of 3 triaged" once Tasks were handled in this visit.
12. **Focus** after Triage, Drop or their Undo goes to the card's `section`, never the Title, so no phone keyboard opens. With no card left it goes to the `h1`. The section names its Task in `data-focus-title`, which the shell now reads, and only the Title carries `data-task-id`, the morph hook into the editor.
13. **A blank Title** shows "Needs a title" and is left out of the Triage, which keeps the stored title.
14. **A refused Triage is announced each time:** the line under the card re-creates its text on every refused tap inside its `role="status"` region.

## The pieces

| Piece | Delivers | Check |
|---|---|---|
| 1. Domain 0.8.0 | `TriageTask` with the four fields, helpers shared with `editTask`, the contract schema | lint, typecheck, build and test of domain, contract, server and pwa |
| 2. Undo window | `UndoWindow`, held Triage and Drop, the UndoBar's status inputs, the shell's focus marker | pwa lint, typecheck, build and test |
| 3. Parts | Label `need`, ActionBar (and the editor's footer), TaskBlockers `header` and `open`, `quadrantWord` | pwa lint, typecheck, build and test |
| 4. The screen | the TriageCard, the InboxTemplate and the Inbox page, the helpers moved to `core/data/` | pwa checks, screenshots |
| 5. End to end | `triage.spec.ts` rewritten, `capture`, `phone-width` and `text-fields.shots` updated, `triage.shots.ts` | `nx e2e pwa-e2e` |

## As built (2026-10-27)

Each piece was built from a written contract with its tests first, then its new tests were seen to fail, by running them against the old code or by breaking the rule by hand and restoring it.

**Departures from the plan**
- **Open in the editor sends only what the person changed.** The Area the card proposes from the Current Area is not saved, so a Task without an Area opens in the editor with No Area although the card showed one. Saving it would set an Area the person never chose.
- **The Undo bar names the Triage's new title**, so it shows the Task as it will be. A Drop names the stored title.
- **The rows of the card set their hosts to `display: block`.** ChoiceRow and DateField hosts are inline elements, so the line between the rows did not paint. The Task editor's rows use the same rule and probably have the same gap; that is left for its own change.
- **Notes stay shown once opened**, even when emptied, so deleting the last character does not remove the field under the caret.

**Verification (2026-10-27)**
- Domain 927 tests, contract 286, server 512, pwa 3578 in 127 files; lint, typecheck and build of every project; the architecture, SPDX and format checks.
- `nx e2e pwa-e2e` passed twice, 73 tests and none flaky.
- Screenshots of every state, light and dark at 390 px, were compared with the design (`triage.shots.ts`), next to shots of the old card taken before the change.
- The initial bundle is 664 kB against its 650 kB warning. `main` was already at 660 kB.

**Review (2026-10-27).** A review of the branch found one correctness bug and one narrow race, both fixed with tests seen to fail against the old logic:
- **A held Triage blocked a Done.** The Undo window ignored any new hold for a Task it already held, whatever the kind, and Now refused a Done while anything of its Task was held. A held Triage leaves its Task on Now and in the editor, so a Done there within the window was dropped without a word. Now only a second hold of the same kind is ignored: a Done or a Drop of a Task whose Triage is held sends the Triage at once and is held itself, and Now refuses only a second Done.
- **A Triage hold could outlive its Apply.** A Triage hold stayed while the synced Task was in the Inbox, so if another device sent the Task back to the Inbox before the next poll, this device kept showing it triaged until a reload. A hold now records the Task's version when it is held, and a Triage hold ends once the synced Task has another version.

**Review (2026-10-29).** The maintainer's review of pull request #57 found 14 points, all fixed:
- **A held Triage now goes first, in one place.** Log progress could reach the server before a held Triage and be rejected for a missing Estimate, an editor autosave could land first and then be overwritten by the Triage, and the editor's Drop could leave a stale Undo Triage behind; the first review's fix covered only a Done or a Drop through the Undo window. `DataStore.send` now waits for a held Triage of the command's Task: the shell's `UndoWindow` registers a sender (`onHeldTriage`) that sends the held Triage at once, or waits for one already on its way. Only Triages count, so a held Done that waits for the editor's save cannot deadlock with it. A keepalive send on a hide waits for an earlier send of the same Task, so a Done never overtakes its Triage there.
- **A Triage expects its version.** The Triage carries `expect.version`, so another device's change during the window makes it not apply, and the Undo bar says so, instead of overwriting that change. A second, different Triage of the same Task replaces the first, and each hold gives the Undo bar its own window key, so the ring restarts when a Done replaces a held Triage. The `Hold.version` of the first review goes.
- **The Inbox.** The More and Blocked by sheets close when the card's Task changes, and Drop, Triage and Open in the editor carry the Task they were tapped for. The shell publishes the open quick add's height, and the action bar rides above it.
- **Cleanups.** Triage and Open in the editor build their patches with `buildSavePatch`, so the blank-title rule lives in one place; the UndoBar takes all its copy from `UndoWindow`; Label's styles went back inline; `CONTEXT.md` and `docs/mvp-plan.md` say that a Triage and a Drop can be undone; the docs name the pull request, not the working branch.

**Known limits**
- **A failed Triage comes back first.** When an earlier Triage fails after the person has moved on, its Task is the oldest in the Inbox again and replaces the card being edited, which drops focus and the phone keyboard. The other card's edits are kept, and the Undo bar says what failed.
- **A change elsewhere during the window.** Another device's edit of a Task while its Triage is held changes the Task's version, so the card shows again until the window ends, and then the Triage does not apply: the Undo bar says it is not triaged, and the server files a Review item.
- **A destroy cannot wait.** When the shell itself is destroyed (a sign-out, for example) while a Triage's send is still on its way, a Done of the same Task held after it goes out at once and can arrive first.
- **Unsent edits live in the page.** Edits made on the card and not yet triaged are lost when the Inbox is left or reloaded, unless Open in the editor saved them.
- **One Undo at a time.** A Triage followed by a Drop, or by a Done on Now, sends the Triage at once. A held Triage or Drop lives in memory only, as a held Done does.
- **The pointer pauses the window.** With a mouse, Triage and Drop leave the pointer where the Undo bar appears, so the window waits until the pointer leaves it. Touch has no such pause.
- **The editor's Area.** See the first departure.

**Open checks on the phone**
- After Triage, Drop and Undo, focus lands on the card and the keyboard stays down.
- The action bar stays on the nav while the Title is typed with the keyboard up.
- More hands over to Blocked by cleanly, and closing Blocked by puts focus on the card's More button.
- TalkBack reads the line under the card again on each refused Triage.

## Facts checked on 2026-10-27

- **The code.** Inbox membership is derived (`isInInbox`: Open with no Importance or no Estimate), so saving Importance and an Estimate as edits would move a Task out of the Inbox before Triage; the card keeps them as a draft. `DataStore.inboxCount()` reads the held state, so a held Triage or Drop lowers the badge at once.
- **The checks.** `nx e2e pwa-e2e` and the shots ran on Chromium as installed in the session, with Node 24.22.1 and pnpm 11.22.0.
