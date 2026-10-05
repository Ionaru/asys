<!-- SPDX-License-Identifier: EUPL-1.2 -->
# Swipe to Done

This plan lets the person using ASYS swipe a Task to Done in Now. A swipe to the right on the top pick or on a ranked row marks the Task Done through the held Done and its Undo bar. A swipe to the left opens Log progress for that Task. The swipe is a shortcut: every Task it reaches keeps a button path, so nothing depends on it.

It was drawn up on 2026-10-05 from the approved design for the three "feels good" plans, and reviewed adversarially the same day with the confirmed findings folded in. The work sits outside the slice plan and is done before slice 2.

**Prerequisites.** The build order is plan 1, then plan 3, then this plan (plan 2). It needs:
- from [plan 1](view-transitions-plan.md), unit 1: the motion tokens (`--duration-quick`, `--duration-moderate`, `--ease-out`, `--ease-in`), the `Motion` seam (`core/platform/motion.ts`) with its `MotionDuration` and `MotionEasing` enums, the `Haptics` seam (`core/platform/haptics.ts`) and the design-system amendment that names the swipe pattern and the `on-signal` check; unit 4: the `data-task-id` hooks (on the top pick's title and on `.asys-picker-row__title`);
- from [plan 3](capture-and-done-animations-plan.md): `DoneUndo` with `complete(task, origin)`, the `DoneOrigin` enum, Now's `displayed` signal and `done(task, origin)`, the row exit (the collapse on a held ranked row), the Undo bar and the shell's status region.

Line numbers below were read on 2026-10-05, before plans 1 and 3 change these files. The builder re-reads each file before editing it.

## Working agreements

These are slice 1's agreements, in short:

- **One unit at a time,** each with a runnable check. A unit is done when its check is green.
- **Test-first where behaviour can be pinned.** Tests and code are written from the unit's contract, separately. Each new test is seen to fail once for the right reason, by breaking the behaviour it covers, before the unit counts.
- **One commit when the maintainer asks.** Nothing is pushed unless asked. A push to `main` deploys to production.
- **One builder per checkout.** Only one process builds or runs tests at a time.
- **SPDX headers.** Every new file carries the SPDX line for EUPL-1.2 in its comment form: `//` for `.ts`. Each unit's check includes `node scripts/check-spdx.mts`.

## Decisions

### 1. Native Pointer Events, no library

Every library below still leaves `touch-action` and click suppression to us, and each one adds a dependency to an initial bundle that already sits near its warning (decision 13). A swipe row is about 100 lines on Pointer Events, with a pure core that table tests can pin.

| Option | Version and date (2026-10-05) | Input model | Click after a drag | Axis and scroll handling | Size | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `@ionic/core` `createGesture` | 9.0.6, MIT, 2026-09-30 | `touchstart` and `mousedown` families; no Pointer Events, no `setPointerCapture`, no `preventDefault` | Not suppressed | `direction`, `maxAngle` 40, `threshold` 10 | 20,776,967 bytes unpacked in 2,739 files; the gesture chunks alone about 2.5 kB gzipped; a tree-shaken figure is unverified | No. It needs Stencil and ionicons as dependencies and still leaves `touch-action` and the click to us |
| `hammerjs` / `@egjs/hammerjs` | 2.0.8, MIT, 2016-04-22 (last commit 2019-05-28) / 2.0.17, MIT, 2019-12-16 (last push 2021-02-01) | Its own input layer | Not checked | Recognisers set `touch-action` (`pan-y` for a horizontal swipe) | Not measured | No. Both are stale, and Angular 22 has no Hammer integration to wire it |
| `@angular/cdk` drag-drop | 22.2.1, MIT, 2026-09-30; not installed | `mousedown` and `touchstart` | None found | Starts after 5px of summed movement in any direction, then calls `preventDefault` on moves, so a vertical scroll that starts on a row is blocked; `cdkDragLockAxis` only constrains the position | Not measured | No. It is built for reordering into a drop list |
| `@use-gesture/vanilla` | 10.3.1, MIT, 2024-03-21 | Pointer Events | Tap filter (`filterTaps`, 3px) | `axis`, swipe distance `[50, 50]`, velocity `[0.5, 0.5]` | About 63 kB raw unminified if nothing tree-shakes; tree-shaken size unverified | No. The closest fit, but unmaintained since 2024 |
| `tinygesture` | 3.0.1, Apache-2.0, 2026-04-04 | Unverified | Unverified | Swipe, pan and tap recognisers | Unverified | No. Its input model and size are unverified, and it is hosted off GitHub |
| `interactjs` | 1.10.28, MIT, 2026-08-01 | Not checked | Not checked | Drag, resize and drop | 1.4 MB unpacked | No. Large, and aimed at drag and drop |
| Native Pointer Events | Baseline widely available since July 2020 (`touch-action` since September 2019) | One path for touch and pen | Ours: armed after a locked gesture (decision 5) | `touch-action: pan-y pinch-zoom` plus our axis lock | About 100 lines, no dependency | **Yes** |

The dated facts and their sources are under "Facts checked on 2026-10-05".

### 2. `SwipeActions` wraps the content, and only the content moves

`SwipeActions` (`apps/pwa/src/app/ui/swipe-actions/swipe-actions.ts`, selector `asys-swipe-actions`, `ViewEncapsulation.None`, host class `asys-swipe`) wraps projected content:

```html
<asys-swipe-actions class="asys-swipe">
  <div class="asys-swipe__reveal asys-swipe__reveal--end" aria-hidden="true" hidden>…check… Done</div>
  <div class="asys-swipe__reveal asys-swipe__reveal--start" aria-hidden="true" hidden>Log progress</div>
  <div class="asys-swipe__surface"><ng-content /></div>
</asys-swipe-actions>
```

- **Naming.** A reveal's modifier names the swipe direction it belongs to, not the side it sits on. `--end` belongs to a swipe toward the inline end (to the right, Done) and is anchored at the left, where the moving surface uncovers it. `--start` belongs to a swipe to the left (Log progress) and is anchored at the right. ASYS is English only, so left to right is assumed.
- **Movement.** Only `.asys-swipe__surface` moves, through its inline `translate` style. The reveals stay put behind it.
- **The host clips.** `.asys-swipe` has `overflow: clip`, so a translated surface never widens the document. `clip`, not `hidden`, because `hidden` makes the host a scroll container and changes the `touch-action` ancestor chain. `overflow-clip-margin: 4px` keeps a row link's focus ring (2px, offset 2px) inside the clip, because the design system says never to remove it.
- **The focused row sits above its neighbours.** Each surface is `position: relative; z-index: 1`, so each is a stacking context, and the next row's opaque surface comes later in tree order at the same level. It would paint over the bottom of the focused row's ring. So `.asys-swipe:focus-within { z-index: 2; }` lifts the focused host above every other row's surface.
- **The top pick keeps its card shape.** Now gives the top pick's wrapper `border-radius: var(--radius-lg)`, so the clip and the reveal follow the card's corners. Rows stay full-bleed with no radius.
- **The surface sets `touch-action: pan-y pinch-zoom`.** Vertical scrolling and pinch zoom stay with the browser. Plain `pan-y` would turn pinch zoom off over most of Now, a WCAG 1.4.4 regression.
- **Now wraps the top pick and each ranked row's `<a>` inside its `<li>`.** `article.asys-top-pick` and `ul.now__list a.asys-picker-row` still match, so the existing selectors in unit and e2e specs hold.

### 3. `swipeDecision` is pure and table-tested

`swipeDecision(input)` lives in `ui/swipe-actions/swipe-decision.ts` and returns a `SwipeOutcome`. One function serves both phases, chosen by `locked`:
- `locked: false` is the start of a gesture: Pending, Scroll or Track.
- `locked: true` is a gesture already locked to horizontal: CommitEnd, CommitStart or SpringBack. SwipeActions calls it on every move with `velocity: 0` to find the armed state (distance only, so the reveal does not flicker with speed), and once on release with the measured velocity.

The rules, with the constants exported from the same file:

| Rule | Value | Constant |
| --- | --- | --- |
| Pointer types that swipe | `touch` and `pen` (enforced in SwipeActions) | none |
| Edge dead zone | a start with `startX < 24` or `startX > viewportWidth - 24` is ignored | `EDGE_DEAD_ZONE_PX = 24` |
| Slop | no decision while `abs(dx) < 10` and `abs(dy) < 10` | `SLOP_PX = 10` |
| Axis lock | horizontal when `abs(dx) > 1.5 * abs(dy)`, otherwise vertical, which goes to the browser | `AXIS_RATIO = 1.5` |
| Commit by distance | `abs(dx) >= 0.4 * width`, when `width > 0` | `COMMIT_FRACTION = 0.4` |
| Commit by fling | `abs(velocity) >= 0.6` px/ms in the direction of `dx`, and `abs(dx) >= 64` | `FLING_VELOCITY = 0.6`, `FLING_MIN_PX = 64` |
| Disabled direction | tracks with a rubber band of `0.25 * dx`, at most 32px, and never commits | `RUBBER_BAND_FACTOR = 0.25`, `RUBBER_BAND_MAX_PX = 32` |
| Velocity window | the last 100 ms of samples | `VELOCITY_WINDOW_MS = 100` |
| Click suppression | armed for 300 ms after a locked gesture ends | `CLICK_SUPPRESS_MS = 300` |

The edge dead zone is our own value: no web source gives one. Android reserves an inset for its back gesture, with 24 dp as a secondary-source default, so 24 CSS px is the starting point and an on-device check may raise it. Tuning after the on-device check edits these constants only.

### 4. Velocity comes from samples, and time from `performance.now()`

`velocityOf(samples)` takes `{ x, t }` samples and returns px/ms, positive toward the end. SwipeActions stamps each sample with `performance.now()` at the start of its handler, not with the input's `timeStamp`. A synthetic `PointerEvent` cannot set `timeStamp`, so a spec could not control a fling; `performance.now()` it can stub. The release adds a final sample at the release position, so a finger that stops and then lifts has a velocity of 0.

### 5. The wiring: capture, click suppression and cancel

- **Listeners.** SwipeActions adds its `pointerdown`, `pointermove`, `pointerup` and `pointercancel` listeners, and a capture-phase `click` listener, with `addEventListener` on its host, and removes them on destroy. An Angular host binding would mark the view for check on every move.
- **Pointer capture.** On lock, it calls `setPointerCapture(pointerId)` on its host, guarded: only when the method exists, and inside a try that ignores the `NotFoundError` it throws when the pointer is no longer active. jsdom has no `setPointerCapture`.
- **Click suppression is defensive.** While capture holds, a `click` after the release goes to the capturing host, not to the link, so the anchor does not navigate and RouterLink does not run. Suppression covers the case where capture was not taken (no `setPointerCapture`, or it threw) and a `click` lands on the content. So the `pointerup` that ends a locked gesture arms suppression. The capture-phase `click` listener on the host then calls `preventDefault()` and `stopPropagation()` on the next click and disarms. Both calls are needed: `stopPropagation()` alone keeps `RouterLink` from running, and RouterLink is what cancels the anchor's own navigation (it returns `!this.isAnchorElement`, `_router_module-chunk.mjs:381`), so the browser would do a full page load. Suppression disarms on the next `pointerdown` or 300 ms after the `pointerup`, whichever comes first, so a later real tap is never eaten.
- **`pointercancel`** (the browser took over for a pan or a pinch, or the system interrupted) never commits and never arms suppression. For a locked gesture it springs back. Before lock, or after the gesture was abandoned to a vertical scroll, it only clears the state: no `play` and no `settling`. With `touch-action: pan-y pinch-zoom` the browser sends `pointercancel` at the start of every vertical pan, so a scroll must not block the next swipe.

### 6. The armed state, its copy and its haptic follow the design system

| State | Reveal ground | Reveal text |
| --- | --- | --- |
| Right swipe, below the threshold | `sunken` | the check and "Done" in `ink-muted` |
| Right swipe, armed | `signal` | the check and "Done" in `on-signal` |
| Left swipe, below the threshold | `sunken` | "Log progress" in `ink-muted` |
| Left swipe, armed | `signal-soft` | "Log progress" in `on-signal-soft` |
| Left pull while Log progress is not possible | the reason sits on its own `sunken` chip above the surface | "Needs an Estimate" in `reason` text, `ink-muted` |

- **Armed** is the `asys-swipe--armed` modifier on the host. It is set while the release would commit by distance.
- **The check** is an inline SVG drawn with `stroke="currentColor"`, so it takes the label's colour. Drawing it in `on-signal` is the named exception to the Iconography rule that plan 1's design-system amendment proposes.
- **Type** is `--font-size-label` and `--line-height-label`, weight 700, as the field label uses. The disabled reason is the exception: it uses the `reason` style (`--font-size-reason`, `--line-height-reason`, weight 400), because the design system shows a disabled control's reason in `reason` text.
- **The disabled reason is lifted above the surface.** A disabled pull moves at most 32px, which cannot uncover "Needs an Estimate". So when the left swipe is disabled, the start reveal sits above the surface with a transparent ground, and its text is a chip in `reason` type with a `sunken` ground, `radius-sm` corners and `space-1` `space-2` padding at the trailing edge. It shows only during the pull, over the row's Estimate and quadrant chip.
- **Haptics.** `Haptics.tick()` fires once when the state arms and once when it disarms. It never fires on commit: plan 3 gives a Swipe Done no commit haptic, because the arming tick was the confirmation. A disabled direction never arms, so it never ticks. The first swipe after launch gets no haptic, because `navigator.vibrate` needs sticky activation. Plan 1 accepts that.

### 7. A right swipe completes the Task through `DoneUndo`

On a right commit, the surface continues off to the right: from its offset to the host's width, through `Motion.play` with `MotionDuration.Quick` and `MotionEasing.In` (plan 1's enums, which `play` resolves from `--duration-quick` and `--ease-in`). Then SwipeActions emits `commitEnd`, and Now calls `done(task, DoneOrigin.Swipe)`, which runs `DoneUndo.complete(task, DoneOrigin.Swipe)` with plan 3's Swipe variant: no check draw, no slide (the reveal already showed both), no commit haptic, the Undo bar rises, and the shell's status region announces "“X” is Done."

