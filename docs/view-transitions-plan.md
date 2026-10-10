<!-- SPDX-License-Identifier: EUPL-1.2 -->
# View transitions and the motion foundation

This plan makes opening a Task and switching tabs feel smooth, and it lays the motion foundation that the other two plans build on.
- It adds motion tokens, two seams (`Motion` and `Haptics`) and kill switches that also reach view transitions.
- It turns on the router's view transitions, with a kind per navigation (tab, Push, Pop, Swap) and the Task title moving between Now and the editor.

It was drawn up on 2026-10-05 and reviewed adversarially the same day, with the confirmed findings folded in. The work sits outside the slice plan and is done before slice 2. It is plan 1 of three and is built first: it has no prerequisites. `docs/capture-and-done-animations-plan.md` (plan 3) and `docs/swipe-to-done-plan.md` (plan 2) depend on unit 1, on the names and the z-index ladder of unit 3, and on the `data-task-id` hooks of unit 4. The build order is 1, 3, 2.

**What is missing today.**
- Route changes are instant cuts. The router has only `withComponentInputBinding()` (`apps/pwa/src/app/app.config.ts:21`).
- There are no motion tokens. The same `150ms ease-out` is written out eight times (unit 1).
- The kill switches in `apps/pwa/src/styles.css:209-224` use `*` selectors, which do not match `::view-transition-*` pseudo-elements.
- Nothing scripts motion, and nothing guards `Element.prototype.animate` or `navigator.vibrate`, which jsdom lacks.

## Working agreements

These are slice 1's agreements, in short:

- **One unit at a time,** each with a runnable check. A unit is done when its check passes.
- **Test-first where behaviour can be pinned.** Each new test is seen to fail once, for the right reason (an assertion, not a compile error), before it counts.
- **One commit,** when the maintainer asks, after review and full verification. Nothing is pushed unless the maintainer asks. A push to `main` deploys.
- **One builder per checkout.** Only one process builds or tests at a time. The e2e suites run one after the other.
- **SPDX headers.** Every new file carries an `SPDX-License-Identifier` line for EUPL-1.2 in its comment form: `//` for `.ts`, `/* */` for `.css`. The check of each unit that adds a file includes `node scripts/check-spdx.mts`.

## Decisions

### 1. Motion tokens live in `base.tokens.json`, mirroring the design system's prose

`libs/design-tokens/src/base.tokens.json` gains two groups:

| Token | Value | CSS variable | For |
| --- | --- | --- | --- |
| `duration.duration-quick` | 150ms | `--duration-quick` | Presses, sheets, small state changes, switching tabs |
| `duration.duration-moderate` | 250ms | `--duration-moderate` | Things that move across the screen: page changes, a swipe settling, the capture flight, a gap closing |
| `easing.ease-out` | `cubic-bezier(0, 0, 0.58, 1)` | `--ease-out` | What arrives or responds. It is the CSS keyword's curve, so today's feel is unchanged |
| `easing.ease-in` | `cubic-bezier(0.42, 0, 1, 1)` | `--ease-in` | What leaves |
| `easing.ease-emphasized` | `cubic-bezier(0.2, 0, 0, 1)` | `--ease-emphasized` | What moves across the screen |

- **The leaf carries its prefix.** Terrazzo names the CSS variable after the leaf (`libs/design-tokens/terrazzo.config.mts:27` and `:69`), as with `spacing.space-1`. A leaf named `quick` would emit `--quick`.
- **No new file and no per-theme value.** The tokens land in the light block and cascade to every theme, because `SCHEME_TOKENS` holds only `color.*` and `shadow.*` (`terrazzo.config.mts:18`). Voice only needs no motion values: it has no motion.
- **The design system stays the source.** Its `tokens.json` cannot hold motion, so its README prose is the source (decision 4), and `base.tokens.json` mirrors it.
- **Tokens only, no literal timings.** All eight literal `150ms ease-out` become `var(--duration-quick) var(--ease-out)`. Script code passes token references to `Motion.play` (decision 2).

Rejected: a `duration-slow` step. Nothing in the three plans needs it.

### 2. Two seams: `Motion` and `Haptics`

**`Motion`** (`apps/pwa/src/app/core/platform/motion.ts`, a root `@Service()`) is the one way script code animates:
- `reduced` is a live signal from a guarded `matchMedia('(prefers-reduced-motion: reduce)')`, the pattern of `core/platform/theme.ts:21-39`.
- `allowed()` is false under reduced motion, in Voice only (`data-theme='drive'` on `<html>`), and where `Element.prototype.animate` is missing.
- `play(el, keyframes, options)` resolves at once when motion is not allowed. Otherwise it resolves when the animation finishes. It never rejects: it swallows an `AbortError`, so a cancelled animation counts as over, and it reports any other error (a bad keyframe makes `animate` throw) with `console.error` before it resolves, so a programming error stays visible to a developer and no caller needs a `catch`.
- `leave(event, keyframes, options)` plays the exit of a node that Angular keeps while it leaves (the function form of `animate.leave`). It sets `data-leaving` on `event.target`, awaits `play`, and calls `event.animationComplete()` in a `finally`. `leaveMarked` and `collapseRow` are thin calls to it.
- `play` accepts `var(--token)` for `duration` and `easing` and resolves it against `<html>`. Callers write `MotionDuration.Moderate` and `MotionEasing.Emphasized`, never a number.
- **This contract binds plans 3 and 2.** `MotionDuration` and `MotionEasing` are exported from `motion.ts`, and `play` is the only code that reads a motion token in TypeScript. Callers never call `getComputedStyle` for a timing and never hold a fallback number or curve. A token that reads empty makes `play` resolve at once, so no caller needs one. Plan 3's `core/platform/motion-timing.ts` is therefore not built (plan 3 already drops it when `Motion` resolves tokens), and plan 2's SwipeActions passes the enums and drops its own token reading and fallbacks.
- Specs replace it with a fake whose promise they control. jsdom has no `animate`, so the real `Motion` resolves at once there. A fake that serves `leaveMarked` or `collapseRow` also carries `leave`, and the real `Motion.prototype.leave` works over a fake `play`.

**`Haptics`** (`core/platform/haptics.ts`, a root `@Service()`) has one method, `tick()`, a guarded `navigator.vibrate(HAPTIC_TICK_MS)`.
- It is separate from `Motion`, because a haptic is not motion. Reduced motion does not silence it.
- `HAPTIC_TICK_MS` starts at 15 and is tuned on the device between 10 and 20 ms (plans 3 and 2 make that check).
- The Vibration API needs sticky activation. The first swipe after launch therefore gets no haptic, because a touch first activates the page at `pointerup`. That is accepted.
- Firefox Android returns true but does not vibrate. iOS has no `vibrate`. Haptics are a progressive enhancement for Chrome Android.

Plan 1 itself calls neither `Motion.play` nor `Haptics.tick`; plans 3 and 2 do. They are built here so the foundation lands once, with its specs.

### 3. The kill switches reach the view-transition pseudo-elements

The existing switches stay. `styles.css` gains, for both reduced motion and Voice only:
- `:root::view-transition-group(*)`, `:root::view-transition-old(*)` and `:root::view-transition-new(*)` get `animation: none !important`;
- for Voice only the selectors are `:root[data-theme='drive']::view-transition-group(*)` and the same for `-old(*)` and `-new(*)`.

The pseudo-elements hang off `<html>` itself, so a descendant selector such as `[data-theme='drive'] ::view-transition-group(*)` matches nothing. The handler also skips the transition in both cases (unit 2, step 2), so the CSS is the second guard.

### 4. The design-system amendment is written here and applied only with the maintainer's go-ahead

Three plans depart from the ASYS design system (artifact `6WGtLoDt9puFmGrYW52bbo`): the README allows only "150ms ease-out for presses and sheets" (README line 70), draws the check only in `ink` or `ink-muted` (line 80), and has no Undo bar or swipe. Unit 1 asks the maintainer before it is built. With a go-ahead, the text in unit 1 replaces the README's "States and motion" section and its Iconography paragraph, and adds Undo bar and Swipe entries. The planning work does not edit the artifact.

