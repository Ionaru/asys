<!-- SPDX-License-Identifier: EUPL-1.2 -->
# Current Area

This plan keeps personal Tasks apart from work Tasks. Each Area's Active hours decide on their own which side Now shows, and a compact pick on Now's top row overrides them when the clock gets it wrong, such as when you work on a Saturday or take a day off. Now also says how many Tasks the other side holds, without ranking them. Triage proposes the Current Area, and ASYS takes the palette of the Current Area, so the look shows which side you are on.

The idea started as a top-bar toggle between a "work mode" and a "personal mode" that also changes the theme. It is built here in the domain language instead. **Current Area** is derived state over the existing Areas, mirroring Current voice, so it is not a new top-level concept under ADR 0002.

The plan was drawn up on 2026-10-11:
- three independent designs (Areas only, the toggle as asked, and Active hours with an override) were scored by a judge that checked their claims against the code;
- a fact check covered the external facts;
- three critics then reviewed the draft against the repo, its skills, and the edge cases;
- the maintainer settled decisions 1, 3, 5, 6 and 8 the same day.

The work sits outside the slice plan and is done before slice 2. Line numbers below were read on 2026-10-11, and the builder re-reads each file before editing it.

## Why the sides mix today

Most of the separation is already built:
- Areas have per-weekday Active hours, and the Area editor at `settings/areas` can change them.
- The Picker leaves out every Task whose Area is outside its Active hours (`libs/domain/src/lib/picker/picker.ts:124`).

Three things still let the sides mix:

1. The Personal seed is in use every day from 00:00 to 24:00 (`libs/domain/src/lib/area/active-hours.ts:63-71`), so Personal never drops out.
2. Capture sends no Area, and a Task without an Area is always in hours (`picker.ts:110`).
3. A Task outside its Area's hours leaves Now silently. It is in neither the ranking nor Waiting, and nothing counts it.

There is also no quick way to cope with an exception, and nothing on screen says which side is showing.

## Before piece 1: the Personal hours, by hand

The maintainer edits Personal in Settings → Areas:
- Monday to Friday: 00:00 to 08:00 and 18:00 to 00:00, two rows per day.
- Saturday and Sunday: 00:00 to 00:00.

That is ten weekday rows typed by hand, because the editor has no "copy to days", and an end of 00:00 means the end of the day. From then on, Now at 10:00 on a weekday shows no Personal Tasks, and Now in the evening shows no Work Tasks. Piece 1's seed change reaches only new Users, so these hours stay.

## Working agreements

These are slice 1's agreements, in short:

- **One piece at a time,** each with a runnable check. A piece is done when its check is green.
- **Test-first where behaviour can be pinned.** Tests and code are written separately from the unit's contract. Each new test is seen to fail once for the right reason before the unit counts. To see it, break the behaviour it covers: stash the fix, or break the rule.
- **One commit per verified piece, when the maintainer asks.** Nothing is pushed unless asked. A push to `main` deploys to production.
- **One builder per checkout.** Only one process builds or runs tests at a time.
- **Database tests** run with `--skip-nx-cache`, with `nx serve server` stopped.
- **SPDX headers.** Every new file carries the SPDX line in its comment form. The ID is EUPL-1.2, except MPL-2.0 under `libs/domain/` and `libs/contract/`. Each check includes `node scripts/check-spdx.mts`.

## Decisions

### 1. Active hours decide, and a pick overrides them

Decided by the maintainer on 2026-10-11. With no pick, the Current Area is every Area within Active hours. A pick replaces that with one Area until it ends (decision 2).
- **Where the pick lives.** Only on that device, in `DeviceStorage` (`apps/pwa/src/app/core/platform/device-storage.ts`), and it never reaches the server. The phone and a laptop can therefore show different sides, which Current voice accepts for the same reason.
- **Sign-out.** It clears the pick, as `Session` already clears `ReportedZone` (`apps/pwa/src/app/core/auth/session.ts:75,92`).

### 2. A pick ends at a fixed moment, worked out when you pick

The maintainer chose "until the Areas in Active hours change, and at the latest until the end of the day". The rule below makes that precise. A pick stores `endsAt`, the earlier of:
- the next moment after the pick, on the same local day, at which the picked Area *enters* its Active hours, meaning an interval start that does not touch the end of an earlier interval;
- the start of the next local day.