- **On a row,** the held Task's `<li>` leaves with plan 3's collapse. The surface stays off to the right and the armed reveal stays visible under it while the gap closes.
- **On the top pick,** plan 3's Swipe variant shows the next content in the render that follows the hold, and plays its rise. SwipeActions resets its surface to rest in that same render (unit 2), so the swiped content never flashes back.
- **The Task id travels with the gesture.** SwipeActions takes a `taskId` input, records it at `pointerdown`, and emits it with the output. If the input has changed by the release (a poll re-ranked the top pick under the finger), the release runs the spring back and emits nothing. If it changes while the exit or the spring back plays, SwipeActions checks again when `play` resolves, resets, and emits nothing. Now looks the Task up by the emitted id. So a swipe never completes a Task the person did not swipe.

### 8. A left swipe opens Log progress, for rows too

On a left commit, the surface springs back to rest (`MotionDuration.Moderate`, `MotionEasing.Out`), then SwipeActions emits `commitStart`, and Now opens Log progress for that Task. The left swipe is disabled unless the Task is Open with an Estimate of at least 2 (`MIN_LOGGABLE_ESTIMATE`, `now.ts:39`).

Now's Log progress is top-pick-only today: `topId` and `topTask` (`now.ts:217-222`), `storedEstimate` and `canLogProgress` read the top Task (`now.ts:224-234`), `logProgressFor` resets on any change of the top pick (`now.ts:236-240`), and `formOpen` requires the top (`now.ts:242-245`). Now generalises it:
- **`logProgressFor` is sourced from the ranked ids.** It keeps its Task while that Task stays ranked and stays on the same side of the top pick and the rows. It resets when the Task leaves the ranking, or moves between the top pick and the rows. The second condition departs from the approved design, which says `logProgressFor` "resets only when its id leaves". The form lives in a different place for the top pick and for a row, so under the design's rule a move would re-mount it, lose the typed text, and drop focus during a background re-rank. A row's form still does not close when some other Task changes the top pick, which was the point of the design's rule. **The maintainer confirms this departure before unit 3 is built** (Fact to check 16). If it is declined, the move condition goes, and three existing form tests get new expected results, listed in unit 3.
- **The Estimate and `canLogProgress` become functions of a Task id.**
- **The form renders under its row,** inside the row's `<li>` after the swipe wrapper. For the top pick it stays projected into the top pick, as today.
- **Focus after save or cancel returns to where the form was opened:** the row's link for a row; for the top pick, the title after save and the Log progress button after cancel, as today. When a form closes by itself (its Task left, moved or lost its Estimate) with focus inside it, focus goes to the top pick's title or the heading, as today (`now.ts:257-270`).

### 9. When the swipe is off

The swipe does nothing, and the content does not move, when:
- **Voice only holds** (`<html data-theme="drive">`, read at `pointerdown`). Voice only shows only what can be acted on by voice, and its rows are `tap-target-drive` tall for a glance, not a gesture. SwipeActions reads the attribute, not `Theme.current`, because nothing sets the drive theme through `Theme` yet (`apps/pwa/src/app/core/platform/theme.ts:46` sets only light or dark) and a hand-set attribute must count.
- **The Task is busy:** a Done or Log progress send is in flight, or `awaitingSync()` holds it (`busy`, `now.ts:273-275`).
- **The Task is held:** the top pick's content is plan 3's leaving snapshot (the state in which plan 3 marks it `data-leaving` and `inert`). A held ranked row has already left the list.
- **The pointer is a mouse.** On a desktop the row is a link, and dragging a link is not a swipe.
- **The gesture starts in a form control or the Log progress form:** `input`, `textarea`, `select` or `asys-log-progress-form`, found with `closest()` from the target. Buttons are not in the list: a drag that starts on the top pick's Done button is still a swipe, and click suppression keeps it from pressing the button.
- **The gesture starts in the edge dead zone,** or a second finger touches before the gesture locks (that is a pinch).

