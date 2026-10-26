<!-- SPDX-License-Identifier: EUPL-1.2 -->

# Atomic Design refactor plan

The PWA's presentational components move from `apps/pwa/src/app/ui/` into the Atomic Design levels under `apps/pwa/src/app/components/` (atoms, molecules, organisms, templates), and the routed screens move from `features/` into `apps/pwa/src/app/pages/`. The rules are in `apps/pwa/src/app/components/README.md`; the level of each component comes from the design system's level table (https://claude.ai/artifact/Qr1Coh3jiqRdS18W9id71v, README, Atomic design).

## Decisions

- **Layout.** A component lives at `components/<level>/<name>/<name>.ts`, with its spec, `.component.html` and `.css` beside it. A template is `components/templates/<screen>-template/`, a page `pages/<screen>/`, and a screen's pure helpers and route wrapper move into its page folder.
- **Names stay in the move PRs.** Folders, selectors and host classes keep their current names, so git records each move as a rename and no e2e selector or `styles.css` rule changes. The design-system renames (QuadrantChip to QuadrantLabel, PickerRow to TaskRow, NowHeader to ScreenHeader, and so on) come after the moves, one commit each on one branch (decided 2026-10-25).
- **One atom, several files.** The Input atom is `input.ts`, `input-box.ts` and `single-line.ts` in `atoms/input/`, because together they are the design system's Input. That removes the one place where an atom imported another.
- **Icon inside an atom.** The README says atoms import no other atom. The design system allows an Icon inside a Button as part of its label, and lists StatusBadge, which has an icon, as an atom. So an atom may hold the Icon atom, and likewise the Count atom (decided 2026-10-26), and nothing else from another atom folder.
- **Support code.** Helpers that several levels share (`activation.ts`, `field-control.ts`) go to `components/support/`, which every level may import and which imports nothing from `components/`. Helpers that one component owns stay beside it (`area-options.ts`, `swipe-decision.ts`).
- **Focus methods and projection.** Public `focus…()` methods that move focus inside a component, and projected content, are allowed beside inputs and outputs. Replacing them would change behaviour across the specs.
- **Swipe.** `swipe-actions` keeps its `core/platform` seams (`Motion`, `Haptics`, `theme`), as the only component that may import `core` at runtime.
- **Enforcement.** `scripts/check-architecture.mts` checks every import under `components/` and `pages/` against the level rules, and runs in the `lint` CI job. A script was chosen over oxlint overrides, because overrides replace rather than merge, so the PWA's shared import bans would be copied once per level.
- **One template per screen.** Every page gets a template of its own, also where the design system draws none (Recovered, the Areas list and editor, the auth screens, Capture, Settings, Account). Those templates follow what the screen shows today, and the design system is left as it is (decided 2026-10-22).
- **Area order.** `byAreaName` moves from `features/areas/` to `core/data/area-order.ts` with the Area editor, because Now, the Task editor, the Inbox and the Areas list all sort by it and no one page owns it (decided 2026-10-25).
- **Log progress helpers.** `logProgressCommand` and `estimateNowText` move from the LogProgressForm organism to `core/data/log-progress.ts` with Now, because the form never uses them, and Now and the Task editor build the Command and its status line themselves, which a page cannot import from an organism (decided 2026-10-25).
- **Now's motion.** A component may not use `Motion`, so NowTemplate hands the page its card through `cardElement()` for the Done exit and rise, and emits each row's `animate.leave` and `animate.enter` events for the page to collapse and expand the row (decided 2026-10-25).
- **Task editor blockers.** The Blocked by section becomes the TaskBlockers organism, which only shows its rows and emits Add and Remove, and the page-provided `TaskBlockerActions` in `pages/task-editor/` sends the Commands. The organism keeps emulated encapsulation, unlike the other organisms, so its stylesheet renders as before (decided 2026-10-25).
- **Task editor chrome.** TaskEditorTemplate hands the page its sticky bar and footer as the signals `barElement` and `footerElement`, because the page measures them with `observeBlockSize` from `core/`, and the footer comes and goes (decided 2026-10-25).
- **The shell stays outside.** `layout/` (the shell with the router outlet) and `app.ts` are not a template with inputs and outputs only. They stay outside the levels for good (decided 2026-10-26), because they persist across routes and inject services no component may; `scripts/check-architecture.mts` fences their imports.

## Pull requests

Each lands on `main` with every check green and no visual change unless it says so.

1. **Atoms.** Icon, Button, CaptureButton, Input (with InputBox and SingleLine), Label, StatusBadge, QuadrantChip, SyncNote and FieldError, plus the level check, the README and the skill.
2. **Molecules and support.** Fact, InlineConfirm, LoadState, AreaPick, CaptureField, TextField, Segmented, SelectField, PickerRow, ReviewItem and UndoBar; `activation` and `field-control` into `support/`.
3. **Organisms.** BottomNav, QuickAdd, LogProgressForm, NowHeader, SectionHeader, Sheet, TimePick, DatePick, EstimateField, ChoiceRow, DateSpecRow, TopPick, TriageCard and SwipeActions; `ui/` is deleted. ChoiceRow, DateSpecRow and SectionHeader go in as organisms although the design system names molecules for them, because they hold a Sheet; the later splits make the molecules real.
4. **Pages and templates for Today, Recovered and the Areas list**, the lowest risk, to set the pattern.
5. **Sign-in, Sign-up and Recover.**
6. **Capture and Settings.**
7. **Account.**
8. **Inbox.**
9. **Area editor.**
10. **Now.**
11. **Task editor.** `features/` is deleted.

## After the moves

The moves are done. What the plan left for later landed after them:

- The design-system renames, one commit each (PR #53, plus #54 for the classes and ids DatePicker and TimePicker kept): QuadrantChip to QuadrantLabel, PickerRow to TaskRow, Segmented to SegmentedControl, DatePick to DatePicker, TimePick to TimePicker, EstimateField to EstimatePicker, DateSpecRow to DateRow and NowHeader to ScreenHeader. They changed selectors, classes, e2e specs and `styles.css`.
- CaptureButton folded into Button as `[capture]="true"`, which draws the `asys-button--capture` pill with its `__label` and the count of `waiting` captures, as the design system's Button does (PR #55).
- On one branch, a commit each (2026-10-26): the shell fenced outside the levels; the Count, Countdown, Link, Text and Segment atoms; the ButtonGroup, NavItem, FieldRow, DateRow and Calendar molecules; SegmentedControl on a list of options; SectionHeader moved to the molecules, with CollapsibleSection split out as an organism; the OptionList organism; and the DateRow organism renamed DateField, freeing the name for the molecule. Where the design system's values differ from the old look, the design system won: the Link underline, the Voice only Link height, the 99+ Count cap and the Estimate ruler's letter-spacing.

## Still to do

- GapSummary and GapBand, with the Gap rule and the screens that show it in slice 2. Building them now would leave unused code (decided 2026-10-26).
- The pickers on SegmentedControl's Wrap, Grid and Track layouts: the Estimate chips and ruler, DatePicker's quick days and TimePicker. Today they place their Segments themselves.
- Segment's `now` form and its VoiceLabel, once Voice is built.

## Open questions

- Settled on 2026-10-25: SyncNote stays SyncNote. It is the "Saved. Waiting for the server." note, which the design system's SaveStatus leaves to `reason` text; the Task editor's inline Saved status is the SaveStatus.