A pure check against the set of Areas stored at pick time was rejected in review, because it is not monotonic. A Work pick at 06:00 would end at 08:00, when Work comes into its hours, and then come back at 18:00, when the automatic set equals the stored one again. A stored moment also survives a phone that sleeps through the boundary, since the Clock stops ticking while the page is hidden (`apps/pwa/src/app/core/platform/clock.ts:23-28`).

| Pick (weekday unless noted) | Ends |
| --- | --- |
| Personal at 07:30, for a day off | 18:00 |
| Personal at 10:00, for a call | 18:00 |
| Work at 06:00 | 08:00 |
| Work at 17:30, to work late | midnight |
| Work on Saturday at 09:00 | midnight |

Editing Active hours or the time zone after a pick does not move its `endsAt`. An unrelated Area coming into its hours does not end it.

### 3. The pick sits inline in Now's top row

Decided by the maintainer on 2026-10-11. The pick sits in `asys-now-header`, on the same row as the moment and the More button.
- **When it does not fit.** At 320px, or with large text, the row wraps and the pick drops under the moment.
- **No shell-wide top bar.** The shell's assertion that it has no header (`apps/pwa/src/app/layout/shell-layout.spec.ts:444-452`) stays. Only Now ranks by Area, and on every other screen the palette shows the side.

### 4. The control is a chip over a native `<select>`

`ui/segmented` takes exactly two boolean options (`apps/pwa/src/app/ui/segmented/segmented.ts:52`). `ui/select-field` renders a labelled, full-width field (`ui/select-field/select-field.ts:24-32`). The PWA has no popup, menu or dialog yet. So `ui/area-pick` is new.
- **The visible chip** has `aria-hidden` and holds:
  - a first line naming the Current Area: "Work", "Personal", "Work + Personal" or "No Area in use";
  - a second line, "Automatic" or "Picked";
  - a chevron.

  It needs no new icon, so the design system's Icon table is unchanged.
- **The native `<select>`** sits over the chip, transparent and covering it, with the accessible name "Current Area". Its options are "Automatic: \<the Areas in Active hours\>" first, then each Area in `byAreaName` order (`apps/pwa/src/app/features/areas/area-order.ts`).
- **Why native.** Android and iOS show their own lists, keyboard and screen-reader behaviour come with it, it works in jsdom, and it needs no positioning code.
- **Sizes and focus.** The select's text is at least `1rem`, so iOS does not zoom on focus. The wrapper draws the focus ring through `:has(select:focus-visible)`. The tap target is 48px; the 88px Voice only size waits until something sets `drive`.

### 5. Triage proposes the Current Area

Decided by the maintainer on 2026-10-11.
- **The proposal.** A new Triage draft starts on the single Current Area instead of No Area. When several Areas are current, or none, it starts on No Area.
- **Read once.** The proposal is read when the card opens, so the 18:00 tick never flips a card that is already open.
- **Capture is unchanged.** It is still one tap into the Inbox, with no Area, so a personal idea captured at work is never filed under Work without being seen.

### 6. Now counts the other side

Decided by the maintainer on 2026-10-11. A line under the ranking reads, for example, "Other Areas: Work 4 (1 Overdue)".
- **What it counts.** The Tasks that are Available and left out only because of their Area.
- **Tapping.** Tapping an Area picks it.
- **What stays out.** Nothing from another Area enters the ranking, Waiting, or anything above the ranking.

### 7. A palette per Area

`Area.palette` is one of the curated palettes, or null.
- **What null means.** Null is the default look: Evergreen today, and the account's palette once the appearance settings exist. So null and an explicit Evergreen are kept apart.
- **Seed.** Personal gets Harbour, which is cool where Evergreen is warm. Work stays null.
- **The look.** ASYS takes the palette of the Current Area when exactly one Area is current, and the default look otherwise.
- **Never colour alone.** The chip always names the side.

### 8. The initial bundle warning goes from 625 kB to 650 kB

Decided by the maintainer on 2026-10-11. The last measure was 622.99 kB (commit `f476884`), so the pick and the palette blocks would cross the old warning. Piece 5 raises it in `apps/pwa/project.json` and records the size before and after. The new palette blocks drop their description comments where `@terrazzo/plugin-css` allows it.

### 9. No ADR

Current Area is derived state over an existing concept, and the decisions above are this plan's. ADR 0013 is amended in place, because its Consequences list the CSS blocks that `plugin-css` emits (line 18).