### 10. Under reduced motion, the surface still follows the finger

Following the finger is direct manipulation, not an animation: it moves only while the finger moves. So under `prefers-reduced-motion` the surface still tracks. Everything that plays on its own (the exit and the spring back) goes through `Motion.play`, which resolves at once when motion is not allowed. SwipeActions writes each final state before it calls `play`, so with motion off the end state is in place at once. The text feedback (the Undo bar, the status region, the form) is the same with motion on or off.

### 11. Accessibility

- **The swipe is a shortcut.** Every swipe action has a single-pointer path without a path-based gesture or dragging, which WCAG 2.2 SC 2.5.1 (Pointer Gestures, A) and SC 2.5.7 (Dragging Movements, AA) require:
  - on the top pick, its Done and Log progress buttons (`apps/pwa/src/app/ui/top-pick/top-pick.ts:27-48`);
  - on a ranked row, the link to the Task editor, which has Done (`apps/pwa/src/app/features/task/task-editor.ts:161`) and Log progress (`:172`).
- **Results are announced** by the shell's status region (plan 3): "“X” is Done." and its failure copy. A saved Log progress keeps Now's status line, "Estimate is now 15 min." (`now.ts:341`).
- **The reveals are `aria-hidden`.** A screen reader turns one-finger swipes into navigation, so a screen-reader user reaches these actions through the buttons. There is no standard web equivalent of iOS custom actions (ARIA 1.3 has none).
- **Focus.** A swipe on the top pick follows plan 3's focus rule for Done. A swipe Done on a ranked row moves focus only when focus was inside that row: to the next row's link, or the previous row's link when it was the last row, or the top pick's title when it was the only row.
- **A one-time hint** that teaches the swipe is deferred until after the on-device check (Out of scope).

### 12. If the design-system amendment is declined

Plan 1 unit 1 proposes the motion scale, the `on-signal` check and the swipe pattern entry. If the maintainer declines it:
- the spring back uses `MotionDuration.Quick` instead of `MotionDuration.Moderate`, which plan 1 then does not add, like every other duration;
- the armed Done reveal uses `signal-soft` with the check and "Done" in `ink`;
- nothing else in this plan changes.

### 13. The bundle stays under its warning

The initial bundle was about 481 kB of the 500 kB warning before plans 1 and 3 (`apps/pwa/project.json:31-42`; Angular counts kB as 1000 bytes). Plan 3 records the size after it lands. SwipeActions adds no dependency, and its styles must stay under the 4 kB `anyComponentStyle` warning. Unit 5 records both numbers.

## The units