**If the amendment is declined:**
- every duration falls back to `--duration-quick`: unit 1 adds no `duration-moderate` token and no `MotionDuration.Moderate`, and every use of it in the three plans reads `--duration-quick`;
- every easing falls back to `--ease-out`, because the README names no other curve: unit 1 adds no `ease-in` or `ease-emphasized` token, `MotionEasing` holds only `Out`, and every use of `--ease-in` or `--ease-emphasized` in the three plans (unit 3's keyframe rules included) reads `--ease-out`;
- the Done reveal uses `signal-soft` with an `ink` check (plan 2);
- the capture flight is dropped, and its status line carries the confirmation (plan 3).

The Undo bar takes a 1px `line` top border and no shadow either way, because the README keeps `shadow-sheet` for sheets and the quick-add bar (line 63).

### 5. The router runs view transitions, with all of it in one file

`app.config.ts` adds `withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated })`.
- `withViewTransitions` is developer preview in Angular 22.2.1. The handler, the kinds and the helpers live in `core/platform/view-transitions.ts`, so a change to the API touches one file.
- `skipInitialTransition` keeps the first load, including a share-target launch at `/capture`, free of motion.
- Without `document.startViewTransition`, the router updates the DOM as before (`_router-chunk.mjs:3697-3698`), so navigation stays instant there.
- When the browser animated a back gesture itself, Angular 22.1.5 and later starts no transition (`_router-chunk.mjs:3692`). The handler is then not called, and nothing needs doing.

Rejected: `@angular/animations` route animations. The package is deprecated since 20.2 and is not installed.

### 6. Only named regions animate

- `:root { view-transition-name: none }`, so the document as a whole is never captured. The header stays live.
- `::view-transition { pointer-events: none }`, so taps reach the live new page during the animation instead of the overlay.
- The names, all set in `styles.css`:

| Name | Element | Notes |
| --- | --- | --- |
| `page` | `<main class="asys-page shell__page">` (`layout/shell-layout.ts:39-45`) | The routed screen |
| `shell-capture` | the capture pill `.shell__capture` or the bar `.shell__quickadd` (`shell-layout.ts:48-57`) | Never both at once |
| `shell-undo` | `.asys-undobar`, the Undo bar | The bar comes in plan 3; the rule is written here, and no other rule (such as one on the shell's `.shell__undo` host) sets this name, because two elements with one name skip the transition |
| `shell-nav` | `<asys-bottom-nav class="shell__nav">` (`shell-layout.ts:60`) | Not captured in Voice only, because the handler skips every transition there |
| `nav-mark` | `.asys-bottomnav__item[aria-current='page'] .asys-bottomnav__pill` (`ui/bottom-nav/bottom-nav.ts:96-98`) | The current tab's mark |
| `task-title` | the one element carrying `data-morph` (decision 9) | Set only for a Push or Pop between Now and the editor |

- **A leaving node is never named:** `[data-leaving], [data-leaving] * { view-transition-name: none !important }`. Plan 3 marks leaving nodes with `data-leaving`. Two elements with the same name make the browser skip the transition, and a leaving pill or row can briefly sit next to its replacement.
- **The z-index ladder.** Without nested groups, every `::view-transition-group` is a flat sibling, and a group with `z-index: auto` paints below one with a number. The nav snapshot is opaque (`bottom-nav.ts:53`), so the mark needs a rung above it:

| Group | z-index |
| --- | --- |
| `page` | auto |
| `task-title` | 1 |
| `shell-capture`, `shell-undo`, `shell-nav` | 2 |
| `nav-mark` | 3 |

- **The Undo bar runs its own entrance.** `::view-transition-new(shell-undo)` gets `animation: none` and `mix-blend-mode: normal`, so the default cross-fade does not sit on top of plan 3's `animate.enter`, and `::view-transition-old(shell-undo)` gets `display: none`. Naming the bar keeps the sliding page snapshot from painting over it, which matters most on the editor's Done, where the bar appears during a Pop.
  - **Why the old image is hidden.** The bar is often captured on both sides: plan 3 shows it before the editor's Done navigates back, and a tab switch inside its 5 seconds captures it twice. With the default animations removed, both images would stay fully opaque for the whole transition. The old one would then show under a new one that is still rising or fading out. Where a browser applies `plus-lighter` outside the animation, the two would also add up and brighten the bar. Hiding the old image leaves only the live bar.
  - When the bar is captured only on the old side (it went before the new state), it disappears at the start of the transition. That is accepted: it is leaving anyway.

Rejected: nested groups and element-scoped transitions. Both are Chrome only.

### 7. The kind comes from route levels, not from each link

Every ShellLayout child in `app.routes.ts` gets `data: { level }`. A pure `transitionKind(from, to)` compares two `RouteMotion` values, which `routeMotion(snapshot)` reads from the router's root snapshots.

| Route (`app.routes.ts`) | Line | Example path | `level` | `tab` |
| --- | --- | --- | --- | --- |
| `now` | 42 | `/now` | 0 | 0 |
| `today` | 43 | `/today` | 0 | 1 |
| `inbox` | 44 | `/inbox` | 0 | 2 |
| `capture` | 45 | `/capture` | 0 | null |
| `tasks/:taskId` | 46-51 | `/tasks/abc` | 1 | null |
| `settings` | 52-56 | `/settings` | 1 | null |
| `settings/areas` | 57-61 | `/settings/areas` | 2 | null |
| `settings/areas/new` | 62-67 | `/settings/areas/new` | 3 | null |
| `settings/areas/:areaId` | 68-73 | `/settings/areas/abc` | 3 | null |
| `account` | 74-78 | `/account` | 2 | null |
| `signin`, `signup`, `recover`, `recovered` (no level) | 13-36 | `/signin` | `auth: true` | null |

The tab order is the bottom nav's: Now, Today, Inbox. The redirects (`''` at line 12, `**` at line 81) resolve before the snapshots exist, so they need no level.

**The matrix,** applied in order; the first rule that matches decides:

| # | Rule | From | To | Kind |
| --- | --- | --- | --- | --- |
| 1 | Same path (query and fragment ignored) | `/capture?text=x` | `/capture` (the replace at `features/capture/capture.ts:158`) | None |
| 1 | | `/now` | `/now` (a redirect from `**`) | None |
| 2 | Either route is auth | `/signin` | `/now` | None |
| 2 | | `/account` | `/signin` (sign-out) | None |
| 2 | | `/recovered` | `/now` | None |
| 3 | Deeper level | `/now` (0) | `/tasks/abc` (1) | Push |
| 3 | | `/inbox` (0) | `/tasks/abc` (1) | Push |
| 3 | | `/today` (0) | `/settings` (1) | Push |
| 3 | | `/capture` (0) | `/settings` (1) | Push |
| 3 | | `/settings` (1) | `/settings/areas` (2) | Push |
| 3 | | `/settings` (1) | `/account` (2) | Push |
| 3 | | `/settings/areas` (2) | `/settings/areas/new` (3) | Push |
| 3 | | `/settings/areas` (2) | `/settings/areas/abc` (3) | Push |
| 3 | Shallower level | `/tasks/abc` (1) | `/now` (0) | Pop |
| 3 | | `/tasks/abc` (1) | `/inbox` (0, by the nav) | Pop |
| 3 | | `/settings` (1) | `/today` (0) | Pop |
| 3 | | `/account` (2) | `/settings` (1) | Pop |
| 3 | | `/settings/areas/abc` (3) | `/settings/areas` (2) | Pop |
| 3 | | `/settings/areas/new` (3) | `/now` (0) | Pop |
| 4 | Same level, both tabs, higher tab index | `/now` | `/today` | TabForward |
| 4 | | `/now` | `/inbox` | TabForward |
| 4 | | `/today` | `/inbox` | TabForward |
| 4 | Same level, both tabs, lower tab index | `/inbox` | `/today` | TabBack |
| 4 | | `/inbox` | `/now` | TabBack |
| 4 | | `/today` | `/now` | TabBack |
| 5 | Same level otherwise | `/now` | `/capture` | Swap |
| 5 | | `/capture` | `/inbox` | Swap |
| 5 | | `/tasks/abc` | `/tasks/def` (a Blocks link, `features/task/task-editor.ts:275`) | Swap |
| 5 | | `/tasks/abc` | `/settings` (the header link) | Swap |
| 5 | | `/settings/areas` | `/account` | Swap |
| 5 | | `/settings/areas/new` | `/settings/areas/abc` | Swap |

**The kind reaches CSS as `data-transition="<kind>"` on `<html>`,** with the `TransitionKind` string values. It is never `none`, because None skips.

Rejected:
- **A direction in `NavigationExtras.info` on each link.** The bottom nav, the system back and `location.back()` cannot carry it, and every new link would need it.
- **`transition.types` and `:active-view-transition-type()`.** They need Chrome 125, Safari 18.2 and Firefox 147, while `startViewTransition` itself works from Chrome 111, Safari 18 and Firefox 144. An attribute works wherever the router starts a transition.
- **Tab to tab across levels as TabForward or TabBack** (the editor to the Inbox tab). Level wins, so it is a Pop: the user is leaving a deeper screen.

### 8. Motion per kind

| Kind | `page` old | `page` new | Total |
| --- | --- | --- | --- |
| TabForward | fades out over the first 35%, `--ease-in` | fades in over the rest, `--ease-out`, drifting in from `--space-4` (16px) to the right | `--duration-quick` |
| TabBack | as TabForward | as TabForward, drifting in from the left | `--duration-quick` |
| Push | slides `--space-6` (32px) to the left, faded out by 35% | slides in from 32px to the right, fading in after 35% | `--duration-moderate`, `--ease-emphasized` |
| Pop | slides 32px to the right, faded out by 35% | slides in from 32px to the left, fading in after 35% | `--duration-moderate`, `--ease-emphasized` |
| Swap | cross-fade out | cross-fade in | `--duration-quick`, `--ease-out` |

Every other group, `nav-mark` and `task-title` included, glides from its old box to its new one over `--duration-moderate` with `--ease-emphasized`.

- **Tabs fade through rather than cross-fade.** A cross-fade shows two text-heavy screens at half opacity at once. Fade-through is the established pattern for switching bottom-navigation destinations, and it stays within 200ms. The 250ms `nav-mark` glide is the functional cue. The page does not cross the screen; the mark does.
- **The drift has a direction,** so TabForward and TabBack differ. The drift follows `--space-4`, so it scales with the Density setting.
- **Push and Pop are a shared axis on X,** the slide that says "deeper" and "back".
- **All the view-transition CSS lives in `styles.css`.** Angular requires view-transition styles in the global stylesheet, and component styles count toward the 4 kB `anyComponentStyle` budget.

### 9. The `task-title` morph

The title moves between Now's top pick title (`ui/top-pick/top-pick.ts:16`) or a row title (`ui/picker-row/picker-row.ts:27`, ranked or Waiting) and the editor's `<h1 class="task-editor__title">` (`features/task/task-editor.ts:123`).
- **Hooks.** Each of those three elements carries `data-task-id="<id>"`. An element is named `task-title` by carrying the attribute `data-morph`, which `styles.css` maps to the name.
- **The old side** is named by a direct DOM write in the handler, before the old state is captured. The handler finds the first `[data-task-id]` element whose `data-task-id` is the Task's id and for which `closest('[data-leaving]')` is null, so neither it nor an ancestor is leaving. It sets `data-morph` on it and keeps a reference. Plan 3 uses the same test for its focus lookups, and it matches the CSS rule that never names anything inside a leaving node.
- **The new side** is named by a binding: `[attr.data-morph]` is set while the root `TaskMorph.taskId` signal equals the element's id.
- **When there is a morph:**
  - Push into `tasks/:taskId`, when the old element is found. From the Inbox there is no hook, so there is no morph.
  - Pop from `tasks/:taskId` to `/now`, only while the Task is listed in Now's ranked Tasks (`DataStore.now()`).
- **A Done Pop has no morph.** After the editor's Done the Task is no longer listed: today because the editor waits for sync before it goes back, after plan 3 because the Task is held. Nothing is named, so the title does not fly into a gap.
- **A Pop to a Waiting Task has no morph.** Waiting starts collapsed whenever Now is created (`features/now/now.ts:205`), so the row would not be there. Only ranked Tasks count, which are always rendered.

Rejected: naming the new side with an inline `view-transition-name` binding. The name and the whole ladder stay in `styles.css`, and an attribute is easy to assert in a spec.

### 10. Cleanup only for the active transition

The handler runs synchronously right after `document.startViewTransition()` (`_router-chunk.mjs:3704-3731`). A second navigation within the animation starts a new transition, which skips the first with an `AbortError`. The first one's `finished` then settles after the second handler has already run. A naive cleanup on `finished` would strip the second transition's attribute and names.

So a module-level `active` holds the transition the handler last took on. Its `finished` cleans up only while `active` is still that transition. A new transition first clears what the previous one named, then takes over. Only the element this transition named is cleared, by reference, never by a global query.

### 11. Documented, not fixed

- **Every skipped transition rejects `ready`,** and Angular logs it with `console.error` in dev mode (`_router-chunk.mjs:3713-3717`, the `ready` handler). That includes None, reduced motion, Voice only and an interrupted transition. The production build logs nothing.
- **Scroll restoration is unchanged.** The router has no scrolling feature, and the body stays the scroller.
- **Nested and element-scoped transitions are not used,** because they are Chrome only.
- **Hit testing during the capture.** For the frame in which the old state is captured, every tap lands on the document element. With `pointer-events: none` on the overlay, a tap during the animation reaches the live new page, which can differ from what the sliding snapshot shows. The animation is at most 250ms.

## The units

| Unit | Delivers | Check |
| --- | --- | --- |
| 1. Motion foundation | Tokens, the eight timings on tokens, `Motion`, `Haptics`, the kill switches, the amendment (with a go-ahead) | `nx run design-tokens:css` and a grep of `tokens.css`; the literal-timing grep finds nothing; `motion.spec.ts` and `haptics.spec.ts` |
| 2. Route levels and transition kinds | `data.level` on every shell route, `view-transitions.ts`, `task-morph.ts` | A matrix table test, `routeMotion` cases, the handler spec with a fake `ViewTransition` covering the active-guard race, and the `app.routes.spec.ts` level check |
| 3. Shell names, the ladder and keyframes | `withViewTransitions` in `app.config.ts`; the view-transition block in `styles.css` | `nx build pwa` with no budget warning and the initial size recorded; the dev-stack e2e suite still green |
| 4. The `task-title` hooks | `data-task-id` and `data-morph` bindings in TopPick, PickerRow, Now and the editor | `top-pick.spec.ts`, `picker-row.spec.ts`, `now.spec.ts` and `task-editor.spec.ts` cases; the e2e asserts exactly one element is named |
| 5. e2e: `view-transitions.spec.ts` | The recorder and five tests | The spec green on both stacks, seen to fail once; both full suites green |
| 6. Docs | `building-pwa-ui`, `libs/design-tokens/README.md` | `check-spdx`, the grep for literal timings in the skill, `format:check` |

### Unit 1: motion foundation

**Before building,** ask the maintainer whether the amendment below may be applied to the design-system artifact. Record the answer in this plan. With a go-ahead, apply it and build unit 1 as written. Without, build the decision 4 fallback.

**Answered 2026-10-05: go-ahead.** The maintainer asked for the amendment to be applied as part of the build. It was published to the artifact on 2026-10-05 (its version 10), word for word as below, and unit 1 was built as written, not the fallback.

**Files it owns:**
- `libs/design-tokens/src/base.tokens.json`;
- `apps/pwa/src/styles.css`, lines 202, 206 and the kill-switch block at 209-224;
- `apps/pwa/src/app/ui/button/button.ts`, `ui/picker-row/picker-row.ts`, `ui/section-header/section-header.ts`, `ui/segmented/segmented.ts`, `ui/estimate-field/estimate-field.ts`, each at the line below only;
- new: `apps/pwa/src/app/core/platform/motion.ts`, `motion.spec.ts`, `haptics.ts`, `haptics.spec.ts`.

**Tokens.** `base.tokens.json` gains, after the `size` group:
- `"duration": { "$type": "duration", ... }` with `duration-quick` (`{ "value": 150, "unit": "ms" }`) and `duration-moderate` (`{ "value": 250, "unit": "ms" }`);
- `"easing": { "$type": "cubicBezier", ... }` with `ease-out` (`[0, 0, 0.58, 1]`), `ease-in` (`[0.42, 0, 1, 1]`) and `ease-emphasized` (`[0.2, 0, 0, 1]`).

Under the decision 4 fallback, the groups hold only `duration-quick` and `ease-out`, the enums only `Quick` and `Out`, the expected output and the check below drop the other three variables, and the `--ease-emphasized` grep looks for `--ease-out: cubic-bezier(0, 0, 0.58, 1)` instead.

Each token's `$description` is the "For" column of decision 1. The root `$description` (line 2) becomes: "The ASYS tokens that are the same in every theme and palette: font families, type styles, spacing, radii, the type scale, sizes, durations and easings. Copied from the ASYS design system artifact, which stays the source of truth. Its tokens.json has no motion family, so the durations and easings mirror its README's States and motion section."

Expected output in `dist/libs/design-tokens/css/tokens.css`, inside `:root, [data-theme="light"]`: `--duration-quick: 150ms;`, `--duration-moderate: 250ms;`, `--ease-out: cubic-bezier(0, 0, 0.58, 1);`, `--ease-in: cubic-bezier(0.42, 0, 1, 1);`, `--ease-emphasized: cubic-bezier(0.2, 0, 0, 1);`. None of them appears in the dark or drive blocks.

**The eight literal timings,** each `150ms ease-out` replaced by `var(--duration-quick) var(--ease-out)` and nothing else changed:

| # | File:line | Today |
| --- | --- | --- |
| 1 | `apps/pwa/src/styles.css:202` | `.asys-enter { animation: asys-fade-in 150ms ease-out; }` |
| 2 | `apps/pwa/src/styles.css:206` | `.asys-leave { animation: asys-fade-out 150ms ease-out; }` |
| 3 | `apps/pwa/src/app/ui/button/button.ts:50` | `transition: opacity 150ms ease-out;` |
| 4 | `apps/pwa/src/app/ui/picker-row/picker-row.ts:62` | `transition: background-color 150ms ease-out;` |
| 5 | `apps/pwa/src/app/ui/section-header/section-header.ts:42` | `transition: background-color 150ms ease-out;` |
| 6 | `apps/pwa/src/app/ui/section-header/section-header.ts:71` | `transition: transform 150ms ease-out;` |
| 7 | `apps/pwa/src/app/ui/segmented/segmented.ts:93` | `transition: background 150ms ease-out;` |
| 8 | `apps/pwa/src/app/ui/estimate-field/estimate-field.ts:125` | `transition: background 150ms ease-out;` |

After the change, the literal-timing grep finds nothing. It matches millisecond and second values, `cubic-bezier(` curves and the bare `ease`, `ease-in`, `ease-out` and `ease-in-out` keywords, but not the `--ease-*` variables:

```sh
grep -rnE '\b[0-9.]+m?s\b|cubic-bezier\(|(^|[^-])\bease(-in|-out|-in-out)?\b' apps/pwa/src --include=*.css --include=*.ts --exclude=*.spec.ts --exclude-dir=generated
```

Today it finds exactly the eight lines of the table above. It cannot see a number passed to `Motion.play`; decision 2's contract covers that.

**The kill switches.** Inside the existing `@media (prefers-reduced-motion: reduce)` block (line 210), after the `*` rule:

```css
  :root::view-transition-group(*),
  :root::view-transition-old(*),
  :root::view-transition-new(*) {
    animation: none !important;
  }
```

After the existing drive rule (line 219):

```css
:root[data-theme='drive']::view-transition-group(*),
:root[data-theme='drive']::view-transition-old(*),
:root[data-theme='drive']::view-transition-new(*) {
  animation: none !important;
}
```

**`motion.ts`** exports:
- `enum MotionDuration { Quick = 'var(--duration-quick)', Moderate = 'var(--duration-moderate)' }`;
- `enum MotionEasing { Out = 'var(--ease-out)', In = 'var(--ease-in)', Emphasized = 'var(--ease-emphasized)' }`;
- `@Service() export class Motion` with:
  - `readonly reduced: Signal<boolean>`;
  - `allowed(): boolean`;
  - `play(el: Element, keyframes: Keyframe[] | PropertyIndexedKeyframes, options: KeyframeAnimationOptions): Promise<void>`.

It injects `DOCUMENT` and `DestroyRef`, and compares `data-theme` with `ThemeName.Drive` from `core/platform/theme.ts`.

| Input | Expected result |
| --- | --- |
| `window.matchMedia` is not a function | `reduced()` is false; constructing does not throw |
| `matchMedia('(prefers-reduced-motion: reduce)').matches` is true | `reduced()` is true |
| that query then reports a `change` with `matches: false` | `reduced()` is false |
| the injector is destroyed | the `change` listener is removed |
| `Element.prototype.animate` is missing (jsdom's default) | `allowed()` is false |
| `animate` present, not reduced, `data-theme` is `light`, `dark` or absent | `allowed()` is true |
| `animate` present, not reduced, `data-theme` is `drive` | `allowed()` is false, read live at each call |
| `animate` present, reduced | `allowed()` is false |
| `play` while not allowed | resolves without calling `el.animate`, with no timer |
| `play(el, kf, { duration: MotionDuration.Moderate, easing: MotionEasing.Emphasized, fill: 'both' })` while allowed, with `--duration-moderate` reading `250ms` and `--ease-emphasized` reading `cubic-bezier(0.2, 0, 0, 1)` on `<html>` | `el.animate(kf, { duration: 250, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'both' })` is called once |
| a duration token reading `0.25s` | resolved to 250 |
| `duration: 120` (a number) | passed through unchanged |
| a `var(--x)` that reads as an empty string | resolves at once without calling `animate` |
| `finished` still pending | `play` has not resolved |
| `finished` resolves | `play` resolves |
| `finished` rejects with a `DOMException` named `AbortError` | `play` resolves |
| `finished` rejects with any other error | `play` resolves, and `console.error` is called with that error |
| `el.animate` throws (a bad keyframe) | `play` resolves, and `console.error` is called with that error |
| `leave` while allowed | `data-leaving` is set on `event.target` before `el.animate` is called, and `animationComplete` is called once, after `finished` resolves |
| `leave` while not allowed | `data-leaving` is set, `el.animate` is not called, and `animationComplete` is called once |
| `leave` when `el.animate` throws, or `finished` rejects with any other error | `leave` resolves, and `animationComplete` is called once |

Tokens are read with `getComputedStyle(document.documentElement).getPropertyValue(name).trim()`.

**`haptics.ts`** exports `export const HAPTIC_TICK_MS = 15;` and `@Service() export class Haptics` with `tick(): void`.

| Input | Expected result |
| --- | --- |
| `navigator.vibrate` is not a function (jsdom's default) | `tick()` does nothing and does not throw |
| `navigator.vibrate` is a spy | `tick()` calls it once with 15 |
| `vibrate` throws | `tick()` does not throw |
| reduced motion | `tick()` still vibrates |
| the constant | `HAPTIC_TICK_MS` is at least 10 and at most 20 |

**Tests to write:** `motion.spec.ts` and `haptics.spec.ts`, one case per row.
- Stub with `vi.stubGlobal('matchMedia', ...)` and `vi.unstubAllGlobals()` in `afterEach`, as in `theme.spec.ts`.
- Stub `animate` with `Object.defineProperty(Element.prototype, 'animate', { value: spy, configurable: true })`, and `navigator.vibrate` the same way. Undo both with `Reflect.deleteProperty` in `afterEach`, because the builder runs specs with `isolate: false` in one jsdom.
- Set token values with `document.documentElement.style.setProperty('--duration-moderate', '250ms')` and the like. jsdom resolves custom properties set inline on `<html>` through `getComputedStyle`, so there is no stub. `afterEach` removes each with `removeProperty`. Other specs in the same jsdom call the real `getComputedStyle` (`now.spec.ts:321`, `task-editor.spec.ts:435`), so if a case ever spies on it, `afterEach` also calls `vi.restoreAllMocks()`: the test config sets no `restoreMocks`.
- Reset `data-theme` on `<html>` in `afterEach`.

Existing tests broken: none. jsdom ignores the CSS.

**The design-system amendment,** to apply only with the go-ahead.

Replace the README's "States and motion" section with:

```markdown
### States and motion

- Focus: a 2px solid `focus` ring with a 2px offset, so it always lands on the ground. Never remove it.
- Pressed: `signal-soft` behind the row or button. Disabled: 40% opacity, plus the reason in `reason` text where there is room ("Needs an Estimate").
- Queued offline edits show a small "Queued" chip in `ink-muted` with a `line-strong` border until the server confirms; failed replays become Review items, never dialogs.
- Motion is short and functional, and it never blocks the next tap. There are two durations:
  - `duration-quick`, 150ms: presses, sheets and small state changes, and switching tabs.
  - `duration-moderate`, 250ms: things that move across the screen (page changes, a swipe settling, the capture flight, a gap closing).
- Easing says what a thing does: `ease-out` for what arrives or responds, `ease-in` for what leaves, `ease-emphasized` for what moves across the screen.
- Switching tabs fades through: the old screen fades out, the new one fades in with a small drift, and the current tab's mark glides to its new place. Opening a Task slides the screen sideways and moves the Task title into place; going back reverses it.
- No motion in Voice only, and none at all under `prefers-reduced-motion`: every change happens at once, and every word, check and status line stays.
```

Add after "Layout":

```markdown
### Undo bar

- After Done, the Task leaves at once and an Undo bar shows for 5 seconds. Done is sent when the bar closes, so Undo is the only way back.
- The bar is `surface` with a 1px `line` top border and no shadow. It sits directly above the bottom bar, with the capture button above it, and never covers the last row.
- It reads: a check and "Done" in `ink-muted`, the Task title on one line with an ellipsis, then an "Undo" button. It pauses while a finger or focus is in it.
- The one-line title is an exception to "Never truncate a Task title to one line in Now": the bar is chrome, not the list, and its status line announces the full title.
- In Voice only it sits at the bottom, with `tap-target-drive` and no shadow.

### Swipe

- In Now, the top pick and the ranked rows can be swiped: right for Done, left for Log progress. A swipe is a shortcut; the same actions stay on buttons.
- Behind the row, the reveal is `sunken` with its word in `ink-muted` until the swipe passes its commit point. Then Done turns `signal` with the check and "Done" in `on-signal`, and Log progress turns `signal-soft` with `on-signal-soft`. A short haptic marks arming and disarming.
- A direction that cannot act gives way with resistance and says why ("Needs an Estimate").
- No swipe in Voice only.
```

Replace the Iconography paragraph with:

```markdown
ASYS has no icon set yet. Until one is chosen, use words: the Voice meter, the check before "Done" and a chevron for collapsible sections are the only glyphs, drawn in CSS or inline SVG in `ink` or `ink-muted` at 3:1 or more. One exception: on an armed Done swipe, the check and "Done" sit on `signal` and are drawn in `on-signal`. Do not use emoji.
```

**Check:**
- `pnpm exec nx run design-tokens:css`, then `grep -- '--duration-quick: 150ms' dist/libs/design-tokens/css/tokens.css` and `grep -- '--ease-emphasized: cubic-bezier(0.2, 0, 0, 1)' dist/libs/design-tokens/css/tokens.css` each find one line. `palettes --check` does not cover base tokens: the resolver only refers to `base.tokens.json`.
- The literal-timing grep above finds nothing.
- `pnpm exec nx run-many -t lint typecheck test build -p pwa`, with `motion.spec.ts` and `haptics.spec.ts` green.
- `node scripts/check-spdx.mts` and `pnpm exec nx format:check --all`.

### Unit 2: route levels and transition kinds

**Files it owns:**
- `apps/pwa/src/app/app.routes.ts` and `app.routes.spec.ts`;
- new: `apps/pwa/src/app/core/platform/view-transitions.ts` and `view-transitions.spec.ts`;
- new: `apps/pwa/src/app/core/platform/task-morph.ts`.

**`app.routes.ts`.** Each ShellLayout child gains `data: { level: N }` with the levels of decision 7. Nothing else changes.

**`task-morph.ts`:** `@Service() export class TaskMorph { readonly taskId = signal<string | null>(null); }`. Only the handler writes it.

**`view-transitions.ts`** exports:

```ts
export enum TransitionKind {
  None = 'none',
  TabForward = 'tab-forward',
  TabBack = 'tab-back',
  Push = 'push',
  Pop = 'pop',
  Swap = 'swap',
}

export interface RouteMotion {
  path: string;
  level: number;
  tab: number | null;
  auth: boolean;
}

export const routeMotion = (snapshot: ActivatedRouteSnapshot): RouteMotion => { ... };

export const transitionKind = (from: RouteMotion, to: RouteMotion): TransitionKind => { ... };

export const onViewTransitionCreated = (info: ViewTransitionInfo): void => { ... };
```

`ActivatedRouteSnapshot` and the type `ViewTransitionInfo` come from `@angular/router`. A module constant `TAB_PATHS: readonly string[] = ['/now', '/today', '/inbox']` gives the tab order.

**`routeMotion(snapshot)`** starts at the root snapshot and walks `firstChild` to the leaf.
- `path` is `'/'` followed by every `url` segment's `path` along the way, joined with `/`. Query and fragment are left out.
- If the leaf's `data['level']` is a number, `level` is it and `auth` is false. Otherwise `level` is 0 and `auth` is true.
- `tab` is the index of `path` in `TAB_PATHS`, or null.

| Snapshot (after navigating the spec's test routes) | Result |
| --- | --- |
| the root before any navigation | `{ path: '/', level: 0, tab: null, auth: true }` |
| `/now` | `{ path: '/now', level: 0, tab: 0, auth: false }` |
| `/today` | `{ path: '/today', level: 0, tab: 1, auth: false }` |
| `/inbox` | `{ path: '/inbox', level: 0, tab: 2, auth: false }` |
| `/capture?text=x` | `{ path: '/capture', level: 0, tab: null, auth: false }` |
| `/tasks/abc` | `{ path: '/tasks/abc', level: 1, tab: null, auth: false }` |
| `/settings/areas/abc` | `{ path: '/settings/areas/abc', level: 3, tab: null, auth: false }` |
| `/signin` | `{ path: '/signin', level: 0, tab: null, auth: true }` |

**`transitionKind(from, to)`** applies the matrix of decision 7, rules 1 to 5, in order. It is pure.

**`onViewTransitionCreated({ transition, from, to })`** runs in the router's injection context. It injects `DOCUMENT`, `Motion`, `TaskMorph` and `DataStore`. It does this, in order:
1. `kind = transitionKind(routeMotion(from), routeMotion(to))`.
2. **Skip.** If `kind` is None, or `motion.allowed()` is false, call `transition.skipTransition()` and return. The attribute is not set, nothing is named, and `active` is left as it was, so a transition this one interrupted still cleans up after itself.
3. **Take over.** If `active` is not null, remove `data-morph` from the element it named (if any). Then `active = transition`.
4. **The attribute.** `document.documentElement.setAttribute('data-transition', kind)`.
5. **The morph.** Let `id` be the `taskId` parameter of the leaf of `to` when the kind is Push, or of `from` when the kind is Pop, read with `paramMap.get('taskId')` on a leaf whose path starts with `/tasks/`. There is a morph when:
   - the kind is Push and `id` is not null; or
   - the kind is Pop, `id` is not null, `routeMotion(to).path` is `/now`, and `dataStore.now()?.ranked` lists a Task with that id.
6. **Old side.** With a morph, take the first element of `document.querySelectorAll('[data-task-id]')` whose `dataset.taskId` equals `id` and whose `closest('[data-leaving]')` is null. If there is one, set `data-morph` on it, remember it as this transition's named element, and set `taskMorph.taskId` to `id`. In every other case set `taskMorph.taskId` to null.
7. **Cleanup.** Attach `transition.finished.then(cleanup, cleanup)`. `then` with both arguments, not `finally`, so a rejected `finished` raises no unhandled rejection. `cleanup` does nothing unless `active === transition`. Otherwise it sets `active` to null, removes `data-transition` from `<html>`, removes `data-morph` from this transition's named element, and sets `taskMorph.taskId` to null.

**The handler spec** (`view-transitions.spec.ts`):
- It builds snapshots by navigating a TestBed router over small test routes: `signin` with no level, and a parent `''` whose component holds only a `<router-outlet>`, with children `now`, `today`, `inbox`, `capture` (level 0), `tasks/:taskId` (1), `settings` (1) and `settings/areas/:areaId` (3). It reads `TestBed.inject(Router).routerState.snapshot.root` after each navigation.
- It calls the handler through `TestBed.runInInjectionContext`.
- A fake `ViewTransition` is `{ skipTransition: vi.fn(), finished, ready, updateCallbackDone, types: new Set() }`, where `finished` is a promise the test resolves or rejects.
- `Motion` is `{ provide: Motion, useValue: { allowed: () => allowed, reduced: signal(false), play: vi.fn() } }`. `DataStore` is `{ provide: DataStore, useValue: { now: signal(result) } }`, where `result.ranked` holds `{ task: { id } }` entries.
- Hook elements are appended to `document.body` and removed in `afterEach`, which also removes `data-transition` from `<html>`.
- Every test settles every fake transition it creates, because `active` is module state and specs share one module graph.

| Case | Expected |
| --- | --- |
| `/now` to `/now?x=1` | `skipTransition` called once; no `data-transition` |
| `/signin` to `/now` | skipped as above |
| `/now` to `/inbox`, not allowed | skipped; no attribute; `taskMorph.taskId()` null |
| `/now` to `/inbox`, allowed | `data-transition="tab-forward"`; `skipTransition` not called |
| `/inbox` to `/today` | `tab-back` |
| `/now` to `/capture` | `swap` |
| `/now` to `/tasks/abc`, body holds `<h2 data-task-id="abc">` and `<span data-task-id="abc" data-leaving>` | `push`; only the `h2` has `data-morph`; `taskMorph.taskId()` is `'abc'` |
| `/now` to `/tasks/abc`, body holds `<li data-leaving><span data-task-id="abc"></span></li>` and, after it, `<h2 data-task-id="abc">` | `push`; only the `h2` has `data-morph`, because the `span`'s ancestor is leaving |
| `/now` to `/tasks/abc`, no hook in the body | `push`; nothing has `data-morph`; `taskMorph.taskId()` null |
| `/tasks/abc` to `/now`, `abc` ranked, body holds `<h1 data-task-id="abc">` | `pop`; the `h1` has `data-morph`; `taskMorph.taskId()` is `'abc'` |
| `/tasks/abc` to `/now`, `abc` not ranked (the Done Pop) | `pop`; nothing named; `taskMorph.taskId()` null |
| `/tasks/abc` to `/inbox`, `abc` ranked | `pop`; nothing named |
| `/tasks/abc` to `/tasks/def` | `swap`; nothing named |
| a handled transition, then its `finished` resolves | attribute removed; `data-morph` removed from its element; `taskMorph.taskId()` null |
| its `finished` rejects | the same cleanup; no unhandled rejection |
| A is `/now` to `/tasks/abc` (names the `h2`); B is `/tasks/abc` to `/inbox`; then A's `finished` resolves | after B's handler the `h2` has no `data-morph`; after A settles the attribute is still `pop` and B's state is intact; after B settles the attribute is gone |
| A is a Push with a morph; B is `/now` to `/now` (skipped); then A's `finished` resolves | B leaves A's state alone; A's settle removes the attribute and the name |

**`routeMotion` cases** go in the same spec, one per row of the `routeMotion` table, and `transitionKind` gets one `it.each` row per row of the decision 7 matrix, with plain `RouteMotion` values.

**`app.routes.spec.ts` gains:**
- "gives every ShellLayout child a numeric level": find the route whose `component` is `ShellLayout`, and assert each child's `data?.['level']` is a number and that the path-to-level map equals decision 7's table. A new shell route without a level fails here.
- for each URL of its existing titles table, after `harness.navigateByUrl(url)`, `routeMotion(TestBed.inject(Router).routerState.snapshot.root)` has that route's `level` and `auth: false`.

Existing tests broken: none.

**Check:** `pnpm exec nx run-many -t lint typecheck test -p pwa`, `node scripts/check-spdx.mts`. Each new handler case is seen to fail once; for the race, by removing the `active === transition` comparison.

### Unit 3: shell names, the ladder and keyframes

**Files it owns:** `apps/pwa/src/app/app.config.ts` and `apps/pwa/src/styles.css` (a new block only).

**`app.config.ts:21`** becomes `provideRouter(routes, withComponentInputBinding(), withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated }))`.

**`styles.css`** gains this block between `.asys-leave` (line 205) and the kill-switch comment (line 209), before formatting:

```css
/* View transitions: only named regions animate. core/platform/view-transitions.ts sets data-transition. */
:root { view-transition-name: none; }
::view-transition { pointer-events: none; }
.shell__page { view-transition-name: page; }
.shell__capture, .shell__quickadd { view-transition-name: shell-capture; }
.asys-undobar { view-transition-name: shell-undo; }
.shell__nav { view-transition-name: shell-nav; }
.asys-bottomnav__item[aria-current='page'] .asys-bottomnav__pill { view-transition-name: nav-mark; }
[data-morph] { view-transition-name: task-title; }
[data-leaving], [data-leaving] * { view-transition-name: none !important; }

/* The ladder: page auto, task-title 1, shell chrome 2, nav-mark 3. */
::view-transition-group(task-title) { z-index: 1; }
::view-transition-group(shell-capture),
::view-transition-group(shell-undo),
::view-transition-group(shell-nav) { z-index: 2; }
::view-transition-group(nav-mark) { z-index: 3; }

::view-transition-group(*) {
  animation-duration: var(--duration-moderate);
  animation-timing-function: var(--ease-emphasized);
}

/* The Undo bar runs its own entrance. Only the live bar shows, never two stacked images. */
::view-transition-old(shell-undo) { display: none; }
::view-transition-new(shell-undo) { animation: none; mix-blend-mode: normal; }

@keyframes asys-vt-through-out { from { opacity: 1; } 35%, to { opacity: 0; } }
@keyframes asys-vt-through-in-from-right {
  from, 35% { opacity: 0; translate: var(--space-4) 0; }
  to { opacity: 1; translate: 0 0; }
}
@keyframes asys-vt-through-in-from-left {
  from, 35% { opacity: 0; translate: calc(-1 * var(--space-4)) 0; }
  to { opacity: 1; translate: 0 0; }
}
@keyframes asys-vt-axis-out-left {
  from { opacity: 1; translate: 0 0; }
  35% { opacity: 0; }
  to { opacity: 0; translate: calc(-1 * var(--space-6)) 0; }
}
@keyframes asys-vt-axis-in-from-right {
  from { opacity: 0; translate: var(--space-6) 0; }
  35% { opacity: 0; }
  to { opacity: 1; translate: 0 0; }
}
@keyframes asys-vt-axis-out-right {
  from { opacity: 1; translate: 0 0; }
  35% { opacity: 0; }
  to { opacity: 0; translate: var(--space-6) 0; }
}
@keyframes asys-vt-axis-in-from-left {
  from { opacity: 0; translate: calc(-1 * var(--space-6)) 0; }
  35% { opacity: 0; }
  to { opacity: 1; translate: 0 0; }
}
@keyframes asys-vt-fade-in { from { opacity: 0; } to { opacity: 1; } }

:root[data-transition='tab-forward']::view-transition-group(page),
:root[data-transition='tab-back']::view-transition-group(page),
:root[data-transition='swap']::view-transition-group(page) {
  animation-duration: var(--duration-quick);
}
:root[data-transition='tab-forward']::view-transition-old(page),
:root[data-transition='tab-back']::view-transition-old(page) {
  animation: asys-vt-through-out var(--duration-quick) var(--ease-in) both;
}
:root[data-transition='tab-forward']::view-transition-new(page) {
  animation: asys-vt-through-in-from-right var(--duration-quick) var(--ease-out) both;
}
:root[data-transition='tab-back']::view-transition-new(page) {
  animation: asys-vt-through-in-from-left var(--duration-quick) var(--ease-out) both;
}
:root[data-transition='push']::view-transition-old(page) {
  animation: asys-vt-axis-out-left var(--duration-moderate) var(--ease-emphasized) both;
}
:root[data-transition='push']::view-transition-new(page) {
  animation: asys-vt-axis-in-from-right var(--duration-moderate) var(--ease-emphasized) both;
}
:root[data-transition='pop']::view-transition-old(page) {
  animation: asys-vt-axis-out-right var(--duration-moderate) var(--ease-emphasized) both;
}
:root[data-transition='pop']::view-transition-new(page) {
  animation: asys-vt-axis-in-from-left var(--duration-moderate) var(--ease-emphasized) both;
}
:root[data-transition='swap']::view-transition-old(page) {
  animation: asys-fade-out var(--duration-quick) var(--ease-out) both;
}
:root[data-transition='swap']::view-transition-new(page) {
  animation: asys-vt-fade-in var(--duration-quick) var(--ease-out) both;
}
```

How the easings apply: a timing function applies to each keyframe interval of each property. In the fade-through, `--ease-in` shapes the old page's 0 to 35% fade, and `--ease-out` shapes the new page's 35 to 100% fade and drift. In Push and Pop, `--ease-emphasized` shapes the whole slide, while the opacity is gone by 35% or starts after it.

`.asys-undobar` matches nothing until plan 3 renders the bar. `asys-fade-out` is the existing keyframe at line 191.

Behaviour, in a browser with `startViewTransition`:
- No component's `styles` gains a view-transition rule.
- Under reduced motion or Voice only, no transition runs: the handler skips, and the kill switches of unit 1 stand behind it.
- `nav-mark` paints above `shell-nav` during a tab change (unit 5 asserts it).

Existing tests broken: none. No spec imports `appConfig`.

**Check:**
- `pnpm exec nx build pwa` with no budget warning. Record the initial total before and after; it was about 481 kB of the 500 kB warning in the research digest.
- `pnpm exec nx run-many -t lint typecheck test -p pwa`, `pnpm exec nx format:check --all`.
- The dev-stack suite, `pnpm exec nx e2e pwa-e2e`, stays green with transitions on.

### Unit 4: the `task-title` hooks

**Files it owns:**
- `apps/pwa/src/app/ui/top-pick/top-pick.ts` and `top-pick.spec.ts`;
- `apps/pwa/src/app/ui/picker-row/picker-row.ts` and `picker-row.spec.ts`;
- `apps/pwa/src/app/features/now/now.ts` and `now.spec.ts`;
- `apps/pwa/src/app/features/task/task-editor.ts` and `task-editor.spec.ts`.

**TopPick** gains `readonly taskId = input<string | null>(null)` and `readonly morph = input<boolean>(false)`. The `h2.asys-top-pick__title` (line 16) gains `[attr.data-task-id]="taskId()"` and `[attr.data-morph]="morph() ? '' : null"`.

**PickerRow** gains the same two inputs. The `span.asys-picker-row__title` (line 27) gains the same two bindings. The host `<a>` gains no attribute and no class.

**Now** adds `protected readonly morphId = inject(TaskMorph).taskId`.
- The top pick (lines 51-62) binds `[taskId]="top.task.id"` and `[morph]="morphId() === top.task.id"`.
- Ranked rows (lines 95-103) and Waiting rows (lines 120-127) bind `[taskId]="item.task.id"` and `[morph]="morphId() === item.task.id"`.

**TaskEditor** adds `protected readonly morph = computed(() => this.taskMorph.taskId() === this.taskId())`, with `taskMorph = inject(TaskMorph)`. The `h1` (line 123) gains `[attr.data-task-id]="taskId()"` and `[attr.data-morph]="morph() ? '' : null"`.

| Spec | Input | Expected |
| --- | --- | --- |
| `top-pick.spec.ts` | `taskId` `'abc'` | the title has `data-task-id="abc"` |
| | `taskId` null (the default) | no `data-task-id` |
| | `morph` true, then false | `data-morph` present, then absent |
| | defaults | neither attribute; the existing tests hold |
| `picker-row.spec.ts` | `taskId` `'42'`, `morph` true | `.asys-picker-row__title` has `data-task-id="42"` and `data-morph`; the host is still an `<a>` with its `href` (`picker-row.spec.ts:49-54`) and has no new class |
| `now.spec.ts` | the existing four-Task state | the top pick title and each ranked row title carry their own Task id |
| | Waiting expanded | each Waiting row title carries its id |
| | `TaskMorph.taskId` set to the second ranked id | exactly one element in the fixture has `data-morph`: that row's title |
| | `TaskMorph.taskId` set to the top id | exactly one: the top pick title |
| | an id that is not listed, or null | no element has `data-morph` |
| `task-editor.spec.ts` | the editor for `abc` | the `h1` has `data-task-id="abc"` |
| | `TaskMorph.taskId` `'abc'`, then `'def'` | `data-morph` present, then absent |

`TaskMorph` is the real root service in these specs, set with `TestBed.inject(TaskMorph).taskId.set(...)`.

Existing tests broken: none. The new inputs default to off, and the asserted selectors (`now.spec.ts:524`, `top-pick.spec.ts:90-94` and `:161-170`) are unchanged.

**Check:** `pnpm exec nx run-many -t lint typecheck test build -p pwa`. The build is the template check, because `pwa:typecheck` skips templates.

### Unit 5: e2e, `view-transitions.spec.ts`

**Files it owns:** new `apps/pwa-e2e/src/view-transitions.spec.ts`. It imports `expect` and `test` from `./support/fixtures.ts` and `seedTask` from `./support/seed.ts`. Only erasable syntax.

**The recorder contract.**
- A `test.beforeEach` calls `page.addInitScript(...)`, then `page.reload()`. The fixture has already left the page on `/now`, so the script reaches only documents loaded after it.
- The script declares `window.__viewTransitions: TransitionRecord[]`, typed in a `declare global` block as in `apps/pwa-e2e/src/now.spec.ts:7-11`.
  - `TransitionRecord` is `{ kind: string | null; oldNames: Named[]; newNames: Named[]; skipped: boolean; settled: boolean; navMarkZ: string | null; shellNavZ: string | null }`.
  - `Named` is `{ name: string; tag: string; classes: string }`.
- If `Document.prototype.startViewTransition` is not a function, the script does nothing. Otherwise it wraps it: it calls the original, pushes a new record and returns the transition unchanged.
- **After the call returns,** in a `queueMicrotask`, the wrapper reads the attribute and the old-side names. Angular runs the handler synchronously after `startViewTransition` returns (`_router-chunk.mjs:3704-3731`), so the microtask runs after the handler.
  - `kind` is `document.documentElement.getAttribute('data-transition')`.
  - `oldNames` lists every element under `<body>` whose computed `viewTransitionName` is not `none`.
- **On `ready`,** the new DOM is in place. `newNames` is read the same way. `navMarkZ` and `shellNavZ` are the computed `zIndex` of `getComputedStyle(document.documentElement, '::view-transition-group(nav-mark)')` and `(shell-nav)`. Then `settled` is set.
- **When `ready` rejects,** `skipped` and `settled` are set. This records every skip.
- A helper `lastSettled(page)` polls with `expect.poll` until the newest record has `settled`, then returns it.

**Tests:**

| Test | Steps | Expected |
| --- | --- | --- |
| "switches tabs with a fade-through and keeps the mark above the nav" | In the `Primary` navigation, click Inbox, then Today, then Now | kinds `tab-forward`, `tab-back`, `tab-back`, none skipped. Each `oldNames` has `page`, `shell-nav` and `nav-mark`, and `newNames` has one `nav-mark`. On the first, `navMarkZ` is `'3'` and `shellNavZ` is `'2'` |
| "opens the top pick with Push and moves its title, then goes back with Pop" | `seedTask` "Send the report" (25 min), reload; click the top pick's Open; then `page.goBack()` | First: `push`; `oldNames` has exactly one `task-title`, an `h2` with class `asys-top-pick__title`; `newNames` exactly one, an `h1` with class `task-editor__title`. Second: `pop`, the two reversed |
| "moves a ranked row's title into the editor" | Seed two Tasks, reload; click the second Task's row link | `push`; exactly one `task-title` in `oldNames`, a `span` with class `asys-picker-row__title`; exactly one in `newNames`, the `h1` |
| "goes back from the editor's Done without a morph" | Seed one Task, reload; Open it; click the editor's Done (exact name) | URL `/now`; the last record is `pop`; no `task-title` in its `oldNames` or `newNames` |
| "skips every transition under reduced motion" | `test.use({ reducedMotion: 'reduce' })` in its own `describe`; click Inbox | The Inbox heading shows; the newest record has `skipped` true and `kind` null; `<html>` has no `data-transition` |

**Proving it can fail,** a local check that is not committed, recorded in the plan's "Built on" section when the plan is built, as the template does:
- with `::view-transition-group(nav-mark)` set to `z-index: 1`, the first test fails on `navMarkZ`;
- with the morph's "listed in Now" condition removed, the Done test fails on `task-title`.

Plan 3 adds a case to this file: during the editor's Done Pop, `shell-undo` is in `newNames`.

**Check:**
- `pnpm exec nx e2e pwa-e2e -- src/view-transitions.spec.ts`, then the whole `pnpm exec nx e2e pwa-e2e`.
- The image stack per `README.md`, then `pnpm exec nx run pwa-e2e:e2e-image`. The production build logs no `AbortError`, so this run also shows the transitions without dev-mode noise.
- `pnpm exec nx run-many -t lint typecheck -p pwa-e2e`.
- `node scripts/check-spdx.mts` and `pnpm exec nx format:check --all`.

### Unit 6: docs

**`.agents/skills/building-pwa-ui/SKILL.md`:**
- The layers table (line 16): the `core/platform` seams list gains `Motion`, `Haptics` and `TaskMorph`.
- "Styling" (lines 32-35):
  - Line 34 becomes: "Add a `[data-theme='drive']` rule when tap size must differ in Voice only. Motion needs none: the kill switches in `src/styles.css` and `Motion.allowed()` already turn it off there and under reduced motion."
  - New: "Timings come only from the motion tokens `--duration-quick`, `--duration-moderate`, `--ease-out`, `--ease-in` and `--ease-emphasized`. Never write a literal `ms` value or curve."
  - New: "Script motion goes through `Motion.play` with `MotionDuration` and `MotionEasing`, and a haptic through `Haptics.tick()`. Never call `animate` or `navigator.vibrate` directly; jsdom has neither."
  - New: "View-transition CSS (names, the z-index ladder, keyframes) lives only in `src/styles.css`. The ladder is `page` auto, `task-title` 1, `shell-capture`, `shell-undo` and `shell-nav` 2, `nav-mark` 3. New fixed shell chrome gets a name and a rung, or the sliding page paints over it."
- "Screen and route", step 2: "... under `ShellLayout` with `data: { level }`: 0 for a tab or a screen of its own, otherwise one more than the screen it opens from. `app.routes.spec.ts` fails without it, and the level decides Push, Pop or Swap."
- "Tests and checks" gains: "Specs that render scripted motion provide a fake `Motion` whose `play` promise they control. The real one resolves at once in jsdom."

**`libs/design-tokens/README.md`:**
- Line 7 lists durations and easings among the base tokens.
- The export mapping (line 42) adds: "`duration` and `easing` have no counterpart in the artifact's `tokens.json`; they mirror its README's States and motion section."
- Line 43, on `$type`, becomes: "every group but `typography` sets `$type`: `color`, `shadow`, `fontFamily`, `duration` for `duration`, `cubicBezier` for `easing`, and `dimension` for the rest".

**Not changed:** `CONTEXT.md` (this plan adds no term), `docs/slice-1-plan.md` (the record of slice 1).

**Check:** `node scripts/check-spdx.mts`; unit 1's literal-timing pattern, run as `grep -nE '<pattern>' .agents/skills/building-pwa-ui/SKILL.md`, finds nothing (it finds nothing today either); `pnpm exec nx format:check --all`.

## Built on 2026-10-05

All six units were built in order, as written, on the go-ahead branch of decision 4 (unit 1 records the answer). Each unit's source and its tests were written separately from the same contract, and every new test was then seen to fail on an assertion by breaking the behaviour it covers.

### Departures from the plan

- **Unit 5's helper takes a count.** `lastSettled(page, before)` waits until a record newer than the first `before` records exists and has settled, and returns it. Polling only the newest record could return the previous navigation's record when a click has not started its transition yet.
- **Unit 5's recorder wraps `startViewTransition` with an arrow function** that applies the original to `document`, in line with the const-arrow convention, rather than a `function` expression bound to `this`.
- **Whitespace around two titles.** oxfmt laid the TopPick `h2` and the editor `h1` out over several lines once they gained two bindings, so their text nodes now carry a leading and a trailing space (Angular collapses whitespace but does not trim it). Nothing renders differently, and every assertion on these titles trims or normalises. The PickerRow title keeps its projected text exact.
- **`Motion.play` resolves only an exact `var(--name)`.** A `var()` with a fallback, or any other string, passes through unchanged. Callers pass the enums, so this never arises in practice.
- **Extra spec cases.** The specs pin a few behaviours the tables imply but do not list: the `TransitionKind` and enum string values, a cleanup that leaves alone a `data-morph` it did not set, an interrupted transition whose `finished` rejects, a takeover by a second transition that names its own element, a Waiting row's morph in Now, and options other than `duration` and `easing` passing through `play`.

### Verification (2026-10-05)

- **Proving the tests can fail.** Unit 1: breaking the `AbortError` test, the Voice only test, the seconds conversion, the listener removal and the vibrate argument failed seven `motion.spec.ts` and `haptics.spec.ts` cases. Unit 2: removing the `active` comparison failed the three race cases on the attribute (`expected null to be 'pop'`); breaking the leaving test, the ranked test, the skip call, Push and Pop, and one route level failed 28 cases. Unit 4: dropping one binding per component failed nine hook cases. Unit 5, as planned: `::view-transition-group(nav-mark)` at `z-index: 1` failed the tab test on `navMarkZ` (`Expected: "3"`, `Received: "1"`), and the morph without its "listed in Now" condition failed the Done test on `task-title`.
- **Gate.** `nx run-many -t lint typecheck build test --skip-nx-cache` passed for all seven projects: 1649 PWA tests in 57 files, 502 server, 676 domain (90 todo), 260 contract and 158 effect-passkeys. `tsc -p scripts/tsconfig.json`, `nx run server:openapi`, `nx format:check --all`, `check-spdx`, `reuse lint` (6.2.0), `check-licenses`, `palettes --check` and `pnpm audit --prod` passed. The literal-timing grep finds nothing in `apps/pwa/src` or in the skill.
- **Bundle.** The initial total went from 480.88 kB (127.21 kB transferred) to 488.97 kB after units 1 to 3 and 489.53 kB (129.13 kB) after unit 4, under the 500 kB warning, with no budget warning. The global stylesheet went from 6.42 kB to 10.20 kB, and no component's styles grew.
- **Tokens.** `tokens.css` holds the five motion variables in the light block only.
- **End-to-end.** `view-transitions.spec.ts` passed on the dev stack and against the production image, five tests each. The full dev-stack suite passed with transitions on: 26 tests, none skipped. The full image suite passed: 28 tests, the two image-only specs included.
- **The environment.** These runs used the container's Chromium 141 through a local browser-path shim, because Playwright 1.63 pins Chromium 153 (revision 1243) and the container could not install it. The image was built from a scratch copy of the `Dockerfile` that trusts the sandbox's TLS proxy in the `base` stage only, with the pinned Node image pulled by the same digest from a registry mirror; the runtime stage, which starts again from the Node image, is unchanged. CI runs both with its own pinned versions.

### Facts checked while building

1. **The recorder's microtask runs after Angular's handler:** confirmed. Every record carries the handler's `data-transition` and the old-side `task-title`.
2. **`getComputedStyle(document.documentElement, '::view-transition-group(nav-mark)')`** returns the group's `z-index` (`'3'`, and `'2'` for `shell-nav`) in Chromium.
3. **Two elements with one name skip the transition:** confirmed in a scratch page. `ready` rejects with `InvalidStateError` ("Transition was aborted because of invalid state"); with one of the two removed, it resolves.
4. **The Undo bar during a tab switch:** not checkable until plan 3 renders the bar. Both `shell-undo` rules are in the built, minified `styles.css`.
5. **Clicks right after a navigation** are not swallowed: the full dev-stack suite passed with transitions on, with no waiting added.
6. **The back gesture on the device:** open, after a deploy.
7. **The morph between two text sizes:** frames grabbed at a slowed playback rate show no stretching, because both titles are full-width blocks, so the group changes height, not width. The two sizes cross-fade inside the moving box. The judgement on the phone is still open.
8. **60 fps on the device:** open, after a deploy.
9. **The initial bundle:** see Verification.
10. **The amendment:** accepted, and the go-ahead branch was built.

### Changed after review (2026-10-06)

The maintainer's review of the pull request asked for these, and the code now differs from the units above as follows.

- **Swap keeps the browser's cross-fade.** Unit 3's two Swap rules used the `animation` shorthand, which replaced the UA's `animation-name` list and with it `-ua-mix-blend-mode-plus-lighter`. Two full-length fades then overlapped with normal blending, and anything both screens share dipped to about 75% at the midpoint. The rules now set only `animation-duration` and `animation-timing-function`, so the UA fades and their blend stay, and the `asys-vt-fade-in` keyframes are gone. A sixth e2e test checks that a Swap's new page carries the blend.
- **An unpaired title moves with the page.** Four `:only-child` rules give a `task-title` image with no partner the page's own Push or Pop slide, instead of the UA's fade in place above the sliding page. The Pop morph still asks `DataStore` whether Now lists the Task, so a Done Pop names nothing, as decision 9 says; the rules only cover a Now that drifts from that prediction in the same frame.
- **The take-over unnames everything first.** A new transition removes `data-morph` from every element before it names its own. Before, it cleared only the element the previous transition had named directly, which missed a partner that the `TaskMorph` binding had named on the new page. The cleanup on `finished` still clears only its own element, by reference.
- **`RouteMotion` is `{ path, level, tab, taskId }`.** `level` is null for a leaf without a numeric `data.level`, replacing `auth`, so the rule says what it checks: rule 2 of the matrix is now "either level is null". `taskId` is the leaf's `taskId` parameter, so the handler computes each side's `RouteMotion` once and needs no separate leaf walk.
- **`TaskMorph.taskId` is read-only.** The writable signal is private, and the handler names a Task with `TaskMorph.set(id)`, as `Theme` and `Motion` expose theirs.
- **One tab list.** `TAB_PATHS` lives in `core/platform/tabs.ts`, shared by the handler and the shell, which used it as `CAPTURE_PATHS`. `shell-layout.spec.ts` checks that it lists the bottom nav's links in order, and the `building-pwa-ui` skill names it for a new tab.
- **`/account`** joins the level check in `app.routes.spec.ts`.

Verified on 2026-10-06 as before: the new unit cases failed with the take-over clear removed, `TAB_PATHS` reordered and `/account` at level 1, and the Swap test failed on the shorthand rules (`Received string: "asys-fade-out"`). The gate passed for all seven projects with 1652 PWA tests, as did the format, SPDX and REUSE checks. The dev-stack suite passed with 27 tests and the image suite with 29. The initial total is 490.01 kB.

### Known limits

- Facts 6, 7 and 8 need the installed PWA on a phone.
- In dev mode every skipped transition (None, reduced motion, Voice only, an interrupted one) logs a rejected `ready` with `console.error`, as decision 11 says. The production build logs nothing.

## Out of scope

- **The Undo bar, the held Done, the capture flight and the swipe** (plans 3 and 2). This plan reserves `shell-undo`, its rung and the `data-leaving` exclusion. `--shell-nav-height` and `--shell-undo-height` come with plan 3.
- **A morph anywhere but Now and the editor.** The Inbox and Triage carry no `data-task-id`.
- **A morph on a Pop to a Waiting Task** (decision 9).
- **Moving the whole top pick or row,** rather than only the title.
- **Scroll restoration** and a per-navigation opt-out through `info`.
- **Cross-document, nested and element-scoped transitions.**
- **Checks on Safari and iOS.** The e2e runs only Chromium.

## Facts checked on 2026-10-05

Installed: `@angular/core` and `@angular/router` 22.2.1, TypeScript 6.0.3, jsdom 30.1.1, Vitest 5.0.2, `@playwright/test` 1.63.0, `@terrazzo/cli` and `@terrazzo/token-tools` 2.7.1. `@angular/animations` is not installed.

- **Angular router,** read in `node_modules/@angular/router`:
  - `withViewTransitions` is `@developerPreview 19.0` (`types/router.d.ts:876-878`). Its options are `skipInitialTransition` and `onViewTransitionCreated` (`:133`, `:139`), and `ViewTransitionInfo` is `{ transition, from, to }` (`:147`), exported as a type.
  - `from` and `to` are the root snapshots (`fesm2022/_router-chunk.mjs:3995`).
  - `createViewTransition` (`_router-chunk.mjs:3689`) returns early when the browser animated the navigation (`:3692`), updates the DOM with no transition when `startViewTransition` is missing (`:3697-3698`), calls `startViewTransition` (`:3704`), attaches `.catch` handlers to `updateCallbackDone`, `ready` and `finished` that `console.error` in dev mode (`:3708-3722`), and then calls `onViewTransitionCreated` synchronously in an injection context (`:3727`).
  - The update callback waits for `afterNextRender` (`createRenderPromise`, `:3735`), which works zoneless.
  - There is no per-navigation skip option; the only per-navigation hook is `info`.
  - Changelog 22.1.5 (2026-09-02): "avoid view transitions when the user agent provides one" (PR 70140).
- **TypeScript's DOM types:** `EffectTiming.duration` is `number | CSSNumericValue | string` (`node_modules/typescript/lib/lib.dom.d.ts:684`). `Document.startViewTransition` is typed as always present (`:13182`), so a guard must test `typeof`.
- **Terrazzo 2.7.1:** a `duration` token prints as `${value}${unit}` (`token-tools/dist/css/duration.js`), and a `cubicBezier` token as `cubic-bezier(a, b, c, d)` (`css/cubic-bezier.js`). The variable name is the leaf (`terrazzo.config.mts:27`, `:69`).
- **Browser support** (web-features 3.40.1, MDN browser-compat-data 8.1.4):
  - `document.startViewTransition`: Chrome 111, Safari 18, Firefox 144, Samsung 22. Baseline newly available since 2025-10-14.
  - `types` and `:active-view-transition-type()`: Chrome 125, Safari 18.2, Firefox 147.
  - `document.activeViewTransition`: Chrome 142, Safari 26.2, Firefox 147.
  - Nested groups: Chrome 140 and Samsung 30 only. Element-scoped transitions: Chrome 147 only.
  - `view-transition-name: auto` is not a value; `none`, a custom ident and `match-element` are.
  - `hasUAVisualTransition`: Chrome 118, Safari 18 (`PopStateEvent`), Firefox 149.
  - Individual transform properties (`translate`): Baseline widely available.
  - `navigator.vibrate`: Chrome Android 32; not in Safari or iOS; Firefox Android returns true but does not vibrate (bugs 1591113 and 1653318).
- **Specifications:**
  - CSS View Transitions Level 1: while rendering is suppressed for a view transition, all hit testing targets the document element. A new transition skips an active one with an `AbortError`, and `skipTransition()` still runs the update callback.
  - The same specification (Candidate Recommendation Draft, 2024-03-28, section 7.3.3): when a name has both an old and a new image, the image pair gets `isolation: isolate`, the old image gets `animation-name: -ua-view-transition-fade-out, -ua-mix-blend-mode-plus-lighter`, and the new image the same with `-ua-view-transition-fade-in`. The `plus-lighter` blend is applied by an animation there, so `animation: none` removes it too. Decision 6 still hides the old `shell-undo` image and sets `mix-blend-mode: normal`, so the bar does not rest on how a browser applies the blend.
  - The Vibration API returns false without sticky activation. Chrome checks `HasStickyUserActivation()`. A touch first activates the page at `pointerup`.
- **Secondary:** the `::view-transition` overlay takes every tap for the animation's length unless it has `pointer-events: none` (bram.us, 2025-01-29).
- **jsdom 30.1.1** has no `animate`, `getAnimations`, `startViewTransition`, `matchMedia`, `ResizeObserver` or `navigator.vibrate`, and every layout size is 0. It keeps `view-transition-name` in an element's inline style (`getPropertyValue` and `viewTransitionName` both read it back) and drops a truly unknown property. `getComputedStyle(document.documentElement).getPropertyValue('--duration-moderate')` returns a custom property set inline on `<html>` (`'250ms'`). The builder runs specs with `isolate: false`, and `apps/pwa/project.json` sets no `restoreMocks`. `animate.enter` and `animate.leave` do nothing there (`docs/slice-1-plan.md:724`).
- **Playwright 1.63.0:** the context option `reducedMotion` takes `'reduce'`, `'no-preference'` (the default) or null. `addInitScript` applies to documents loaded after it is added.
- **The repo:** exactly eight literal `150ms ease-out` timings exist (the unit 1 table, found by the unit 1 grep). The styles budget is `anyComponentStyle` 4 kB warning, 8 kB error, and the initial budget warns at 500 kB.
- **The design system** (artifact `6WGtLoDt9puFmGrYW52bbo`, read 2026-10-05): motion is "150ms ease-out for presses and sheets" with none in Voice only or under reduced motion (README line 70); `shadow-sheet` is only for bottom sheets and the quick-add bar (line 63); the check is drawn in `ink` or `ink-muted` (line 80); the bottom nav has no icons (BottomNav guide).

### Facts to check while building

1. **The recorder's microtask runs after Angular's handler,** so it sees `data-transition` and the old-side name. If it does not, read them in `updateCallbackDone` instead.
2. **`getComputedStyle(document.documentElement, '::view-transition-group(nav-mark)')`** returns the group's `z-index` in Playwright's Chromium. If not, the recorder reads the two rules from `document.styleSheets` instead.
3. **Two elements with one name skip the transition** (the critique's reading of the spec). Confirm it once with a deliberate duplicate in a scratch run, because the `data-leaving` rule rests on it.
4. **The Undo bar during a tab switch.** With the bar up, switch tabs in Chromium: the bar shows once, with no brightening and no second image beneath it. If it does, check that decision 6's two `shell-undo` rules are in the built `styles.css`.
5. **Clicks right after a navigation** are not swallowed in the existing e2e suite. If a spec flakes, wait for `document.activeViewTransition === null` before the next click.
6. **On the device: the back gesture** in the installed PWA. Chrome's own back animation plays, Angular starts none, and no stale `data-transition` stays on `<html>`.
7. **On the device: a morph between two text sizes** (the top pick's `display` and the editor's `title`). If the text stretches, try `::view-transition-old(task-title), ::view-transition-new(task-title) { height: 100%; object-fit: none; object-position: left top; }`. If it still reads badly, drop the `[data-morph]` rule and keep Push and Pop.
8. **On the device: 60 fps** for tabs, Push and Pop with a long Now, measured with a remote DevTools performance trace.
9. **The initial bundle** before and after units 1 to 4, against the 500 kB warning.
10. **Whether the amendment was accepted,** recorded at the top of unit 1, and which branch was built.

## Risks

- **The developer-preview API changes** on an Angular upgrade. Everything that touches it is in `view-transitions.ts` and one line of `app.config.ts`.
- **A duplicate name skips a transition silently.** A leaving pill or row next to its replacement is the likely cause. The `data-leaving` rule and unit 5's exactly-one assertions guard it; plan 3 must mark every leaving node.
- **e2e timing.** Transitions add up to 250ms after each navigation. Playwright's auto-waiting covers most of it; fact 5 has the fallback.
- **Large snapshots on the phone.** `page` covers the whole routed screen. If fact 8 shows dropped frames, Push and Pop fall back to Swap by changing the matrix, not the CSS.
- **The bundle budget.** The initial bundle is close to its warning, and plans 3 and 2 add more to the eager shell. Unit 3 records the size so the later plans start from a known number.