## Glossary changes

Written into `CONTEXT.md` first, in piece 1. Add after **Active hours**:

> **Current Area**:
> The Areas whose Tasks Now ranks: the one you picked in Now, kept on that device until it next comes into its Active hours and at the latest until midnight, otherwise every Area within Active hours. Tasks without an Area are always ranked. Now counts the Available Tasks left out only because of their Area, and how many of them are Overdue, without ranking them. It never changes Available, Urgency, Quadrant or Privacy, never reaches Google, and ASYS never moves anything because of it.
> _Avoid_: Mode, work mode, personal mode, profile, workspace, focus

Also in `CONTEXT.md`:
- **Active hours** gains ", unless you picked it as the Current Area" after "the Picker leaves that Area's Tasks out".
- **Picker**'s first sentence reads "Current Area" where it reads "Active hours".
- In piece 4, **Area** gains: "Each Area can have one of the curated palettes; ASYS takes the palette of the Current Area when there is exactly one."

## The pieces

| Piece | Delivers | Check |
| --- | --- | --- |
| 1. Current Area in the domain | `current-area.ts`, `pick()` taking the Current Area and returning `otherAreas`, the Personal seed, RULES_VERSION 0.5.0 | `nx test domain`, `nx test server` |
| 2. The pick in Now | The pick store, `asys-area-pick` in Now's top row, the Other Areas line | `nx test pwa`, `current-area.spec.ts` |
| 3. Triage proposes the Current Area | The proposal in the Inbox's Triage draft | `nx test pwa`, `triage.spec.ts` |
| 4. A palette per Area | `Area.palette` from the domain to the database and the Area editor, RULES_VERSION 0.6.0 | `nx test domain server pwa`, the migration checks |
| 5. The look follows the Current Area | All palette blocks in CSS, `data-palette`, the `theme-color` metas, the budget | `nx test pwa`, `design-tokens:css`, e2e, the phone checks |

Each unit goes to an implementer and a test-writer working from the same contract. The planner reconciles their work and proves that the tests can fail.

### Piece 1: Current Area in the domain

Skills: `changing-a-domain-rule`, `planning-a-slice-piece`.

- **`libs/domain/src/lib/area/current-area.ts`** (new) is pure. The time zone comes from Settings, and nothing reads a clock.
  - `AreaPick = { areaId: string; endsAt: Instant }`. `Instant` is a number (`libs/domain/src/lib/time/local-date.ts:16`).
  - `makeAreaPick(areas, settings, now, areaId)` works out `endsAt` as decision 2 says. It reads the picked Area's interval starts on the local day of `now`.
  - Turning a local date and minute into an Instant is a new helper in `time/zoned.ts`, because Temporal lives only there. It sits next to `startOfDay` (`zoned.ts:77`), which gives the start of the next day.
  - `automaticAreaIds(areas, timeZone, now)` returns the ids of the Areas within Active hours, sorted by UTF-16 code unit.
  - `currentArea(areas, settings, now, pick | null)` returns `{ areaIds, picked }`. The pick holds while `now < endsAt` and its Area exists. Otherwise the result is the automatic set.
- **`libs/domain/src/lib/picker/picker.ts`**:
  - `pick()` takes an optional sixth parameter, `currentAreaIds`.
    - `undefined` keeps today's lazy per-Area check, so an invalid zone is still accepted while no Task has a known Area (`pick-zones.spec.ts:98-115`).
    - `[]` means no Area is current.
  - The loop tests the Area after `isAvailable`, which already leaves out Inbox, Blocked and not-yet-Available Tasks (`task/available.ts:16-23`). An Available Task that is out of Area is counted, and nothing else about it changes.
  - `PickResult.otherAreas: readonly { areaId, count, overdue }[]` lists only Areas with a count above zero, sorted by `compareCodeUnits` on the name, then the id. Its doc comment says the count means "Available and out only because of its Area", so slice 2's Gap and Place filters have to revisit it.
- **Seed.** `PERSONAL_ACTIVE_HOURS` (`active-hours.ts:63`) becomes Monday to Friday `[[0,480],[1080,1440]]`, Saturday and Sunday `[[0,1440]]`.
- **Existing tests this changes**:
  - `picker.spec.ts:384,410,427` (`toEqual({ ranked, waiting })` gains `otherAreas`);
  - `area/active-hours.spec.ts:66-70` (the seed value);
  - `active-hours-text.spec.ts:95-97` ("Every day, all day");
  - `apps/pwa/src/app/features/areas/area-list.spec.ts:117`.

  `apps/server/src/owners/create-owner.spec.ts` reads the constant and does not change.