| Unit | Delivers | Check |
| --- | --- | --- |
| 1. `swipeDecision` and velocity | `ui/swipe-actions/swipe-decision.ts`: `SwipeOutcome`, `swipeDecision`, `velocityOf` and the constants | `swipe-decision.spec.ts` table tests; `nx lint pwa`, `nx typecheck pwa` |
| 2. `SwipeActions` | `ui/swipe-actions/swipe-actions.ts`: structure, CSS, wiring, armed state, haptics | `swipe-actions.spec.ts`; `nx build pwa` (templates and the style budget) |
| 3. Now wiring and Log progress for rows | `features/now/now.ts`: both swipes on the top pick and ranked rows, Log progress generalised | `now.spec.ts` new cases, the listed existing form tests unchanged (or changed as listed, if decision 8's departure is declined); `nx test pwa`, `nx build pwa` |
| 4. e2e: `swipe.spec.ts` | `apps/pwa-e2e/src/swipe.spec.ts` and `support/touch.ts` | The spec on both stacks; the full suite green; each case seen to fail once |
| 5. Budget and docs | The recorded sizes; `writing-e2e-specs` and `building-pwa-ui` updated | `nx build pwa` with no budget warning; `check-spdx`; `format:check` |

### Unit 1: `swipeDecision` and velocity

Files owned: `apps/pwa/src/app/ui/swipe-actions/swipe-decision.ts` and `swipe-decision.spec.ts`. Nothing else is touched.

**Types and functions,** all exported from `swipe-decision.ts`, as const arrows:

```ts
export enum SwipeOutcome {
  Pending = 'pending',
  Scroll = 'scroll',
  Track = 'track',
  CommitEnd = 'commit-end',
  CommitStart = 'commit-start',
  SpringBack = 'spring-back',
}

export interface SwipeDecisionInput {
  readonly startX: number; // clientX at pointerdown, CSS px
  readonly dx: number; // clientX now minus startX; positive toward the end (right)
  readonly dy: number; // clientY now minus startY
  readonly width: number; // the SwipeActions host's width at pointerdown
  readonly viewportWidth: number; // window.innerWidth at pointerdown
  readonly velocity: number; // px/ms from velocityOf; positive toward the end
  readonly enabled: { readonly start: boolean; readonly end: boolean };
  readonly locked: boolean; // true once the gesture has been locked to horizontal
}

export interface SwipeSample {
  readonly x: number; // clientX
  readonly t: number; // performance.now() in ms
}

export const swipeDecision = (input: SwipeDecisionInput): SwipeOutcome => …;
export const velocityOf = (samples: readonly SwipeSample[]): number => …;
```

Plus the constants of decision 3, each `export const` with the value given there.

**`swipeDecision` with `locked: false`,** checked in this order:
1. `startX < EDGE_DEAD_ZONE_PX` or `startX > viewportWidth - EDGE_DEAD_ZONE_PX`: Scroll.
2. `enabled.start` and `enabled.end` both false: Scroll.
3. `|dx| < SLOP_PX` and `|dy| < SLOP_PX`: Pending.
4. `|dx| > AXIS_RATIO * |dy|`: Track, whether or not that direction is enabled (a disabled direction rubber-bands in SwipeActions).
5. Otherwise: Scroll.

**`swipeDecision` with `locked: true`:** `startX`, `viewportWidth` and `dy` are ignored.
1. The direction is end for `dx > 0`, start for `dx < 0`. For `dx === 0`, or a disabled direction: SpringBack.
2. `width > 0` and `|dx| >= COMMIT_FRACTION * width`: CommitEnd or CommitStart.
3. `|dx| >= FLING_MIN_PX`, `velocity` has the sign of `dx`, and `|velocity| >= FLING_VELOCITY`: CommitEnd or CommitStart.
4. Otherwise: SpringBack.

**The decision table** (`it.each`). Unless a row says otherwise: `width` 380, `viewportWidth` 412, `velocity` 0, both directions enabled, `startX` 200.

| Case | locked | startX | dx | dy | Other | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| Left dead zone | false | 23 | 50 | 0 | | Scroll |
| Left boundary | false | 24 | 50 | 0 | | Track |
| Right boundary | false | 388 | -50 | 0 | | Track |
| Right dead zone | false | 389 | -50 | 0 | | Scroll |
| Inside the slop | false | | 9 | 9 | | Pending |
| Inside the slop, left | false | | -9 | 0 | | Pending |
| Slop reached, horizontal | false | | 10 | 6 | | Track (10 > 9) |
| Slop reached, too steep | false | | 10 | 7 | | Scroll (10 is not > 10.5) |
| Exactly 1.5 | false | | 15 | 10 | | Scroll |
| Just past 1.5 | false | | 16 | 10 | | Track |
| Vertical | false | | 3 | 12 | | Scroll |
| Straight up | false | | 0 | -10 | | Scroll |
| Disabled direction still tracks | false | | -12 | 2 | start disabled | Track |
| Nothing enabled | false | | 50 | 0 | both disabled | Scroll |
| Distance, end | true | | 152 | | | CommitEnd |
| Just short, end | true | | 151 | | | SpringBack |
| Distance, start | true | | -152 | | | CommitStart |
| Just short, start | true | | -151 | | | SpringBack |
| Fling at the limits | true | | 64 | | velocity 0.6 | CommitEnd |
| Fling too short | true | | 63 | | velocity 0.9 | SpringBack |
| Fling too slow | true | | 64 | | velocity 0.59 | SpringBack |
| Fling, start | true | | -64 | | velocity -0.6 | CommitStart |
| Fling against the drag | true | | 100 | | velocity -0.8 | SpringBack |
| End disabled | true | | 200 | | end disabled | SpringBack |
| Start disabled, even a fling | true | | -200 | | velocity -1, start disabled | SpringBack |
| No movement | true | | 0 | | | SpringBack |
| No width, distance only | true | | 100 | | width 0 | SpringBack |
| No width, fling | true | | 100 | | width 0, velocity 0.7 | CommitEnd |
| Locked ignores dy | true | | 152 | 200 | | CommitEnd |
| Locked ignores the dead zone | true | 10 | 200 | | | CommitEnd |

**`velocityOf`:** keep the samples with `t >= last.t - VELOCITY_WINDOW_MS`. With fewer than two kept, or a zero time span, return 0. Otherwise return `(lastKept.x - firstKept.x) / (lastKept.t - firstKept.t)`.

| Samples (`x@t`) | Result |
| --- | --- |
| none | 0 |
| `0@0` | 0 |
| `0@0, 30@50, 90@100` | 0.9 |
| `100@0, 40@60` | -1 |
| `0@0, 60@100` (the first sample is exactly at the window's edge) | 0.6 |
| `0@0, 50@200, 110@250` (only the last two are in the window) | 1.2 |
| `0@0, 100@10, 100@200` (a stop, then the release sample) | 0 |
| `0@5, 20@5` | 0 |

**Check:**
- `pnpm exec nx test pwa`
- `pnpm exec nx lint pwa` and `pnpm exec nx typecheck pwa`
- `node scripts/check-spdx.mts`
- Proof: change `>=` to `>` in the distance rule; "Distance, end" fails.

### Unit 2: `SwipeActions`

Files owned: `apps/pwa/src/app/ui/swipe-actions/swipe-actions.ts` and `swipe-actions.spec.ts`. It imports unit 1, and `Motion` and `Haptics` from `core/platform` (plan 1). It is the first `ui` component to import from `core`; unit 5 records that in `building-pwa-ui`.

**The class** `SwipeActions` in `apps/pwa/src/app/ui/swipe-actions/swipe-actions.ts`:

```ts
@Component({
  selector: 'asys-swipe-actions',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'asys-swipe' },
  template: `…`,
  styles: `…`,
})
export class SwipeActions {
  readonly taskId = input.required<string>();
  readonly disabled = input<boolean>(false);
  readonly endEnabled = input<boolean>(true);
  readonly startEnabled = input<boolean>(false);
  readonly commitEnd = output<string>(); // emits the Task id recorded at pointerdown
  readonly commitStart = output<string>();
}
```

**Template:** the structure of decision 2.
- The end reveal holds the check SVG (`viewBox="0 0 16 16"`, 16 by 16, `focusable="false"`, one path with `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`) and a `<span>` "Done".
- The start reveal holds one `<span>`: "Log progress" when `startEnabled()`, otherwise "Needs an Estimate". When `startEnabled()` is false, it also carries `data-reason`.
- Both reveals carry `aria-hidden="true"` and start with `hidden`.

**Styles** (tokens only):

```css
.asys-swipe { position: relative; display: block; overflow: clip; overflow-clip-margin: 4px; }
.asys-swipe:focus-within { z-index: 2; }
.asys-swipe__surface { position: relative; z-index: 1; touch-action: pan-y pinch-zoom; }
.asys-swipe__reveal {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  display: flex; align-items: center; gap: var(--space-2); padding-inline: var(--space-4);
  background: var(--sunken); color: var(--ink-muted);
  font-size: var(--font-size-label); line-height: var(--line-height-label); font-weight: 700;
}
.asys-swipe__reveal[hidden] { display: none; }
.asys-swipe__reveal--end { justify-content: flex-start; }
.asys-swipe__reveal--start { justify-content: flex-end; }
.asys-swipe--armed .asys-swipe__reveal--end { background: var(--signal); color: var(--on-signal); }
.asys-swipe--armed .asys-swipe__reveal--start { background: var(--signal-soft); color: var(--on-signal-soft); }
.asys-swipe__reveal--start[data-reason] { z-index: 2; background: transparent; }
.asys-swipe__reveal--start[data-reason] > span {
  background: var(--sunken); color: var(--ink-muted);
  font-size: var(--font-size-reason); line-height: var(--line-height-reason); font-weight: 400;
  border-radius: var(--radius-sm); padding: var(--space-1) var(--space-2);
}
```

The `[hidden]` attribute hides a reveal, through the `.asys-swipe__reveal[hidden]` rule. The rule is needed: `display: flex` is an author rule and beats the browser's own `[hidden] { display: none }`, and `apps/pwa/src/styles.css` has no global `[hidden]` rule. Without it both reveals would always render, the later start reveal would cover the end reveal, and the raised `[data-reason]` chip would sit over every row whose Estimate is under 2. The focused host's `z-index: 2` keeps its focus ring above the next row's surface (decision 2). If the amendment is declined (decision 12), the armed end rule becomes `background: var(--signal-soft); color: var(--ink)`.

**Gesture state** (private, not signals): `pointerId`, `startX`, `startY`, the recorded `taskId`, `width`, `locked`, `samples`, `offset`, `armed`, and a `settling` flag. The surface's `translate`, the host's `asys-swipe--armed` class and the reveals' `hidden` are written straight to the DOM, so a move runs no change detection.

**Behaviour**, as input and expected result. In the spec, the host's width is 380 (decision 2's row), so the distance threshold is 152.

| Input | Expected |
| --- | --- |
| `pointerdown` with `pointerType` `mouse` | Ignored: no state, and a later drag moves nothing |
| `pointerdown` that is not `isPrimary` while no gesture is locked | Any gesture in progress is abandoned (a second finger means a pinch) |
| `pointerdown` while `disabled()`, while `settling`, in Voice only, inside `input`, `textarea`, `select` or `asys-log-progress-form`, or with `pointerType` other than `touch` or `pen` | Ignored |
| `pointerdown` with `touch` or `pen` | Records `startX`, `startY`, `taskId()`, the width from `host.getBoundingClientRect().width`, `window.innerWidth`, and a first sample; disarms click suppression |
| `pointermove` of another `pointerId` | Ignored |
| `pointermove` before lock, `swipeDecision` Pending | Nothing moves |
| `pointermove` before lock, Scroll | The gesture is abandoned until the next `pointerdown` |
| `pointermove` before lock, Track | `locked` becomes true, `setPointerCapture(pointerId)` is called on the host when it exists (a thrown `NotFoundError` is ignored), and tracking starts |
| `pointermove` while locked, enabled direction | `surface.style.translate` is `${dx}px`; the reveal for the sign of `dx` loses `hidden`, the other gets it |
| `pointermove` while locked, disabled direction | `translate` is `sign(dx) * min(0.25 * abs(dx), 32)` px: `dx` -40 gives `-10px`, `dx` -200 gives `-32px` |
| Crossing into armed (`swipeDecision` with `locked: true`, `velocity: 0` returns a Commit) | `asys-swipe--armed` is added and `Haptics.tick()` is called once |
| Crossing back out of armed | The class is removed and `tick()` is called once more; moving further while armed (152 to 200) calls nothing |
| `pointerup` of a gesture that never locked | State is cleared; suppression stays disarmed; nothing is emitted |
| `pointerup` of a locked gesture | A release sample is added; suppression arms; `swipeDecision` runs with `velocityOf(samples)` |
| `pointerup` of a locked gesture while `taskId()` differs from the recorded id | The SpringBack sequence whatever the outcome; nothing emitted |
| Release outcome CommitEnd | `settling`; `translate` set to `${width}px`; `Motion.play(surface, [{ translate: '<offset>px' }, { translate: '<width>px' }], { duration: MotionDuration.Quick, easing: MotionEasing.In })`; when it resolves, if `taskId()` still equals the recorded id, `commitEnd` emits that id, then the host marks itself for check and, in `afterNextRender`, resets |
| Release outcome SpringBack | `settling`; `translate` cleared; `Motion.play(surface, [{ translate: '<offset>px' }, { translate: '0px' }], { duration: MotionDuration.Moderate, easing: MotionEasing.Out })`; when it resolves, reset; nothing emitted |
| Release outcome CommitStart | The SpringBack sequence; after the reset, `commitStart` emits the recorded id, if `taskId()` still equals it |
| `taskId()` changes while the exit's or the spring back's `play` is pending | When `play` resolves: reset, nothing emitted |
| `pointercancel` of a locked gesture's pointer | The SpringBack sequence; suppression is not armed; nothing emitted |
| `pointercancel` before lock | State is cleared; no `play`, no `settling`; nothing emitted |
| `pointercancel` after the gesture was abandoned (Scroll) | Nothing: an abandoned gesture keeps no state, so the pointer is no longer the gesture's |
| A capture-phase `click` while suppression is armed | `preventDefault()` and `stopPropagation()`; suppression disarms |
| A `click` 300 ms or more after the `pointerup`, or after a new `pointerdown` | Reaches the content: a RouterLink navigates |
| Destroyed while `Motion.play` is pending | Nothing is emitted and nothing throws; listeners are removed |

- **Reset** clears `translate`, removes `asys-swipe--armed`, hides both reveals, clears the gesture and `settling`.
- **Durations and easings** are plan 1's `MotionDuration` and `MotionEasing` values, passed to `Motion.play`, which resolves the tokens. SwipeActions never reads a token itself and never writes a literal `ms` value or curve.
- **Every final state is written before `play`** (decision 10).

**The spec** (`swipe-actions.spec.ts`):
- **The host** is a test component that renders `<asys-swipe-actions [taskId]="id()" [disabled]="disabled()" [startEnabled]="start()" [endEnabled]="end()" (commitEnd)="ends.push($event)" (commitStart)="starts.push($event)">` around `<a routerLink="/task">Row</a>` and an `<input>`.
- **Providers:** `provideRouter([{ path: 'task', component: Blank }])`, a fake `Motion` (`{ reduced: signal(false), allowed: () => true, play: vi.fn(() => next.promise) }`, where the test resolves `next`), a fake `Haptics` (`{ tick: vi.fn() }`) and `{ provide: ErrorHandler, useValue: { handleError: vi.fn() } }`, as `now.spec.ts:162` does.
- **Stubs:** `getBoundingClientRect` on the host element instance (never the prototype, since specs share one jsdom) returning a rect with `width` 380, `performance.now` through `vi.spyOn(performance, 'now').mockImplementation(() => t)`, and, where a case needs it, `setPointerCapture` as an own property of the host. `afterEach` calls `vi.restoreAllMocks()`, deletes the own properties and removes `data-theme` from `<html>`.
- **Pointer input** is `new PointerEvent(type, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX, clientY, bubbles: true, cancelable: true })` dispatched on the `<a>`. jsdom defaults `isPrimary` to false, so it is always passed. A gesture's moves are dispatched synchronously, with `t` set before each, and the spec awaits only after the release.
- **Time.** A `beforeEach` sets `t = 0`. Every `pointerdown` is dispatched at `t` 0 unless the case says otherwise, so its first sample never comes after a later one, even with `isolate: false`.

Cases, with `startX` 100 unless said:
1. A drag to `dx` 12, `dy` 2 locks: `translate` is `12px`, `setPointerCapture` was called with 1, the end reveal is shown and the start reveal hidden.
2. Without `setPointerCapture` (jsdom's default), and with one that throws a `DOMException` named `NotFoundError`, the same drag still tracks and nothing throws.
3. A drag to `dx` 5, `dy` 3 moves nothing.
4. A drag to `dx` 3, `dy` 70, then to `dx` 200, moves nothing.
5. Moves at `t` 100 (`dx` 100) and `t` 200 (`dx` 160), release at `t` 600 (`dx` 160): `play` is called with the surface, the keyframes `160px` to `380px`, and `{ duration: MotionDuration.Quick, easing: MotionEasing.In }`; nothing is emitted until `next` resolves; then `ends` is `['task-a']`.
6. The same with `dx` 151: `play` is called with `151px` to `0px` and `{ duration: MotionDuration.Moderate, easing: MotionEasing.Out }`; nothing is emitted; after it resolves, `translate` is empty.
7. A fling: moves at `t` 40 (`dx` 40) and `t` 80 (`dx` 70), release at `t` 90 (`dx` 70): `ends` is `['task-a']`.
8. `dx` -160 with `startEnabled` true: `starts` is `['task-a']`, only after the spring-back `play` resolves.
9. With `startEnabled` false: `dx` -40 gives `-10px`, `dx` -200 gives `-32px`; the release emits nothing; the start reveal reads "Needs an Estimate" and has `data-reason`.
10. Armed: `dx` 160 adds `asys-swipe--armed` and calls `tick` once; `dx` 140 removes it and calls `tick` a second time; `dx` 200 then 220 calls it a third time only. With the start disabled, `dx` -200 never adds the class and never calls `tick`.
11. Both reveals have `aria-hidden="true"`; the end reveal reads "Done" and holds an `svg`.
12. After a locked gesture that springs back, a `click()` on the `<a>` is `defaultPrevented` and the router stays at `/`.
13. After that gesture, a new `pointerdown` then a `click()` navigates to `/task`.
14. Under `vi.useFakeTimers()`, after the gesture, `vi.advanceTimersByTimeAsync(300)` then a `click()` navigates to `/task`. This case never calls `fixture.whenStable()`, which hangs under fake timers (`docs/slice-1-plan.md:1031`).
15. A locked gesture ended by `pointercancel`: `play` springs back, nothing is emitted, and a following `click()` navigates to `/task`. This is the "tap after a cancelled swipe still navigates" case.
16. `pointerType` `mouse` with `dx` 200: no `translate`, nothing emitted, and a `click()` navigates.
17. `pointerType` `pen` with `dx` 160 commits.
18. With `disabled` true, with `<html data-theme="drive">`, and with the drag starting on the `<input>`: no `translate`, nothing emitted.
19. `startX` 23 is ignored, 24 tracks, and `window.innerWidth - 23` is ignored.
20. A second `pointerdown` (`pointerId` 2, `isPrimary` false) before lock, then `dx` 200 for pointer 1: no `translate`.
21. While a commit's `play` is pending, a new `pointerdown` and drag move nothing.
22. With the fake `Motion` reporting `reduced` true and `allowed()` false, and `play` resolving at once, the drag still tracks, and the commit emits after one settle.
23. After case 5's emit and a settle, `translate` is empty and the host has no `asys-swipe--armed`.
24. The host changes `id` from `task-a` to `task-b` between the moves and the release at `dx` 160: `play` is called with the spring-back keyframes (`160px` to `0px`), and after `next` resolves and a settle, nothing is emitted and `translate` is empty. Changing `id` instead while case 5's `play` is pending, then resolving `next`: nothing is emitted and `translate` is empty after a settle.
25. Destroying the fixture while case 5's `play` is pending, then resolving it: `ends` stays empty and the `ErrorHandler` fake is not called.
26. A drag to `dx` 3, `dy` 70 ended by `pointercancel`: `play` is not called. Straight away, with no settle, a new gesture to `dx` 12, `dy` 2 tracks (`translate` is `12px`).

**Check:**
- `pnpm exec nx test pwa`
- `pnpm exec nx build pwa`: no template error, and no `anyComponentStyle` warning for `swipe-actions.ts`
- `pnpm exec nx lint pwa`, `node scripts/check-spdx.mts`
- Proof: drop `preventDefault()` from the click listener; case 12 fails on `defaultPrevented`.

### Unit 3: Now wiring and Log progress for rows

Files owned: `apps/pwa/src/app/features/now/now.ts` and `now.spec.ts`. It builds on plan 3's version of both files.

**Template changes:**
- The top pick: `<asys-swipe-actions class="now__top-swipe" [taskId]="top.task.id" [disabled]="busy(top.task.id) || <plan 3's leaving state>" [startEnabled]="canLogProgress(top.task.id)" (commitEnd)="swipeDone($event)" (commitStart)="openForm($event)">` wraps `<asys-top-pick>`, whose inputs come from plan 3's `displayed` (here `top`). `[canLogProgress]` binds `canLogProgress(top.task.id)` instead of the computed (`now.ts:57`). The projected form shows when `formOpenFor(top.task.id) && estimateOf(top.task.id); as estimate` (replacing `now.ts:66`).
- Each ranked row (`now.ts:93-107`): inside the `<li>`, `<asys-swipe-actions [taskId]="item.task.id" [disabled]="busy(item.task.id)" [startEnabled]="canLogProgress(item.task.id)" (commitEnd)="swipeDone($event)" (commitStart)="openForm($event)">` wraps the `<a asys-picker-row>`. After it, `@if (formOpenFor(item.task.id) && estimateOf(item.task.id); as estimate)` renders `<div class="now__row-form"><asys-log-progress-form [estimateMinutes]="estimate" [busy]="busy(item.task.id)" (save)="saveProgress($event)" (cancel)="cancelForm()" (focusin)="focusInside = true" (focusout)="focusInside = false" /></div>`.
- Waiting rows (`now.ts:118-131`) are not wrapped.

**Styles:** `.now__top-swipe { border-radius: var(--radius-lg); }`, and `.now__row-form { padding: 0 var(--space-4) var(--space-3); background: var(--surface); border-bottom: 1px solid var(--line); }`.

**Class changes:**
- `rankedIds = computed(() => this.dataStore.now()?.ranked.map((item) => item.task.id) ?? [])`.
- `logProgressFor` becomes `linkedSignal<readonly string[], string | null>` with `source: () => this.rankedIds()`. Its computation keeps `previous.value` when it is non-null, is in the new ids, and `(ids[0] === value) === (previous.source[0] === value)`. Otherwise it is null.
- `estimateOf(taskId: string): number | null` reads the Task from `dataStore.state()`, replacing `storedEstimate` (`now.ts:224`).
- `canLogProgress(taskId: string): boolean` is true for an Open Task with an Estimate of at least `MIN_LOGGABLE_ESTIMATE`, replacing the computed (`now.ts:226-234`).
- `formOpenFor(taskId: string): boolean` is `logProgressFor() === taskId && canLogProgress(taskId)`.
- `openFormId = computed(...)` is the open form's id, or null. It replaces `formOpen` (`now.ts:242-245`) in the effect (`now.ts:257-270`), which keeps its rule: when the open id becomes null with `focusInside`, `focusTop()`.
- `openForm(taskId)` is unchanged (`now.ts:289-291`). It serves the button and `commitStart`.
- `cancelForm()` reads the id first. For `rankedIds()[0]` it keeps today's `focusLogProgress()` (`now.ts:293-297`). For a row, after the next render, it focuses that row's link.
- `saveProgress` (`now.ts:321-347`): on Applied, for the top pick it keeps `focusTop()`; for a row it focuses that row's link.
- `swipeDone(taskId: string)` finds the Task in `dataStore.now()?.ranked` by id. If it is absent, it does nothing. If focus is inside that row's `<li>`, it records the neighbour to focus (decision 11). Then it calls `this.done(task, DoneOrigin.Swipe)`, and after the next render focuses the recorded neighbour. This relies on plan 3's `done` contract (plan 3 unit 9, step 6): for a ranked Task that is not `displayed()`'s, `done` runs `doneUndo.complete` and the row's collapse and does not move focus. Only `displayed()`'s Task gets plan 3's focus move to the new title. Fact to check 14 confirms it when plan 3 lands.
- **Finding a row's link:** query the host for `[data-task-id="<id>"]` (plan 1's hook), keep the first match whose `closest('[data-leaving]')` is null (the ancestor test plans 1 and 3 use, because `data-leaving` sits on the `<li>` while the hook sits on the title inside it), and take its `closest('a')`.

**The spec.** Plan 3's `now.spec.ts` already provides a fake `DoneUndo` (`complete: vi.fn()`). A helper `swipe(id)` returns the `SwipeActions` debug element for a Task: `By.directive(SwipeActions)`, matched on `componentInstance.taskId()`. Its outputs are fired with `triggerEventHandler('commitEnd', id)`. The gesture itself is unit 2's concern. With the `FULL` state (`now.spec.ts:107-109`), the top pick is `invoice` (Estimate 30) and the ranked rows are `dentist` (20) and `plants` (1).

New cases, in a `describe('swipes')`:
1. `asys-swipe-actions.now__top-swipe` contains `article.asys-top-pick`; each `ul.now__list > li` holds one `asys-swipe-actions` around its `a.asys-picker-row`; `rows()` (`now.spec.ts:203-204`) still returns the hrefs in rank order.
2. After expanding Waiting, its rows have no `asys-swipe-actions`.
3. `startEnabled` is true for `invoice` and `dentist` and false for `plants`; `disabled` is false for all; `taskId` matches each.
4. `commitEnd` with `invoice` calls `complete` once with the `invoice` Task and `DoneOrigin.Swipe`.
5. `commitEnd` with `dentist` calls `complete` once with the `dentist` Task and `DoneOrigin.Swipe`.
6. `commitEnd` with an id that is not ranked calls nothing.
7. `commitStart` with `dentist` opens the form inside `dentist`'s `<li>`, with the hint "Whole minutes, less than 20 min." and focus on its input; the top pick holds no form.
8. From case 7, typing 15 and Save sends `{ _tag: LogProgress, taskId: 'dentist', remainingMinutes: 15, expect: { status: Open } }` with `key-1`. On Applied plus a state where `dentist` has Estimate 15, the form closes, the status line reads "Estimate is now 15 min." and focus is on `dentist`'s link.
9. From case 7, Cancel closes the form and focuses `dentist`'s link; Escape in the input does the same.
10. Opening the top pick's form with its button, then `commitStart` with `dentist`: the top pick's form is gone, and `dentist`'s is open.
11. A row's form survives a change of the top pick. Use Steady, Early bird (`now.spec.ts:1044-1054`) and a third Task, Calm (`id: 'calm'`, not important, no Due, Estimate 20, `createdAt` 3). The test first asserts that Calm is a row both at `T0` and at `T0 + 16 min`, so a ranking change shows up as a setup failure. Then: open Calm's form, type 7, move the clock 16 minutes. The top pick is Early bird, Calm's form is still open with 7 in its input, and focus is still in it.
12. A row's form closes when its Task leaves the ranking (state without `dentist`); with focus inside, focus goes to the top pick's title.
13. A row's form closes when its Task becomes the top pick (state without `invoice`); with focus inside, focus goes to the top pick's title, now `dentist`.
14. `dentist`'s `disabled` is true while its LogProgress send is pending and while `awaitingSync` holds `dentist`.
15. The top pick's `disabled` is true while plan 3's leaving snapshot is displayed after a Done button, using plan 3's controllable `Motion` fake.
16. Focus after a row swipe Done. With focus on `dentist`'s link, `commitEnd` with `dentist`, then a state without `dentist` (the fake `complete` does not hold): focus is on `plants`'s link. With focus on `plants`'s link (the last row), Done on `plants` leaves focus on `dentist`'s link. With focus on the heading, a row's Done leaves it there, which also pins plan 3's rule that `done` does not move focus for a Task that is not `displayed()`'s.

**Existing form tests,** checked against the contract (`now.spec.ts:841-1099`). With the move-resets rule of decision 8, none needs a new expected result, because the top pick's behaviour does not change and the "by itself" rule is kept:
- `:849` opens the form inside the top pick and focuses its input: unchanged.
- `:863`, `:876`, `:887`, `:919` and `:943` (errors, the command and key, applied, destroyed, other outcome): unchanged; all are on the top pick.
- `:972` and `:982` (Cancel and Escape focus the Log progress button): unchanged; the top pick keeps `focusLogProgress()`.
- `:995` (nothing sent from the form while a Done is pending): plan 3 owns its new expected result. This plan does not change it again: the held Task leaves the ranking, so its form resets under both rules.
- `:1011` and `:1028` (awaiting the server; Estimate drops to 1): unchanged.
- `:1058` (the top pick changes by itself): unchanged. Steady moves from the top pick to a row, so the form resets, and focus goes to Early bird's title.
- `:1074` and `:1087`: unchanged, for the same reason.

If the maintainer declines the move-resets rule (Fact to check 16), `logProgressFor` keeps Steady while it stays ranked, and these three get new expected results:
- `:1058`: the form is open inside Steady's row `<li>`, not in the top pick; `document.activeElement` is `document.body`, because the top pick's form was destroyed with focus inside it and the effect does not fire while the open id is unchanged. The test is renamed "moves the form to the row and drops focus". This lost focus is the reason decision 8 prefers the move-resets rule.
- `:1074`: the form is open inside Steady's row `<li>`, and focus stays on the heading.
- `:1087`: after the clock returns to `T0`, Steady is the top pick again and its form is open in the top pick, so `form()` is not null. The test is renamed "keeps the form open when the top pick changes back".

**Check:**
- `pnpm exec nx test pwa`
- `pnpm exec nx build pwa` (Now's template)
- `pnpm exec nx lint pwa`
- Proof: source `logProgressFor` from `topId` again; case 11 fails on the closed form.

### Unit 4: e2e, `swipe.spec.ts`

Files owned: `apps/pwa-e2e/src/swipe.spec.ts` and `apps/pwa-e2e/src/support/touch.ts`. No config changes: the default config infers the spec's target, and the image config spreads the default one, so the spec runs under both.

**`support/touch.ts`** opens a CDP session the way `addAuthenticator` does (`apps/pwa-e2e/src/support/fixtures.ts:69-82`) and sends `Input.dispatchTouchEvent`. Its touch input is trusted, so the page sees Pointer Events with `pointerType: 'touch'`. Erasable syntax only:

```ts
export interface Point { readonly x: number; readonly y: number; }

export interface DragOptions {
  readonly steps?: number; // default 10
  readonly stepMs?: number; // default 16
  readonly holdMs?: number; // default 0: a pause with no movement before the release
}

export interface Touchscreen {
  readonly down: (point: Point) => Promise<void>;
  readonly move: (point: Point) => Promise<void>;
  readonly up: () => Promise<void>;
  readonly cancel: () => Promise<void>;
  readonly drag: (from: Point, to: Point, options?: DragOptions) => Promise<void>;
  readonly pinch: (centre: Point, fromGap: number, toGap: number, options?: DragOptions) => Promise<void>;
}

export const touchscreen = async (page: Page): Promise<Touchscreen> => …;
```

- `down` sends `touchStart` with `touchPoints: [{ x, y, id: 0 }]`.
- `move` sends `touchMove` with the same `id`.
- `up` sends `touchEnd`, and `cancel` sends `touchCancel`, both with `touchPoints: []`, because the protocol says those types must carry no points.
- `drag` does `down(from)`, then `steps` moves along the line with `stepMs` between them (`setTimeout` from `node:timers/promises`), waits `holdMs`, then `up()`.
- `pinch` starts two points (ids 0 and 1) at `centre.x ± fromGap / 2`, moves them to `± toGap / 2` in `steps`, then ends with no points.
- A test opens the session once, after the seeding reload. Whether it survives a later `page.reload()` is unverified (Fact to check 15).

**`swipe.spec.ts`:**
- **Setup.** It starts with `test.use({ viewport: { width: 412, height: 839 }, hasTouch: true, isMobile: true })`. A shared `seed` creates, with `skipNearMidnight(test)`:
  - "Renew the permit": not important, Estimate 25, Due yesterday. It is Overdue, so it is the top pick.
  - "Plan the year": important, Estimate 25.
  - "Water the plants": not important, Estimate 1.
  - Then `page.reload()`.
- **Points.** The swipe starts 40px inside the target's left edge, or 40px inside its right edge for a left swipe, at its vertical centre. The top pick starts on its title, never on a button. At 412px wide with the 16px gutter, a row is 380px wide, so its threshold is 152px.
- **`settle()`** polls `document.getAnimations().length` until it is 0.

Cases:
1. **Top pick: commit, then Undo.**
   - Mid-swipe (`down`, then moves to +200px), the top pick's wrapper has `asys-swipe--armed`, and `.asys-swipe__reveal--end` is visible and reads "Done", while `.asys-swipe__reveal--start` is hidden.
   - `up()`, then `settle()`: the top pick's title is the next Task, `.asys-undobar` contains "Renew the permit", the URL is still `/now`, and `.asys-undobar` holds the check and "Done".
   - `getByRole('button', { name: 'Undo' })` in the bar: "Renew the permit" is the top pick again and the bar is hidden.
2. **Row: commit without opening, then Undo.** `drag` "Plan the year" by +260px. The URL stays `/now`. The row is gone and the bar names it. After Undo, the row is back.
3. **Spring-back.** `drag` "Plan the year" by +100px, with `holdMs` 150 so the velocity is 0. After `settle()`, the row is still there, its surface's computed `translate` is `none`, no bar shows, and the URL is `/now`.
4. **Vertical drag scrolls.** A second seed adds 12 Tasks (as `phone-width.spec.ts:13-30` does), then reloads, and the test opens its touch session after that reload. A `drag` on the fourth row from its centre to 300px higher makes `window.scrollY` greater than 0, shows no bar, and leaves the URL at `/now`.
5. **Tap opens the Task.** `page.touchscreen.tap` at the centre of "Plan the year" goes to `/tasks/<its id>` (the id from `seedTask`).
6. **Pinch zooms.** `pinch` on "Plan the year" from a 40px gap to 240px makes `visualViewport.scale` greater than its value before. No bar shows.
7. **No sideways scroll mid-swipe.**
   - `down` on "Plan the year", then moves to +300px, with no release.
   - Then `document.documentElement.scrollWidth <= clientWidth` and `document.body.scrollWidth <= clientWidth`, measured as `phone-width.spec.ts:36-42` does.
   - `cancel()`, then `settle()`: the row is still there and no bar shows.
8. **A left swipe opens Log progress.** `drag` "Plan the year" from its right side by -260px. Inside that row's `<li>`, `getByLabel('Time still needed')` is visible and focused. The top pick holds no form.
9. **A left swipe without an Estimate of at least 2.**
   - Before the pull, "Water the plants"'s `.asys-swipe__reveal--start` is hidden.
   - `down`, then moves to -120px. Its `.asys-swipe__reveal--start` is visible and reads "Needs an Estimate".
   - `up()`, then `settle()`: its `.asys-swipe__reveal--start` is hidden again, no "Time still needed" field exists, no bar shows, and the URL is `/now`.

**Check:**
- `pnpm exec nx e2e pwa-e2e -- src/swipe.spec.ts`, then the full `pnpm exec nx e2e pwa-e2e`
- With the image stack from the README recipe running, `pnpm exec nx run pwa-e2e:e2e-image -- src/swipe.spec.ts`
- `pnpm exec nx typecheck pwa-e2e`, `pnpm exec nx lint pwa-e2e`, `node scripts/check-spdx.mts`
- Proofs, one at a time:
  - `touch-action: none` on the surface: case 4 fails, because the page never scrolls.
  - No `overflow: clip`: case 7 fails.
  - Plain `pan-y`: case 6 fails.
  - No `.asys-swipe__reveal[hidden]` rule: case 9 fails on the hidden start reveal before the pull.
  - Click suppression is not proved here: capture already sends the `click` to the host (Fact to check 4). Unit 2 case 12 proves it.

### Unit 5: budget and docs

**Budget.** Run `pnpm exec nx build pwa` and confirm there is no budget warning. Record, in the "Built on" section:
- the initial total (`main`, the initial chunks and `styles` in `dist/apps/pwa/browser`), against plan 3's recorded figure;
- the `swipe-actions` component style size against the 4 kB warning.

If the initial bundle crosses 500 kB, stop and decide with the maintainer. Do not raise the budget silently.

**`.agents/skills/writing-e2e-specs/SKILL.md`:**
- "Writing a spec", step 5 (line 26), gains the touch recipe:
  - per file, `test.use({ viewport: { width: 412, height: 839 }, hasTouch: true, isMobile: true })`;
  - `const touch = await touchscreen(page)` from `support/touch.ts` (`down`, `move`, `up`, `cancel`, `drag`, `pinch`), which sends CDP `Input.dispatchTouchEvent`, so the page gets trusted touch input with `pointerType: 'touch'`;
  - open the session after the seeding reload.
- "Common mistakes" (lines 50-58) gains three rows:
  - "Swiping with `page.mouse`": nothing moves, because the swipe ignores mouse pointers.
  - "Using `page.touchscreen` for a drag": it only taps.
  - "Dispatching `TouchEvent`s with `locator.dispatchEvent`": they are untrusted and produce no Pointer Events.

**`.agents/skills/building-pwa-ui/SKILL.md`:**
- **The layer table.** The `ui/<name>/` row (line 19) gains "`core/platform` seams (`Motion`, `Haptics`)" under "May import", unless plan 3 has already added it for the Undo bar.
- **A SwipeActions paragraph** under "Component conventions":
  - Use it only on Now's top pick and ranked rows. Each swipe action needs a single-pointer control elsewhere (WCAG 2.5.1 and 2.5.7).
  - Wrap the content inside the `<li>`, so row selectors hold.
  - Its inputs (`taskId`, `disabled`, `endEnabled`, `startEnabled`) and outputs (`commitEnd`, `commitStart`, which emit the Task id).
  - The tuning constants live in `swipe-decision.ts`.
  - Pointer listeners use `addEventListener`, so a move runs no change detection.
  - Specs stub `getBoundingClientRect` on the instance and `performance.now`.
- **The accessibility list** gains: "A clipping wrapper (`overflow: clip`) keeps the focus ring with `overflow-clip-margin: 4px`, and lifts itself with `:focus-within { z-index: 2; }` when its content is positioned, so the next row does not cover the ring."

**Not changed:**
- `CONTEXT.md`: the swipe adds no Domain term. Undo comes from plan 3.
- The design system: plan 1 unit 1's amendment already carries the swipe pattern entry.

**Check:**
- `pnpm exec nx build pwa` with no warning
- `node scripts/check-spdx.mts`
- `pnpm exec nx format:check --all`
- A grep for the em-dash character in the two skills finds nothing.

## Out of scope

- **A one-time hint** that teaches the swipe. Decide it after the on-device check.
- **A swipe on Waiting rows,** the Inbox, Triage or the Task editor. The user asked for the top pick and ranked rows only.
- **Configurable directions, and short and long swipes** with two commit points.
- **Right-to-left layouts.** ASYS is English only.
- **A keyboard shortcut on ranked rows.** The editor's Done and Log progress are the keyboard path.
- **A mouse drag on desktop.**
- **Haptics on iOS.** `navigator.vibrate` is not supported there, and the `<input type="checkbox" switch>` workaround needs a real tap on the switch.
- **Reopening a Done Task** after the Undo window. Plan 3 records that a ReopenTask Command was offered and declined.

## Facts checked on 2026-10-05

Installed: `@angular/core` and `@angular/router` 22.2.1, `@playwright/test` 1.63.0 (`playwright-core` 1.63.0), `vitest` 5.0.2, `jsdom` 30.1.1, `typescript` 6.0.3. `@angular/cdk`, `@ionic/core`, `hammerjs` and `@use-gesture/*` are not installed.

- **The libraries** (npm registry and GitHub API, queried 2026-10-05):
  - `@ionic/core` 9.0.6, MIT, published 2026-09-30:
    - 20,776,967 bytes unpacked in 2,739 files, depending on `tslib`, `ionicons` ^8.1.0 and `@stencil/core` ^4.44.2;
    - `createGesture` listens to `touchstart`, `touchmove`, `touchend`, `touchcancel` and the mouse equivalents, never calls `preventDefault` or `setPointerCapture`, and has no click suppression;
    - its gesture chunks in `@ionic/core/components` are about 5.8 kB raw and 2.5 kB gzipped (unpkg 9.0.6);
    - it is not on JSR.
  - `hammerjs` 2.0.8, MIT, published 2016-04-22, with its last commit on 2019-05-28. `@egjs/hammerjs` 2.0.17, MIT, published 2019-12-16, last pushed 2021-02-01. `@angular/platform-browser` 22.2.1's types contain no reference to Hammer (21.2.13's contain 42).
  - `@angular/cdk` 22.2.1, MIT, published 2026-09-30. Drag starts once the summed movement reaches 5px, then calls `preventDefault` on the move. It listens to `mousedown` and `touchstart`. No click suppression was found. Source: `angular/components` `drag-ref.ts` and `drag.ts` on main.
  - `@use-gesture/vanilla` 10.3.1, MIT, published 2024-03-21. It uses Pointer Events and offers `filterTaps`, `axis` and the swipe options (use-gesture.netlify.app/docs/options).
  - `tinygesture` 3.0.1, Apache-2.0, last published 2026-04-04. `interactjs` 1.10.28, MIT, published 2026-08-01, 1.4 MB unpacked.
- **Pointer Events** (MDN, Pointer Events 3):
  - Pointer Events, `setPointerCapture`, `pointercancel` and `touch-action` are Baseline widely available.
  - `touch-action` is read at `pointerdown`, a change mid-gesture has no effect, and the values from the touched element up to its scroll container are intersected. `pan-y` permits single-finger vertical panning only; `pinch-zoom` is its own keyword.
  - The browser fires `pointercancel` when it takes over for a pan or a zoom.
  - `setPointerCapture` throws `NotFoundError` for a pointer that is not active, and capture ends by itself on `pointerup` or `pointercancel`.
  - A click after a captured pointer goes to the capturing element.
- **Click and RouterLink.** RouterLink's click handler returns `!this.isAnchorElement` (`node_modules/@angular/router/fesm2022/_router_module-chunk.mjs:355-381`), so for an anchor it is what prevents the native navigation. Whether a touch browser still sends a `click` after a drag past the tap slop has no primary source, so it is suppressed defensively.
- **jsdom 30.1.1,** probed with a bare `JSDOM` on 2026-10-05:
  - `PointerEvent` keeps `pointerType`, `clientX` and `pointerId`, and `isPrimary` defaults to false.
  - `Element.prototype.setPointerCapture` is undefined.
  - An inline `style.translate` of `-8px 0` reads back as written.
  - Layout sizes are 0.
  - The unit-test builder forces `isolate: false`.
  - Under fake timers `fixture.whenStable()` hangs, and `vi.advanceTimersByTimeAsync(0)` runs change detection (`docs/slice-1-plan.md:1031`).
- **Vibration** (W3C Vibration spec, MDN BCD):
  - `navigator.vibrate` needs sticky activation, and the first `pointerup` of a touch gives it.
  - Chrome Android supports it. Safari and iOS do not. Firefox Android returns true but does not vibrate.
- **WCAG 2.2.** SC 2.5.1 Pointer Gestures (A) names horizontal swiping as path-based and requires a single-pointer alternative. SC 2.5.7 Dragging Movements (AA) requires a single-pointer alternative to dragging. ARIA 1.3 (working draft, 2026-06-04) has no custom-actions property. Sources: w3.org/WAI/WCAG22/Understanding/pointer-gestures and dragging-movements.
- **Android back gesture.** Back is an inward swipe from either edge, and system gestures take priority in their insets (developer.android.com, gesture navigation). The 24 dp default comes from secondary sources.
- **Playwright 1.63.0:**
  - `page.touchscreen` only taps.
  - playwright.dev/docs/touch-events dispatches untrusted `TouchEvent`s with `locator.dispatchEvent`.
  - The Pixel 7 descriptor is 412 by 839 with `isMobile` and `hasTouch`.
  - The `reducedMotion` context option defaults to `no-preference`.
  - The only Playwright project is `chromium`, on the `Desktop Chrome` descriptor (`apps/pwa-e2e/playwright.config.mts:25`).
- **CDP touch input** (`playwright-core/types/protocol.d.ts`):
  - `Input.dispatchTouchEvent` takes `type` (`touchStart`, `touchEnd`, `touchMove` or `touchCancel`), `touchPoints`, `modifiers` and `timestamp`. `touchEnd` and `touchCancel` must contain no touch points (`:9395-9418`).
  - A `TouchPoint` has `x` and `y` in CSS pixels relative to the viewport, and an `id` unique within one dispatch (`:9086-9130`).
  - `Input.synthesizePinchGesture` takes `x`, `y` and `scaleFactor` (`:9495-9517`).
- **The app:**
  - `apps/pwa/src/index.html:8` allows zoom (no `user-scalable` or `maximum-scale`).
  - `apps/pwa/src/app/core/platform/theme.ts:46` only ever sets `light` or `dark`.
  - The kill switches in `apps/pwa/src/styles.css:209-224` cover CSS animations and transitions, not Web Animations started by `Motion.play`.
  - The budgets are in `apps/pwa/project.json:31-42`.

### Facts to check while building

1. **CDP touch gives `pointerType: 'touch'`** with `isPrimary` true, and honours `touch-action`: a vertical CDP drag scrolls and a horizontal one does not. Check it in unit 4's first run. If scrolling does not follow, case 4 uses `Input.synthesizeScrollGesture` with `gestureSourceType: 'touch'` instead, and the plan records why.
2. **A two-point `dispatchTouchEvent` pinch zooms** with `isMobile`. If it does not, `touch.pinch` uses `Input.synthesizePinchGesture` (`protocol.d.ts:9495`).
3. **The sign-up fixture works** with `hasTouch` and `isMobile`. Its clicks go through the mouse, which a touch context still accepts.
4. **Chrome sends a `click` after a locked horizontal drag** on a link, and to which element: the capturing host is expected, so the link does not navigate even without suppression. Record what it does. Suppression stays either way, and unit 2 case 12 is its proof.
5. **On device: the edge back gesture.** Whether Android takes a swipe that starts 24 to 40px from an edge in the installed PWA. Raise `EDGE_DEAD_ZONE_PX` if it does.
6. **On device: the thresholds** (40%, 0.6 px/ms past 64px, 10px slop, 1.5 ratio) feel right on the phone. Any change edits the constants and the unit 1 table.
7. **On device: the haptic.** Whether the arm and disarm ticks feel distinct within plan 1's 10 to 20 ms range, and that the first swipe after launch has none.
8. **On device: 60 fps** while tracking, with the direct DOM writes.
9. **The focus ring stays whole.** `overflow-clip-margin` keeps a row's focus ring inside the clip in Chrome Android, and with `.asys-swipe:focus-within { z-index: 2; }` the bottom edge of a focused row's ring shows over the following row. Check it with a screenshot in e2e or on the device. Check `overflow-clip-margin` support in Safari before relying on it there.
10. **`:active` during a drag.** Whether the row's pressed `signal-soft` ground (`apps/pwa/src/app/ui/picker-row/picker-row.ts:65-67`) shows for the whole drag on Android. If it does, the surface hides it while tracking.
11. **Web Animations on the individual `translate` property** run in Chrome Android, as `Motion.play` needs.
12. **One spec at a time for the PWA.** The flag `@angular/build:unit-test` takes to run one file (likely `--include`). Until then, the check runs the whole `nx test pwa`.
13. **TalkBack.** Whether a one-finger swipe ever reaches the page. Expected not. The buttons stay the path either way.
14. **Plan 3's Swipe variant.** When plan 3 lands, confirm that after `complete(task, DoneOrigin.Swipe)` the next render already shows the next content, as decision 7 assumes. If it keeps the leaving snapshot, SwipeActions waits to reset until plan 3 starts its rise. Also confirm plan 3 unit 9's step 6: `done` moves no focus for a ranked Task that is not `displayed()`'s, as unit 3's `swipeDone` and case 16 assume.
15. **The CDP touch session after a reload.** Whether the session from `newCDPSession(page)` still dispatches touch input after `page.reload()`. Until that is known, every test opens its session after its last reload. If it does survive, `touch.ts` says so.
16. **The move-resets rule** (decision 8). Confirm the departure from the approved design with the maintainer before unit 3 is built. If it is declined, `now.spec.ts:1058`, `:1074` and `:1087` get the new expected results listed in unit 3.

## Risks

- **An accidental Done.** A 40% threshold and a 0.6 px/ms fling past 64px can still catch a sloppy scroll. The Undo bar is the only way back, and only for 5 s. The axis lock gives way to vertical early (1.5 ratio), and the on-device check tunes it.
- **The system back gesture.** Android's inset can swallow a swipe that starts near the edge, so the dead zone may need to grow, which narrows the area that swipes.
- **CDP touch is not a real finger.** The e2e proves the wiring, `touch-action` and the clip in Chromium, but not feel, haptics or iOS. The on-device checks cover those.
- **The top pick changes under the finger.** A poll can re-rank while a gesture is in flight. The recorded Task id (decision 7) stops a wrong Done. A change before the release springs the swipe back, and a change during the exit resets it when the animation ends. Either way nothing is emitted and nothing explains why.
- **"Needs an Estimate" for an Estimate of 1 min.** The design's copy fits a missing Estimate better than a 1 min one. It is kept as designed. Revisit it with the one-time hint.
- **The `ui` layer now reaches into `core/platform`.** That is a new dependency direction, kept to the two seams and recorded in `building-pwa-ui`.
- **The bundle.** The initial bundle sits near its 500 kB warning. Unit 5 measures it, and crossing the warning stops the work for a decision.
- **Cross-plan drift.** This plan depends on plan 3's names and timing (`displayed`, `DoneOrigin`, the collapse, the Undo bar). Fact 14 and unit 3's reliance on plan 3's spec fakes surface any drift at build time.