- **Docs.**
  - `CONTEXT.md` as above.
  - `libs/domain/CHANGELOG.md` 0.5.0 and `RULES_VERSION`.
  - `docs/mvp-plan.md`:
    - line 12 ("the Areas' Active hours");
    - line 43 (Personal "every day");
    - the term table, with Current Area in the MVP row.
  - `docs/scenarios.md` is checked per the skill, for example S13's note on hours.
- **New tests,** in Europe/Amsterdam:
  - **Boundaries.** 07:59, 08:00, 17:59 and 18:00; a Saturday; 25 Oct 2026, when daylight saving time ends.
  - **Area sets.** Overlapping Areas give the union. When no Area is in hours, Tasks with an Area are left out and counted. Null and unknown Areas always pass. `[]` and `undefined` behave differently.
  - **`endsAt`.** The five timelines of decision 2, including Work at 06:00, which must stay ended at 18:00, and an interval that starts at 00:00.
  - **`otherAreas`.** Its counts and Overdue numbers, with Inbox, Blocked and not-yet-Available Tasks excluded.

### Piece 2: the pick in Now

Skills: `building-pwa-ui`, `writing-e2e-specs`. Rule: `angular-component-files`.

- **`apps/pwa/src/app/core/data/area-pick-store.ts`** (new) is a root service over `DeviceStorage`.
  - **What it holds.** A signal of `AreaPick | null`. What it reads is checked, and a malformed value reads as null.
  - **Other tabs.** It re-reads on the `window` `storage` event, so a second tab follows the first.
  - **Writes.** `pick()` and `clear()` write; an expired pick is ignored, never written.
  - **Sign-out.** `Session`'s sign-out calls `clear()`.
- **`apps/pwa/src/app/core/data/data-store.ts:114-124`** works out `currentArea` from the store and the Clock. It passes `areaIds` to `pick()` and exposes `currentArea` to screens. While `state()` is null, the pick is neither applied nor cleared.
- **`apps/pwa/src/app/ui/area-pick/area-pick.ts`** (new, `asys-area-pick`) is the control from decision 4. It takes the Current Area's label, whether it is picked, the automatic label and the Areas. Its `(areaPicked)` output carries an `areaId`, or null for Automatic.
- **`apps/pwa/src/app/ui/now-header/now-header.ts`**:
  - the top row wraps;
  - the moment is `flex: none`;
  - the pick has `margin-inline-start: auto`;
  - the More button's negative margin (lines 46-48) is checked;
  - the doc comment (lines 4-7) is updated.
- **`apps/pwa/src/app/features/now/now.component.html:2-11`** projects `<asys-area-pick>` before the More link.
- **The Other Areas line** sits under the ranking, and also when the ranking is empty.
  - **Markup.** A `role="group"` labelled "Other Areas", with one button per Area. Each button's target is at least 44px, and its name is its visible text.
  - **Tapping.** It picks that Area, then moves focus to the pick control.
- **The status line.** A pick sets the existing `role="status"` line (`now.component.html:12`) to "Work picked until midnight" or "Back to Automatic". The counts never sit in a live region.
- **The Area editor's note** "Tasks in this Area never show in Now" (`features/areas/area-editor.component.html:66-68`) gains "unless you pick it in Now".
- **Existing specs that fake `DataStore`** gain `currentArea`:
  - `now.spec.ts:309`;
  - `inbox.spec.ts:155`;
  - `app.spec.ts:67`;
  - `shell-layout.spec.ts:154,176`;
  - `view-transitions.spec.ts:235`.
- **New unit specs:**
  - the store: restore, a malformed value, expiry, the `storage` event with two instances over one `localStorage`, and sign-out;
  - `area-pick`: labels, the accessible name, and a change that emits;
  - `data-store`: the ids passed to `pick()`, and the null state;
  - `now`: the line, a tap that picks, focus, and the status text.
- **e2e, `apps/pwa-e2e/src/current-area.spec.ts`** (new).
  - **The clock.** `page.clock.install({ time })` at the next Saturday at 14:00 and at a weekday at 10:00, both computed from `localToday()`; no fixed calendar dates. The server's clock stays real.
  - **Saturday.** The Personal Task shows, the Work Task does not, and the line reads "Other Areas: Work 1". Picking Work shows the Work Task, a reload keeps the pick, and fast-forwarding past midnight returns to Automatic.
  - **Weekday.** A Personal pick holds until 18:00.
  - **Phone width.** `phone-width.spec.ts` covers the header at 320px and 375px.

### Piece 3: Triage proposes the Current Area

Skills: `building-pwa-ui`, `writing-e2e-specs`.

- **`apps/pwa/src/app/features/inbox/inbox.ts`**:
  - `draftOf(task, proposedAreaId)` (lines 43-46) starts the draft on `task.areaId ?? proposedAreaId`.
  - The `linkedSignal` (lines 136-141) reads the single Current Area with `untracked`.
  - `inbox.ts:175` already sends `areaId` whenever it differs from the Task's.
  - `ui/triage-card` does not change, because its draft is a `model.required` (`triage-card.ts:74`).
- **Tests:**
  - `inbox.spec`: the proposal with one Current Area; no proposal with two Areas or none, or for a Task that already has an Area.
  - `apps/pwa-e2e/src/triage.spec.ts` pins the PWA clock to a computed weekday at 10:00, because the proposed Area now depends on the hour.

### Piece 4: a palette per Area

Skills: `adding-a-domain-command` (the CreateArea and UpdateArea payloads change), `adding-an-owned-table`, `building-pwa-ui`.

- **Domain.**
  - **The type.** `libs/domain/src/lib/area/palette.ts` holds `enum Palette { Evergreen = 'evergreen', Harbour = 'harbour', Moss = 'moss', Graphite = 'graphite' }`, matching the resolver's palette ids, and `Area.palette: Palette | null`.
  - **Commands.** CreateArea's `palette` is optional, defaulting to null. UpdateArea's patch takes `palette?`. `updateArea`'s no-op comparison and its `next` object both include it (`commands/area-commands.ts:122,131-136`).
  - **Rejections.** An unknown value gives `RejectedReason.InvalidPalette`, with its case in `outcome-message.ts`. Over HTTP the contract answers 400 before the domain sees it.
  - **Seed.** It gives Personal Harbour.
  - **Specs.** Every `Area` literal in them gains the field (`libs/domain/src/test/builders.ts:46` and the others).
  - **Docs.** CHANGELOG 0.6.0 and `RULES_VERSION`.
- **Contract.**
  - **`PaletteSchema`.** It is declared once in `libs/contract/src/lib/enums.ts`, and `'Palette'` joins the expected names in `openapi-components.spec.ts:106`.
  - **`AreaSchema.palette`.** It decodes a missing key as null. Area entries written to the change log before the migration still decode (`apps/server/src/changes/change-log.ts:93`), and the type stays `Palette | null`, so the `entities.test-d.ts` lockstep holds.
  - **The other schemas.** `AreaPatchSchema` and CreateArea gain the field; it is optional in CreateArea.
- **Server.**
  - **The column.** A nullable `palette` pgEnum column on `areas` (`apps/server/src/db/schema.ts:101-115`), following `privacy`, with rows in `schema-enums.spec.ts` and `schema-enums.test-d.ts`.
  - **The migration.** It comes from `drizzle-kit generate`, with the SPDX header added by hand, followed by the `--name should_be_empty` check. The previous release ignores the column.
  - **Code.** `db/mappers.ts`, `commands/persist-changes.ts` and `commands/load-state.ts` carry the field. `mappers.spec.ts` is updated, and `run-command.spec.ts` gains a round trip.
- **PWA.**
  - **The wire.** `core/api/wire.ts` `SHAPES`, and `fromWire` reads a missing palette as null, for a rollback.
  - **The Area editor** (`features/areas/area-editor.ts`, `area-editor.component.html`) gains a palette select: "Default look (Evergreen)" first, then the four palettes.
  - **The editor's fields.** `AREA_DRAFT_FIELDS` (line 176) and `buildAreaPatch` (line 183) carry the palette, and the pending-create retry check (line 410) compares it.
- **After the deploy,** the maintainer picks Harbour for Personal.

### Piece 5: the look follows the Current Area

Skills: `building-pwa-ui`, `writing-e2e-specs`.

- **`libs/design-tokens/terrazzo.config.mts`.**
  - **New blocks.** It adds permutations for Harbour, Moss and Graphite, each in light, dark and drive. Each is emitted under `[data-palette="<palette>"][data-theme="<theme>"]` with `include: SCHEME_TOKENS`, and without description comments if `plugin-css` 2.7.1 allows it.
  - **Evergreen** keeps today's blocks.
  - **Drive.** `Theme` sets only light or dark today (`apps/pwa/src/app/core/platform/theme.ts:41-46`), so the drive blocks wait for slice 2.
  - **Docs.** Update `libs/design-tokens/README.md:24-30`, which says "Only Evergreen is emitted until the appearance settings exist", and amend ADR 0013's Consequences in place.
- **`apps/pwa/src/app/core/platform/theme.ts`** gains `setPalette(palette | null)`.
  - **The attribute.** It sets `data-palette`, or removes it for null and Evergreen.
  - **Storage.** It keeps `{ palette, savedAt }` in `DeviceStorage`. The constructor applies a stored palette only when it is less than 60 minutes old, so a morning launch does not show the evening's palette first.
  - **Sign-out** clears the stored palette.
- **The `theme-color` metas.** `apps/pwa/src/index.html:10-11` keeps both `media` metas, which are right before Angular boots.
  - **When they change.** After each theme or palette change, and in the `prefers-color-scheme` handler, `Theme` sets both to the computed `--paper`.
  - **Empty values.** It skips the write when that value is empty, as it is in jsdom; `theme.spec` sets the variable on `documentElement` to test it.
  - **The manifest.** The meta overrides the manifest's `theme_color`, which stays Evergreen.
- **The effect that sets the palette** lives in `App` (`apps/pwa/src/app/app.ts`), so `Theme` stays free of `DataStore` and `theme.spec` needs no providers.
  - **Its value.** It passes the palette of the single Current Area, or null.
  - **Cold start.** It skips while `state()` is null, so a cold start never overwrites the stored palette.
  - **Tests.** `app.spec` gains cases for it.
- **Budget.** The initial `maximumWarning` in `apps/pwa/project.json` becomes `650kb` (decision 8).
- **Tests:**
  - `theme.spec`: the attribute and its removal, a fresh and a stale stored palette, the metas, and sign-out;
  - `pnpm exec nx run design-tokens:css`, then inspect for the Harbour blocks;
  - e2e at Saturday 14:00: `html[data-palette="harbour"]` and a different computed `--paper`;
  - e2e at a weekday at 10:00: no `data-palette`.
- **Phone checks,** recorded later in a docs-only commit:
  - **Status bar.** It repaints live on the installed Android PWA, in light and dark. The fact check could not confirm this from sources.
  - **Cold start.** The cold-start look is acceptable. If the Evergreen flash before boot bothers the maintainer, the fallback is a same-origin `<script src>` in `<head>`, which the CSP's `script-src 'self'` allows (`apps/server/src/http/static-files.ts:27`).

## Verification

For each piece, with the database up and `nx serve server` stopped:

```bash
pnpm exec nx run-many -t lint typecheck build test --skip-nx-cache
```

Then the rest of CI:
- `pnpm exec tsc -p scripts/tsconfig.json` and `pnpm exec nx run server:openapi`;
- `pnpm exec nx e2e pwa-e2e` and `pnpm exec nx run pwa-e2e:e2e-image`;
- `pnpm exec nx format:check --all`;
- `node scripts/check-spdx.mts`, `node scripts/check-licenses.mts` and `node scripts/palettes.mts --check`;
- `pnpm audit --prod`.

`reuse lint` runs only in CI's licences job. Before a push, grep the changed docs for the SPDX tag followed by a colon.

**Proving the tests can fail.** Break each of these and watch a test fail for that reason: the `endsAt` scan, the `otherAreas` count, and the proposal in `draftOf`.

**After the deploy,** on the phone:
- Now switches at 18:00 by itself, and the palette changes with it.
- A Saturday pick of Work holds until midnight.

## When it is built

- **Record it in the slice plan.** Add a fourth entry to "Pulled ahead before slice 2" in [slice-1-plan.md](slice-1-plan.md#pulled-ahead-before-slice-2), with the known limits and the phone checks. Update that section's "Three pieces of work" and its note on removed plans.
- **Remove this plan,** as the earlier pulled-ahead plans were.

## Out of scope

- **Syncing the pick across devices.** It would need a Command and a Settings field.
- **Dated exceptions** (holidays, sick days) beyond picking. Slice 2's calendar import could take an Area out of use on an all-day Activity.
- **Personal errands that need business hours.** Pick Personal for the call, or add a third Area with weekday hours, which already works.
- **Options left out:**
  - an "All Areas" option;
  - picks of several Areas;
  - Area names on ranked rows;
  - capture taking the Current Area;
  - "copy to days" in the Area editor.
- **The order between an Area's palette and the account's,** once the appearance settings exist. An Area palette of null will follow the account.

## Known limits, expected

- **The midnight cliff.** A Work pick at 23:50 lasts 10 minutes, and work past midnight needs a fresh pick.
- **Ambiguous moments.** When Areas overlap, or none is current, the look is the default; the chip names the Areas.
- **Where Evergreen stays.** The splash (the manifest's `theme_color`), the moment before Angular boots, and any launch without a stored palette from the last hour.
- **Other Areas names only Overdue.** A Task of the other side that is urgent but not yet Overdue shows only in the count.

## Risks

- **The status bar might not repaint** on the Android PWA when `theme-color` changes. The in-app palette works either way, and only the status bar would stay as it was.
- **The pick could be forgotten.** It then shows the wrong side until it ends. The chip's "Picked" line and the palette make that visible.
- **Changing `pick()`'s signature** touches the ranking specs. The `undefined` path must keep today's behaviour, proven by the existing suite before new cases are added.
- **The bundle grows,** by the pick, the domain code and nine colour blocks. Decision 8 raises the warning, and the before and after sizes are recorded.

## Facts checked on 2026-10-11

Installed: `@terrazzo/cli`, `@terrazzo/plugin-css` and `@terrazzo/parser` 2.7.1, `jsdom` 30.1.1.

- **Terrazzo `permutations`** (`node_modules/@terrazzo/plugin-css/dist/lib.d.ts`). `CSSPluginOptions.permutations` takes entries with `input` (such as `{ scheme: 'harbour-dark' }`), `prepare` (which wraps the output in any selector), `include`, `exclude`, `transform` and `only`. `modeSelectors` and `baseSelector` are deprecated in their favour. `terrazzo.config.mts` already emits `[data-theme="dark"]` and `[data-theme="drive"]` this way.
- **The size of a palette block.** Each non-default block declares 22 variables (`color.*` and `shadow.*`), about 2.9 kB with comments, measured on `dist/libs/design-tokens/css/tokens.css` (15.8 kB, 105 declarations). Nine more blocks add about 23 kB raw before comments are dropped. That is an estimate.
- **`theme-color` from JavaScript.**
  - **Allowed.** web.dev ([Theming](https://web.dev/learn/design/theming/)) says the value can be updated from JavaScript.
  - **The meta wins over the manifest.** An in-scope document's meta overrides the manifest's `theme_color`: [Web App Manifest](https://www.w3.org/TR/appmanifest/#theme_color-member), [MDN](https://developer.mozilla.org/en-US/docs/Web/Manifest/theme_color), and Chromium's `AppBrowserController::GetThemeColor`.
  - **Desktop.** Installed desktop apps repaint their title bar live (`AppBrowserController::DidChangeThemeColor`).
  - **Android: unverified.** `TopUiThemeColorProvider` listens for theme-colour changes, but no source guarantees a live status-bar repaint for an installed PWA, so it is a phone check.
  - **The `media` attribute.** The first meta whose `media` matches applies. A script must update the matching one, so piece 5 updates both.
- **Android work profile.** No web API tells a PWA which profile it runs in. [Work-profile detection](https://developers.google.com/android/management/work-profile-detection) is a native API. That is absence of evidence, not proof.
- **Custom properties on a subtree** re-theme only that subtree, but `color-scheme` paints the canvas only from the root, and `theme-color` is page-level. This plan sets the palette on `<html>` only, for that reason.

### Facts to check while building

- Effect v4's decoding default for a missing key in `AreaSchema` (piece 4), against the installed `effect` package.
- Whether `plugin-css` 2.7.1 can leave out the description comments for some permutations (piece 5).
- `drizzle-kit generate` for a nullable pgEnum column added to an existing table (piece 4).
