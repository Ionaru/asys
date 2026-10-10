<!-- SPDX-License-Identifier: EUPL-1.2 -->
# Capture and Done animations

This plan makes capturing and completing a Task feel good without slowing either down.
- Quick add keeps the keyboard up. Each capture clears the field at once, is sent in the background, and confirms with a short flight to the Inbox tab and a pop of its badge. A capture that fails stays visible as a row with Try again and Discard.
- Done is instant. The Task leaves at once, a check and the word Done draw, the next Task rises in, and an Undo bar offers Undo for 5 seconds. CompleteTask is sent when the bar closes.

It was drawn up on 2026-10-05 and reviewed adversarially the same day, with the confirmed findings folded in. The work sits outside the slice plan and is done before slice 2.

**Build order.** This is plan 3 of three, built second:
1. `docs/view-transitions-plan.md` (plan 1) is built first. This plan needs its unit 1: the motion tokens, the `Motion` and `Haptics` seams and the kill switches. It also uses unit 3's z-index ladder (which already lists `shell-undo`) and its `data-leaving` exclusion, and unit 4's `data-task-id` hooks. This plan sets `data-leaving` itself, on every node it removes with motion.
2. This plan.
3. `docs/swipe-to-done-plan.md` (plan 2) builds on this plan's `displayed` signal, `DoneOrigin` and the row exit.

**What happens today.**
- `DataStore.send` is not optimistic (`apps/pwa/src/app/core/data/data-store.ts:197-210`). A Done on Now's top pick waits for the POST and a follow-up poll, about two round trips, before anything moves.
- Submitting quick add makes the Android keyboard hide and show again (decision 1 explains why).
- The pill and the quick-add bar swap with no motion, and nothing marks a capture landing in the Inbox except the badge's number.

## Working agreements

These are slice 1's agreements, in short:

- **One unit at a time, each with a runnable check.** The units below run in order. A unit is done when its check passes.
- **Test-first where there is behaviour to pin.** Each new test is seen to fail once for the right reason (an assertion, not a compile error) before it counts.
- **One commit, when asked.** Nothing is pushed unless the maintainer asks. A push to `main` deploys to production.
- **One builder per checkout.** Only one process builds or runs tests at a time. Stop `nx serve server` before database tests.
- **SPDX headers.** Every new `.ts` and `.css` file carries an `SPDX-License-Identifier` line for EUPL-1.2 in its comment form. Each unit's check includes `node scripts/check-spdx.mts`.

## Decisions

### 1. Quick add keeps focus, so the keyboard stays up

**Why the keyboard flickers today.** Three steps, from `apps/pwa/src/app/ui/quick-add/quick-add.ts` and `apps/pwa/src/app/layout/shell-layout.ts`:
1. Tapping Add focuses the button, so the input loses focus. Most browsers focus a clicked button (MDN, `<button>`).
2. `ShellLayout.add()` sets `busy` (`shell-layout.ts:175`), and Add's `[disabled]` includes `busy()` (`quick-add.ts:38`). The focused button becomes disabled. At the next rendering opportunity the HTML Standard's focus fix-up runs the focusing steps for the viewport, because the focused area is no longer focusable. Focus lands on the document, not the input.
3. About two round trips later, `focusInput()` (`shell-layout.ts:218-227`) refocuses the input from script, and the keyboard opens again.

**The IME trap.** The input has no `enterkeyhint` (`quick-add.ts:25-33`). Chromium then maps the keyboard's action key to Next when another focusable element follows, and Next moves focus to that element instead of submitting. Here that element is Add, so the action key also takes focus out of the input.

**The fix.**
- Add is never natively disabled. While the trimmed value is empty it gets `aria-disabled="true"` and the class `is-disabled`, which `ui/button/button.ts:117-121` already styles at 40% opacity. `submit()` guards the empty case only.
- Add's `mousedown` calls `preventDefault()`, so a tap does not move focus to it. The click still fires. Whether this keeps the Android keyboard up is checked on the device (fact to check 1). The fallback is a synchronous `input.focus()` in Add's click handler.
- The input gets `enterkeyhint="send"`, so the action key submits.
- `busy` goes away: captures queue (decision 2), so there is nothing to wait for.

### 2. `CaptureQueue` sends captures one at a time and keeps what failed

`CaptureQueue` (`core/data/capture-queue.ts`) is `@Service({ autoProvided: false })` in `ShellLayout`'s providers, next to the shell's `CommandAttempts`. Account is a shell child (`app.routes.ts`), so it can reach the queue at sign-out.

**Submit.**
- The shell clears the field at once and focus stays in the input.
- Each submit builds its own `CaptureTask` with a new `taskId` from `Ids` and gets its key from the shell's `CommandAttempts`.
- Today's text-matching `pending` reuse (`shell-layout.ts:199-216`) goes away. Only a row's Try again reuses a command.
- Captures are sent one at a time, in the order submitted.

**The outcome table.**

| Outcome | Status line in quick add | Row |
| --- | --- | --- |
| Applied | "Captured. It waits in the Inbox." (today's copy, kept) | none |
| Failed | `outcomeMessage(outcome)` | Try again (the same command and key) and Discard |
| KeyReused | `outcomeMessage(outcome)` | Try again (a fresh command and key) and Discard |
| Rejected | `outcomeMessage(outcome)` | Discard only |
| NotApplicable | `outcomeMessage(outcome)` | Discard only |
| SignedOut | none | none: the whole queue is dropped, as today the session ends |

**The rows.**
- Each row reads `Not captured: “<text>”`. The text wraps to two lines, then an ellipsis. The outcome sentence sits under it in `reason`, `ink-muted`. Try again and Discard sit below, each at least `tap-target` tall.
- The rows render inside the quick-add bar, above the input row, so the input stays where the thumb is.
- While rows exist, the Capture pill carries a count badge: `ink` fill, `paper` text, `label` size in `mono`, like the Inbox badge. Its text is the count plus a visually hidden " not captured".

**Loss.** Nothing is lost while the app stays open. Sign-out awaits `drain()` before signing out. Rows that are still failed then are dropped with the shell (see Risks).

**Slice 4.** Its outbox replaces this queue, and its Queued chip replaces these rows. The design system says queued edits show a Queued chip and failed replays become Review items. A Not captured row is neither a queued replay nor a dialog: it is a temporary inline surface for a send that failed while the app is open. Unit 12 records this as a design-system note.

### 3. The capture flight and the badge pop

- **The flight.** On submit, an `aria-hidden` ghost with `pointer-events: none` carries the captured text from the field to the Inbox tab, over `duration-moderate` with `ease-emphasized`, fading out as it lands. It is removed when the animation ends.
- **When it is skipped.** When `Motion.allowed()` is false, when `visualViewport` is missing, or when the Inbox tab's box is not wholly inside `visualViewport`. The keyboard can cover the fixed nav under the default `resizes-visual`, and Voice only hides the nav. The badge and the status line then carry the confirmation.
- **The badge pop.** The Inbox badge pops (`duration-quick`) whenever the real count rises. It does not wait for the flight.
- **No optimistic Inbox count.** The count rises only after the capture is synced, about two round trips after the flight. A local overlay for queued captures is out of scope unless the on-device check shows the lag (fact to check 4).

### 4. The pill and the bar

- The quick-add bar enters with `animate.enter="asys-rise"`: an 8px rise and a fade over `duration-quick`, `ease-out`.
- The pill fades in with `animate.enter="asys-appear"`.
- `asys-rise` and `asys-appear` are shared classes in `apps/pwa/src/styles.css`, because the Undo bar uses `asys-rise` too. The existing kill switches (`styles.css:209-224`) turn them off under reduced motion and in Voice only.
- **Leaving is marked.** The pill, the bar and the Undo bar leave through a function-form `(animate.leave)`, not the string form `animate.leave="asys-leave"`, which sets no attribute. The function sets `data-leaving` on the node, fades it out through `Motion.play` (`MotionDuration.Quick`, `MotionEasing.Out`) and calls `animationComplete` in `finally`. Plan 1's exclusion then keeps a leaving pill from sharing `shell-capture` with the entering bar, which would make a navigation in that 150 ms skip its transition. `Motion.play` resolves at once when motion is not allowed, so the node goes at once.

### 5. `DataStore` holds a Done before it is sent

ADR 0004 already describes the model: Now is derived locally with the domain package, and "an Undo cancels a command that is still queued". The held Done is an in-memory, Done-only precursor of slice 4's outbox, so it needs no new ADR.

**The API.** `hold(command: CompleteTask, key: string): void` and `release(key: string): void` on `DataStore`.

**The derivation.**
- The store keeps the server's state in a private synced signal. Snapshots (`data-store.ts:374`) and polls (`data-store.ts:441`) write only to it.
- `state` becomes `applyHolds(synced, holds)`. For each hold, in the order held: `applyCommand(acc, hold.command, hold.at)` (`libs/domain/src/lib/commands/apply-command.ts:18-52`, which dispatches CompleteTask to `completeTask` at `task-commands.ts:248-254`). When the result is Applied, its changes go through `applyChanges` (`working-set/apply-changes.ts:86-88`). Otherwise the hold is skipped.
- `hold.at` is `Clock.now()` when `hold()` is called.
- `now` and `inboxCount` (`data-store.ts:90-109`) read the derived `state`, not the synced signal.
- An Applied CompleteTask puts the Task with status Done (`task-commands.ts:229-246`, `put` at `:68-83`). `applyChange` then removes any Task that is not Open or Delegated, with the links where it is the waiting Task (`apply-changes.ts:30-43`). A link where another Task waits for it stays, and `blockedReasons` ignores a blocker that is missing (`libs/domain/src/lib/task/blocked.ts:24-30`). So a held Task leaves `state`, Now and the Inbox count exactly as the poll after the real send would remove it.

**A hold releases itself** once the synced state already shows the Task closed:
- On every write of the synced state, each hold for which `applyCommand(synced, hold.command, hold.at)` is no longer Applied is removed.
- After the server applies the Done, the next successful poll removes the Task from the synced state. `close` then answers Rejected NotFound (`task-commands.ts:236`), so the hold goes.
- A failed follow-up poll after Applied leaves the synced state unchanged, so the hold stays. `DataStore.send` resolves its waiters on a failed settle too (`data-store.ts:279-296`), so releasing on `send` resolving would bring the Task back as the top pick with "Saved. Waiting for the server." until a later poll succeeds.
- A non-Applied send outcome releases the hold at once (`DoneUndo` calls `release`).
- `stop()` (`data-store.ts:160-189`) clears every hold.

### 6. `DoneUndo` owns the window, the key and the send

`DoneUndo` (`core/data/done-undo.ts`) is `@Service({ autoProvided: false })` in `ShellLayout`'s providers. It shares the shell's `CommandAttempts`, so a key outlives Now and the editor. `CommandAttempts` is per screen by design (`core/data/command-attempts.ts:37-42`). Now (`features/now/now.ts:45`) and the editor (`task-editor.ts:121`) are destroyed while a Done may still be held. A retry after a lost response must reuse the key, or the server answers NotApplicable and writes a spurious Review item.

`DoneOrigin` is exported from `done-undo.ts`: `enum DoneOrigin { Button = 'button', Swipe = 'swipe' }`.

**`complete(task, origin)`:**
1. If the same Task is already held, nothing happens.
2. Any failure shown (see Outcomes) is dismissed, because its Task is already back in Now.
3. An earlier held Done is sent at once, without waiting for its window.
4. It builds `{ _tag: CompleteTask, taskId, expect: { status: Open } }`, takes its key from `CommandAttempts.keyFor`, and calls `DataStore.hold`.
5. It shows the bar for `UNDO_WINDOW_MS = 5_000` and announces `“<title>” is Done.`
6. For `DoneOrigin.Button` it calls `Haptics.tick()`. A swipe gets no commit haptic: the threshold tick in plan 2 was the confirmation.

**Pausing.** The timer runs only while no pause reason holds. The reasons are the pointer inside the bar and focus inside the bar. A failure that displaces the bar (see Outcomes) also pauses it, so a window never runs out while its Undo is not on screen.

**Sending.**
- **When the window ends,** through `DataStore.send(command, key)`, then `CommandAttempts.settle`.
- **When the page goes away** (`visibilitychange` to hidden, or `pagehide`), at once, through `DataApi.runCommand(command, key, { keepalive: true })` (decision 7). It does not await sync. The first of the two triggers sends, and the second finds nothing held.
- **When the shell is destroyed** while a Done is held, at once, the same way as when the page goes away, and the hold is released (unit 7).
- **At sign-out,** Account awaits `flush()` before `authApi.signOut()`. Today `Account.signOut` signs out first and the store stops afterwards (`features/account/account.ts:653-674`, `app.ts:125-129`), so a flush hooked to the session state would run with the cookie gone.

**Outcomes of a send.** An Applied outcome leaves the hold to release itself (decision 5). Every other outcome releases it at once.

| Outcome | Bar | Announced |
| --- | --- | --- |
| Applied | closes | nothing |
| Failed | failure layout: `“<title>” is not Done.`, the outcome sentence on its own line, Try again (the same key) and Dismiss; no timeout | `“<title>” is not Done. <sentence>` |
| KeyReused | failure layout with Try again (a fresh key, because `settle` dropped the old one) and Dismiss; no timeout | as Failed |
| Rejected | failure layout with Dismiss only; no timeout | as Failed |
| NotApplicable | notice layout: only the Review-item sentence ("That no longer applied, so it waits in the Inbox as a Review item.", `outcome-message.ts:52`) and Dismiss; no timeout | the sentence |
| SignedOut | closes | nothing |

The Task was closed elsewhere when the answer is NotApplicable, so "is not Done" could be false, and the title line is left out.

Try again calls `complete(task, DoneOrigin.Button)` again. That holds the Task again and opens a new 5 s window. A failure that arrives while a newer Done is held displaces that Done's bar and pauses its timer until Dismiss or Try again.

**Undo** releases the hold, clears the timer, closes the bar and records `undone` for Now and the shell. Nothing was sent, so nothing reaches the server.

### 7. keepalive for a send while the page goes away

- Only a `keepalive` request outlives document unload (Fetch Standard).
- Angular 22.2.1's `HttpClient` uses `FetchBackend` by default, which passes `keepalive` through, while `HttpXhrBackend` refuses it (Facts checked). This settles the reviewers' disagreement: `app.config.ts:22` uses `provideHttpClient(withInterceptors(...))` with no `withXhr()`, so commands go over fetch.
- `withXhr()` must never be added.
- The generated `dataRunCommand` cannot be edited, but it takes an `HttpContext` (`apps/pwa/src/generated/api/fn/data/data-run-command.ts:17,24`). So `core/api/keepalive.ts` holds a `KEEPALIVE` `HttpContextToken<boolean>` and a `keepaliveInterceptor` that clones a marked request with `keepalive: true`. `DataApi.runCommand(command, key, options?: { keepalive?: boolean })` sets the token.

### 8. The Undo bar

`UndoBar` (`ui/undo-bar/undo-bar.ts`, selector `asys-undo-bar`) is rendered by the shell on every shell route, directly after `<main>`, so Undo is the next stop in tab order after the page. Its host carries the class `asys-undobar` (`host: { class: 'asys-undobar' }`), and the shell adds `shell__undo` for placement only. Plan 1's single `styles.css` rule `.asys-undobar { view-transition-name: shell-undo; }` names the host once, and its ladder puts `shell-undo` in the chrome tier. No component style sets the name, because two elements with one name make the browser skip the transition.

**Look.**
- `surface` with a 1px `line` top border and no shadow: the design system keeps `shadow-sheet` for sheets and the quick-add bar.
- Done layout, left to right: an inline SVG check and "Done" in `ink-muted`, then the Task title on one line with an ellipsis, then Undo, a quiet button.
- The one-line title is an exception to the design system's rule that a Task title in Now is never truncated to one line (README line 57). The bar is chrome, not the Task's own surface, and the full title is announced in the status region. Plan 1's "Undo bar" amendment entry states this exception.
- Failure and notice layouts wrap their text. Their Try again is Secondary, as in the Not captured rows, and Dismiss is Quiet.
- The bar enters with `asys-rise` and leaves through the marked fade of decision 4.

**Placement.**
- It sits directly above the nav, and the pill or the quick-add bar sits above it. A Done while typing therefore lifts the input by the bar's height, and the bar itself never moves under the thumb.
- Its height is published as `--shell-undo-height` on the shell host, through a `ResizeObserver` that is used only when `typeof ResizeObserver === 'function'`. It is `0px` while no bar shows.
- The page padding, the pill and quick add add it. New code reads `--shell-nav-height` (56px) for the nav, so the shell's nav-offset literals switch to it. `bottom-nav.ts:60` (the nav item's height) and `capture-button.ts:19` (the pill's own height) stay as they are.

**Voice only.** The nav is hidden there (`bottom-nav.ts:121-123`), so the bar sits at the bottom, at `env(safe-area-inset-bottom)`. Its buttons are `tap-target-drive`, which `button.ts:123-139` already gives every button, and it has no shadow anyway.

**Announcements.** One always-mounted, empty `<p role="status" class="asys-visually-hidden shell__status">` in the shell announces `DoneUndo`'s notices. The animated bar is not a live region: a region inserted with its text already set is announced unreliably. Before each new notice the shell empties the region, then writes the text after the next render, so an identical second notice is announced again.

**Keyboard.**
- A keyboard-activated Done (`click` with `event.detail === 0`) moves focus to Undo. A pointer Done never moves focus to the bar.
- Escape in the bar moves focus to the next title: the first `[data-task-id]` inside `<main>` for which `closest('[data-leaving]')` is null (or its closest `a`), else `<main>`'s h1. `data-leaving` sits on the card host or the row's `<li>`, while `data-task-id` sits on the title inside it, so `[data-task-id]:not([data-leaving])` alone would still match a leaving title. Plan 1's handler uses the same ancestor test.
- Ctrl+Z or Cmd+Z undoes while the Done layout shows, unless focus is in an editable field (`input`, `textarea`, `select` or `contenteditable`), where it stays text undo.
- After Undo, focus goes to the restored Task's title (the same lookup with its id), else the h1.

**WCAG 2.2.1 (Timing Adjustable).** The window is a time limit on a user action. ASYS meets the success criterion by letting the person stop the limit:
- Keyboard and keyboard-driven screen-reader users land on Undo, and the timer stays paused while focus is in the bar.
- Pointer users pause it by resting on the bar.
- A failure never times out.

The window is the only way back from a Done. A ReopenTask Command was offered on 2026-10-05 and declined, so once CompleteTask is sent the Task stays Done. This is a judgement recorded here, not an audit. Whether TalkBack's activation counts as a keyboard activation is fact to check 9.

### 9. Now's Done sequence

**`displayed`.**
- `displayed` is the leaving snapshot while it exits, otherwise `ranked[0]`.
- It drives every input and output of the top pick, and the `<article>` renders while it is non-null. So the card survives the exit even when the list empties: the watch in the e2e `now.spec.ts:86-114` (the article is never absent) holds.
- The leaving content is `inert` and carries `data-leaving`. Other taps are never blocked.
- The list shows the ranked Tasks other than `displayed`, so a row is never shown twice.

**Focus.**
- After a Done, focus moves to the new top pick's title, or to the h1 when nothing is ranked, once the new content renders.
- A keyboard Done leaves focus on Undo.
- After Undo the shell focuses the restored title (decision 8).
- After a failure, focus stays where it is.

**The timeline for a Button Done** on the top pick, 500 ms or less:

| Time | Step |
| --- | --- |
| t0 | The hold; the Undo bar rises (`duration-quick`, `ease-out`); the haptic; on the card, the actions give way to a check and "Done" in `ink-muted`, the check drawing over `duration-quick` with `ease-out` |
| t100 | The old content leaves to the right (`duration-quick`, `ease-in`) |
| t250 | The next content rises in (`duration-moderate`, `ease-out`) while the promoted row collapses (`duration-moderate`, `ease-out`) |
| t500 | Settled |

- **Collapse.** The row collapses through an `(animate.leave)` function. It measures the row's height, runs `Motion.play` from `height: h` to `0`, and calls `animationComplete` in `finally`. Without that call Angular waits 4000 ms before removing the row. Any ranked row that leaves this way collapses, not only the promoted one.
- **A Swipe Done** (plan 2) skips t0's check and t100, because the reveal already showed them. It gets no commit haptic. The next content rises in at once.
- **A ranked row that is held** collapses the same way, and the top pick is unchanged.
- **Undo** plays the reverse: the restored content rises in (`duration-moderate`, `ease-out`), the displaced top's row expands back from height 0 (`duration-moderate`, `ease-out`), and the bar leaves (the marked fade of decision 4). Now records which row to expand when the Done happens, because once Undo has released the hold the state already shows the restored Task.
- **Reduced motion and Voice only.** `Motion.play` resolves at once, and the CSS classes are switched off. Everything is instant, and the bar's check and text carry the Done state.

### 10. Editor Done

The editor's Done holds the Task and navigates back at once, through `leave()` (`task-editor.ts:982-988`). It no longer waits for the send. `leaving` is set first, so the `view` linkedSignal (`task-editor.ts:530-546`) keeps rendering the Task while it is held. Drop is unchanged and still goes through `leaveWith` (`task-editor.ts:959-980`).

### 11. If plan 1's design-system amendment is declined

- Every duration here falls back to `--duration-quick`.
- The capture flight is dropped, and the status line carries the confirmation.
- The Undo bar's 1px `line` border is already within the design system's rules, so it is unaffected.

## The units

| Unit | Delivers | Check |
| --- | --- | --- |
| 1. Quick-add focus | `aria-disabled` Add, `mousedown` guard, `enterkeyhint="send"`, no `busy` | `quick-add.spec.ts` |
| 2. `CaptureQueue` and its rows | The queue, the rows in quick add, the pill's count, the shell wiring | `capture-queue.spec.ts`, `quick-add.spec.ts`, `capture-button.spec.ts`, `shell-layout.spec.ts` |
| 3. The flight and the badge | `layout/capture-flight.ts`, the badge pop | `capture-flight.spec.ts`, `bottom-nav.spec.ts` |
| 4. The pill and the bar | `asys-rise`, `asys-appear`, `layout/shell-motion.ts`, the enter and leave bindings | `shell-motion.spec.ts`, `nx build pwa`, then the existing `capture.spec.ts` and `phone-width.spec.ts` |
| 5. `DataStore` hold and release | `core/data/held-state.ts`, the derived `state` | `held-state.spec.ts`, `data-store.spec.ts` |
| 6. keepalive | `core/api/keepalive.ts`, `DataApi.runCommand` options, `app.config.ts` | `keepalive.spec.ts`, `data-api.spec.ts` |
| 7. `DoneUndo` | `core/data/done-undo.ts` | `done-undo.spec.ts` under fake timers, no fixture |
| 8. The Undo bar and the shell | `ui/undo-bar`, the shell's region, offsets and focus rules, Account's sign-out | `undo-bar.spec.ts`, `shell-layout.spec.ts`, `account.spec.ts` |
| 9. Now's sequence and the editor Done | `now.ts`, `top-pick.ts`, `features/now/row-motion.ts`, `task-editor.ts` | `now.spec.ts`, `top-pick.spec.ts`, `row-motion.spec.ts`, `task-editor.spec.ts` |
| 10. e2e | The clock recipe, the reload case, phone width, `motion-off.spec.ts` | `nx e2e pwa-e2e` and `nx run pwa-e2e:e2e-image` green |
| 11. Budget | The size recorded | `nx build pwa` with no budget warning |
| 12. Docs | `mvp-plan.md`, `CONTEXT.md`, two skills, the design-system note | `check-spdx`, `format:check`, the em-dash grep |

Paths below are relative to `apps/pwa/src/app` unless they start with `apps/`, `libs/` or `docs/`. Each unit's check also runs `pnpm exec nx lint pwa` and `pnpm exec nx typecheck pwa`. Unit tests run one spec at a time, for example `pnpm exec nx test pwa -- src/app/ui/quick-add/quick-add.spec.ts`. Specs use the fakes from plan 1 for `Motion` (a `play` whose promise the spec controls, and an `allowed` it sets) and `Haptics` (`tick` as `vi.fn`).

### Unit 1: quick-add focus

Owns `ui/quick-add/quick-add.ts` and `ui/quick-add/quick-add.spec.ts`.

**Behaviour.**
- The input has `enterkeyhint="send"`.
- Add has no `[disabled]` binding. While `value().trim() === ''` it has `aria-disabled="true"` and the class `is-disabled`. Otherwise it has neither (the attribute is absent, not `"false"`).
- Add's `mousedown` calls `preventDefault()`. The spec dispatches `new MouseEvent('mousedown', { cancelable: true })` on Add and expects `defaultPrevented === true`.
- `submit()` calls `preventDefault()` and emits `add` with the trimmed value when it is not empty. It emits nothing for `''` or `'   '`.
- The `busy` input is removed.

**Tests it legitimately breaks.**
- `quick-add.spec.ts:13`: the `Host` binds `[busy]="busy()"`. The binding and the `busy` signal go.
- `quick-add.spec.ts:105-117`: "disables Add while the value is blank". Now Add has `aria-disabled="true"` and `is-disabled` for `''` and `'   '`, neither for `'Call Marit'`, and `disabled === false` throughout.
- `quick-add.spec.ts:119-127`: "disables Add while busy". Deleted, because there is no busy state.
- `quick-add.spec.ts:170-179`: "emits nothing on submit while busy". Deleted for the same reason.

**New tests:** `enterkeyhint` and the `mousedown` guard. Focus staying on the input is not a unit test: jsdom's synthetic mouse input never moves focus, so such a test could not fail. Unit 10's `capture.spec.ts` checks it in Chromium, and the Android keyboard is fact to check 1.

### Unit 2: `CaptureQueue` and its rows

Owns the new `core/data/capture-queue.ts` and `capture-queue.spec.ts`, plus `ui/quick-add/quick-add.ts` and its spec, `ui/capture-button/capture-button.ts` and its spec, and `layout/shell-layout.ts` and its spec.

**New types,** in `core/data/capture-queue.ts`:
- `interface FailedCapture { readonly id: string; readonly text: string; readonly message: string | null; readonly canRetry: boolean }`. `id` is the command's `taskId`.
- `@Service({ autoProvided: false }) class CaptureQueue` with:
  - `failed: Signal<readonly FailedCapture[]>`, in the order the rows appeared;
  - `message: Signal<string | null>`;
  - `submit(text: string): void`, `retry(id: string): void`, `discard(id: string): void`, `drain(): Promise<void>` and `clearMessage(): void`.
- It injects `DataStore`, `CommandAttempts` and `Ids`.

In `ui/quick-add/quick-add.ts`, `interface QuickAddFailure` has the same four fields, so the shell passes `queue.failed()` straight through.

**`CaptureQueue` behaviour.**
- `submit('Buy milk')` enqueues `{ _tag: CaptureTask, taskId: <Ids.next()>, title: 'Buy milk', captureText: 'Buy milk' }`. The shell passes trimmed text.
- One send at a time. The key is `attempts.keyFor(command)`, then `DataStore.send(command, key)`, then `attempts.settle(command, outcome)`. A second submit while the first is in flight is sent after the first resolves, in order.
- Applied sets `message` to `Captured. It waits in the Inbox.`
- A non-Applied outcome follows the table in decision 2: a row with `message: outcomeMessage(outcome)`, and `canRetry` true for Failed and KeyReused.
- `retry(id)` removes the row and enqueues at the back:
  - after Failed, the same command, which gets the same key from `CommandAttempts`;
  - after KeyReused, a copy with a new `taskId` from `Ids`.
- `discard(id)` removes the row and sends nothing. An unknown id does nothing.
- SignedOut clears the queue and the rows, and sets `message` to null.
- `drain()` resolves once nothing is queued or in flight. It resolves at once when idle. Rows do not hold it back.
- `clearMessage()` sets `message` to null.

**QuickAdd.**
- New input `failures = input<readonly QuickAddFailure[]>([])`, new outputs `retry = output<string>()` and `discard = output<string>()`.
- Each failure renders as `<div class="asys-quickadd__failure">` above `.asys-quickadd__row`, holding:
  - `<p class="asys-quickadd__failure-text">Not captured: “<text>”</p>`, clamped to two lines;
  - `<p class="asys-quickadd__failure-reason">`, only when `message` is not null;
  - Try again (secondary, only when `canRetry`) and Discard (quiet).
- Discard and Try again use the default button size, so they are at least `tap-target`.

**CaptureButton.**
- New input `count = input<number>(0)`.
- Above 0 it renders `<span class="asys-capture__badge">{{ count() }}<span class="asys-visually-hidden"> not captured</span></span>` after the word Capture. At 0 there is no badge and the text is exactly `Capture`.

**ShellLayout.**
- `providers: [CommandAttempts, CaptureQueue, DoneUndo]` (`DoneUndo` arrives in unit 7, so this unit adds `CaptureQueue` only).
- `busy`, `pending`, `commandFor` and `focusInput` go.
- `add(text)` sets `text` to `''` and calls `captureQueue.submit(text)`. Focus is not touched.
- `openQuickAdd()` calls `captureQueue.clearMessage()`.
- The bar binds `[message]="captureQueue.message()"`, `[failures]="captureQueue.failed()"`, `(retry)` and `(discard)`. The pill binds `[count]="captureQueue.failed().length"`.

**The shell spec keeps the real `CaptureQueue`** over its fake `DataStore`, as it keeps the real `CommandAttempts`. Its add tests are the integration of the field, the queue and the rows. `capture-queue.spec.ts` covers the queue alone, with a fake `DataStore` whose `send` returns deferred promises. It covers every row of the outcome table, both retries and their keys, ordering, `drain` and `discard`.

**Tests it legitimately breaks** in `layout/shell-layout.spec.ts`:
- `:290-300`: Applied. The assertions still hold. With a deferred send it also checks that the input is `''` before the send resolves.
- `:315-332`: Failed. The input is `''`. The status reads `ASYS cannot reach the server. Try again.`. One `.asys-quickadd__failure` reads `Not captured: “Buy milk”` with Try again and Discard. Clicking Try again sends `captureCommand('id-1', 'Buy milk')` with key `id-2` a second time.
- `:334-347`: still passes as written. The new text gets `id-3` and `id-4`, and the `Buy milk` row stays.
- `:349-368`: Rejected. The input is `''`, the status reads `Enter a title.`, and the row has Discard and no Try again. A second `submit()` with the field empty sends nothing (`send` called once).
- `:370-385`: NotApplicable. The input is `''`, the status is the Review-item sentence, and the row has Discard only.
- `:387-398`: KeyReused. The input is `''`, the status is `Something went wrong. Try again.`, and the row has Try again. Try again sends `captureCommand('id-3', 'Buy milk')` with key `id-4`.
- `:400-411`: SignedOut. The input is `''`, the status is `''`, and there are no rows.
- `:413-425`: still passes. It also checks that the row survives closing and opening the bar.
- `:427-448`: still passes as written (focus stays on the pill, and the reopened field is empty).
- `:450-471`: becomes "queues a second add while the first is pending". With the first send deferred, `Buy bread` submitted second is not sent until the first resolves. Then `send.mock.calls[1][0]` is `captureCommand('id-3', 'Buy bread')`. Add's `disabled` is `false` throughout.

### Unit 3: the flight and the badge

Owns the new `layout/capture-flight.ts` and its spec, `ui/bottom-nav/bottom-nav.ts` and its spec, the `asys-pop` keyframes in `apps/pwa/src/styles.css`, and the flight call in `layout/shell-layout.ts`.

**Timing.** Script motion passes `MotionDuration` and `MotionEasing` from plan 1's `core/platform/motion.ts` to `Motion.play`, which resolves the token variables against `<html>`. No code in this plan reads a motion token or holds a fallback number or curve.

**`layout/capture-flight.ts`.**
- `interface ViewportBox { readonly offsetLeft: number; readonly offsetTop: number; readonly width: number; readonly height: number }`.
- `const tabInView = (tab: DOMRectReadOnly, viewport: ViewportBox): boolean` is true when the tab has a non-zero area and lies wholly inside the box.
- Examples, with the box `{0, 0, 412, 500}`:
  - a tab at `{x: 275, y: 783, w: 137, h: 56}` gives false (under the keyboard);
  - the same tab with the box height 839 gives true;
  - a zero-size tab gives false.
- `const flyCapture = (doc: Document, motion: Motion, from: DOMRectReadOnly, to: DOMRectReadOnly, text: string): Promise<void>`:
  - it appends `<span class="shell__ghost" aria-hidden="true">` with the text to `doc.body`, fixed at `from`'s box, `pointer-events: none`;
  - it plays a move to `to`'s centre with `scale` to 0.2 and opacity to 0 over the last third, with `{ duration: MotionDuration.Moderate, easing: MotionEasing.Emphasized }`;
  - it removes the ghost in `finally`, also when `play` rejects.

**Shell.** After `submit`, when `motion.allowed()` and `visualViewport` exist and `tabInView` holds for the Inbox tab, the shell calls `flyCapture` without awaiting it. `BottomNav` gains `inboxTab(): HTMLElement | null`, which returns the Inbox link.

**Badge pop.**
- `BottomNav` remembers the last count. When the count rises above the last one, it bumps a `pop` counter. The badge renders inside `@for (key of [pop()]; track key)` with `animate.enter="asys-pop"`, so a rise re-creates it.
- A fall, an unchanged count, and the first value seen do not bump it.
- `asys-pop` in `styles.css` is `@keyframes asys-pop { 50% { scale: 1.25; } }` over `var(--duration-quick) var(--ease-out)`.

**Tests.**
- `bottom-nav.spec.ts` gains "re-creates the badge when the count rises": 1 to 2 gives a different node, 2 to 1 and 2 to 2 give the same node.
- `capture-flight.spec.ts` covers `tabInView`'s table, checks that the `Motion` fake received `MotionDuration.Moderate` and `MotionEasing.Emphasized`, and checks that the ghost is gone after `play` resolves and after it rejects.

### Unit 4: the pill and the bar

Owns the `asys-rise` and `asys-appear` rules in `apps/pwa/src/styles.css`, the new `layout/shell-motion.ts` and `shell-motion.spec.ts`, and the bindings in `layout/shell-layout.ts`.
- `@keyframes asys-rise { from { opacity: 0; translate: 0 var(--space-2); } }`, and `.asys-rise { animation: asys-rise var(--duration-quick) var(--ease-out); }`.
- `@keyframes asys-appear { from { opacity: 0; } }`, and `.asys-appear` with the same timing.
- `layout/shell-motion.ts` exports `const leaveMarked = (motion: Motion, event: AnimationCallbackEvent): Promise<void>`. It sets `data-leaving` on `event.target`, plays `[{ opacity: 1 }, { opacity: 0 }]` with `{ duration: MotionDuration.Quick, easing: MotionEasing.Out }`, and calls `event.animationComplete()` in `finally`.
- `<asys-quick-add>` gets `animate.enter="asys-rise" (animate.leave)="leave($event)"`. The pill gets `animate.enter="asys-appear" (animate.leave)="leave($event)"`. The shell's `leave(event)` calls `leaveMarked(this.motion, event)`.

**Tests.** `shell-motion.spec.ts` calls `leaveMarked` with a fake event and the `Motion` fake. `data-leaving` is set before `play` is called, and `animationComplete` is called once when `play` resolves and once when it rejects.

`animate.*` does nothing in jsdom, so `shell-layout.spec.ts`'s `pill()` and `bar()` checks after one `settle()` are unaffected. **Check:** `shell-motion.spec.ts`, then `pnpm exec nx build pwa` passes, then the existing `capture.spec.ts` and `phone-width.spec.ts` on the dev stack (`pnpm exec nx e2e pwa-e2e -- src/capture.spec.ts src/phone-width.spec.ts`). The motion-off assertions for the pill and the bar are unit 10's.

### Unit 5: `DataStore` hold and release

Owns the new `core/data/held-state.ts` and `held-state.spec.ts`, plus `core/data/data-store.ts` and `data-store.spec.ts`.

**New types,** in `held-state.ts`:
- `interface Hold { readonly key: string; readonly command: CompleteTask; readonly at: Instant }`.
- `const applyHolds = (synced: DomainState, holds: readonly Hold[]): DomainState` folds as decision 5 says. It returns `synced` itself when no hold applies.
- `const isStillHeld = (synced: DomainState, hold: Hold): boolean` is `applyCommand(synced, hold.command, hold.at)._tag === TransitionResultTag.Applied`.

**`DataStore` changes.**
- `hold(command: CompleteTask, key: string): void`. A second hold with the same key replaces the first.
- `release(key: string): void`. An unknown key does nothing.
- `heldKeys: Signal<ReadonlySet<string>>`.
- `state` is computed from the private synced signal and the holds. `now` and `inboxCount` read it.
- Every write of the synced signal (snapshot or poll) drops the holds for which `isStillHeld` is false. `stop()` drops them all.

**`held-state.spec.ts`** (plain domain states, no TestBed):
- An Open Task A, held: A is absent from the result.
- A held while missing: the result is `synced`.
- A held while already Done: the result is `synced`, and `isStillHeld` is false.
- A and B held: both are absent, applied in order.
- An Inbox Task held: `inboxCount` of the result drops by 1.
- A held while C waits for it: C's link to A is still in `links`, and `isBlocked(C, tasks, links)` is false, so C can be ranked. This is what `applyChanges` does with the server's own change.

**`data-store.spec.ts`** gains these cases:
- `hold` hides the Task from `state()` and `now()`, and `release` restores it.
- A poll that still has A Open keeps the hold. A poll that brings A's Done change drops it (`heldKeys()` is empty).
- A failed follow-up poll after an Applied `send` keeps the hold, while `awaitingSync()` holds A.
- A snapshot write prunes the same way.
- `stop()` empties `heldKeys()`.

No existing `data-store.spec.ts` case changes.

### Unit 6: keepalive

Owns the new `core/api/keepalive.ts` and `keepalive.spec.ts`, plus `core/api/data-api.ts`, `data-api.spec.ts` and `app.config.ts`.

- `export const KEEPALIVE = new HttpContextToken<boolean>(() => false);`
- `export const keepaliveInterceptor: HttpInterceptorFn`: when `request.context.get(KEEPALIVE)` is true, it forwards `request.clone({ keepalive: true })`; otherwise it forwards the same request object.
- `DataApi.runCommand(command, idempotencyKey, options?: { keepalive?: boolean })` passes `new HttpContext().set(KEEPALIVE, true)` as `dataRunCommand`'s fourth argument when `options?.keepalive`. Otherwise it passes no context.
- `app.config.ts`: `withInterceptors([unauthorizedInterceptor, keepaliveInterceptor])`.

**Tests.**
- `keepalive.spec.ts`, with `provideHttpClient(withInterceptors([keepaliveInterceptor]))` and `provideHttpClientTesting()`: a request marked with `KEEPALIVE` arrives with `keepalive === true`, and an unmarked one with `false`.
- `data-api.spec.ts` gains: `runCommand(cmd, 'k', { keepalive: true })` sends a POST to `/v1/commands` whose `context.get(KEEPALIVE)` is true, and is false without options.

### Unit 7: `DoneUndo`

Owns the new `core/data/done-undo.ts` and `done-undo.spec.ts`, and adds `DoneUndo` to `ShellLayout`'s providers.

**New types,** in `done-undo.ts`:
- `enum DoneOrigin { Button = 'button', Swipe = 'swipe' }`.
- `enum PauseReason { Pointer = 'pointer', Focus = 'focus' }`.
- `const UNDO_WINDOW_MS = 5_000`.
- `interface PendingDone { readonly taskId: string; readonly title: string; readonly origin: DoneOrigin }`.
- `interface DoneFailure { readonly taskId: string; readonly title: string; readonly message: string; readonly canRetry: boolean; readonly closedElsewhere: boolean }`.
- `interface DoneNotice { readonly text: string; readonly seq: number }`.
- `interface DoneUndone { readonly taskId: string; readonly seq: number }`.
- `@Service({ autoProvided: false }) class DoneUndo` with:
  - the signals `pending`, `failure`, `notice` and `undone`, each null at first, and `focusRequest: Signal<number>`, which starts at 0;
  - `complete(task: Task, origin: DoneOrigin): void`, `undo(): void`, `flush(): Promise<void>`, `retry(): void`, `dismiss(): void`, `pause(reason: PauseReason): void`, `resume(reason: PauseReason): void` and `requestFocus(): void`.

It injects `DataStore`, `DataApi`, `CommandAttempts`, `Haptics` and `DOCUMENT`. It listens for `visibilitychange` on the document and `pagehide` on the window. Through `DestroyRef` it removes both listeners, clears its timer, and sends a Done that is still held at once through `DataApi.runCommand(command, key, { keepalive: true })`, then releases it. The shell can be destroyed while the person stays signed in (`recovered`, behind `signedInGuard`, sits outside the `ShellLayout` route, `app.routes.ts:31-36` and `:37-39`), and `DataStore` is a root service (`data-store.ts:69-70`), so a hold left behind would hide the Task until `stop()` and the Done would never be sent. The outcome of that send is not shown, because the bar is gone. The timer is `setTimeout`, and pausing keeps the remaining time from `Date.now()`.

**The spec** uses `TestBed.configureTestingModule({ providers: [DoneUndo, CommandAttempts, fakes] })`, `TestBed.inject(DoneUndo)`, `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync`, with no fixture. `fixture.whenStable()` hangs under fake timers. The fakes:
- `DataStore`: `hold`, `release` and a deferred `send`;
- `DataApi`: a deferred `runCommand`;
- `Ids`: `key-1`, `key-2`, and so on;
- `Haptics`: `tick`.

A is `{ id: 'a', title: 'Pay the invoice' }` and B is `{ id: 'b', title: 'Call Marit' }`. The cases:
1. `complete(A, Button)` calls `hold` with `{ _tag: CompleteTask, taskId: 'a', expect: { status: Open } }` and `'key-1'`. `pending()` is `{ taskId: 'a', title: 'Pay the invoice', origin: 'button' }`. `tick` is called once, `notice().text` is `“Pay the invoice” is Done.`, and `send` is not called.
2. `complete(A, Swipe)` does not call `tick`.
3. `complete(A, Button)` twice holds once.
4. After 4_999 ms `send` is not called. After 1 more ms it is called once with the command and `'key-1'`, and `pending()` is null.
5. `undo()` at 2_000 ms calls `release('key-1')` and sets `pending()` to null and `undone()` to `{ taskId: 'a', seq: 1 }`. After 10_000 ms more, `send` has not been called.
6. Pausing:
   - `pause(Pointer)` at 1_000 ms, then 10_000 ms: no send. `resume(Pointer)`, then 3_999 ms: no send. 1 more ms: sent.
   - `pause(Pointer)` and `pause(Focus)`, then `resume(Pointer)`: still paused.
7. `complete(A)`, then `complete(B)` at 1_000 ms: `send` is called with A's command and `'key-1'` at once. `hold` is called with B's command and `'key-2'`. B is sent at 6_000 ms, not 5_000.
8. Outcomes, after the window ends and `send` resolves:
   - Applied: `release` is not called, and `failure()` and `notice()` stay as they were.
   - Failed `{ status: 0 }`: `release('key-1')` is called. `failure()` is `{ taskId: 'a', title: 'Pay the invoice', message: 'ASYS cannot reach the server. Try again.', canRetry: true, closedElsewhere: false }`. It is still set after 60_000 ms. `notice().text` is `“Pay the invoice” is not Done. ASYS cannot reach the server. Try again.`.
   - After Failed, `retry()` holds again with `'key-1'` and shows `pending()` again with a fresh 5_000 ms window. `failure()` is null.
   - KeyReused: `taskId: 'a'`, `canRetry: true`, and `retry()` holds with `'key-2'`.
   - Rejected NotFound: `taskId: 'a'`, `message: 'That Task or Area no longer exists.'` and `canRetry: false`.
   - NotApplicable: `taskId: 'a'`, `closedElsewhere: true`, `canRetry: false`, and `message` and `notice().text` are both the Review-item sentence.
   - SignedOut: `release` is called, and `failure()` and the notice are unchanged.
   - `dismiss()` sets `failure()` to null, and so does a new `complete(B)` while a failure shows.
9. A failure arriving while B is held: B's timer does not run until `dismiss()`. Then it runs for the time it had left.
10. Hidden page: with A held, setting `document.visibilityState` to `'hidden'` and dispatching `visibilitychange` calls `DataApi.runCommand` once with the command, `'key-1'` and `{ keepalive: true }`. `DataStore.send` is not called, and `pending()` is null. A following `pagehide` sends nothing more. A Failed answer releases the Task and shows the failure.
11. `pagehide` alone does the same. A hidden page with nothing held sends nothing.
12. `flush()` with A held calls `send` at once and resolves after the outcome is handled. `flush()` with nothing held resolves at once.
13. `requestFocus()` raises `focusRequest()` by 1.
14. After `TestBed.resetTestingModule()`, `visibilitychange` sends nothing.
15. With A held, `TestBed.resetTestingModule()` calls `DataApi.runCommand` exactly once with the command, `'key-1'` and `{ keepalive: true }`, and calls `release('key-1')` exactly once. With nothing held it sends nothing.

`document.visibilityState` is patched with `Object.defineProperty` and undone with `Reflect.deleteProperty` in `afterEach`, as the existing specs do.

### Unit 8: the Undo bar and the shell

Owns the new `ui/undo-bar/undo-bar.ts` and `undo-bar.spec.ts`, `layout/shell-layout.ts` and its spec, `features/account/account.ts`, and the new `features/account/account.spec.ts`.

**`UndoBar`** is presentational, with `ViewEncapsulation.None` and `host: { class: 'asys-undobar' }`:
- `enum UndoBarVariant { Done = 'done', Failed = 'failed', Notice = 'notice' }`;
- inputs: `variant`, `title = input<string>('')`, `detail = input<string | null>(null)` and `canRetry = input(false)`;
- outputs: `undo`, `retry`, `dismiss`, `escape`, `pointerInside = output<boolean>()` and `focusInside = output<boolean>()`;
- the method `focusAction(): void`, which focuses the first button.

**Markup.**
- Done: `<p class="asys-undobar__text">`, holding the check SVG (`aria-hidden="true"`), `<span>Done</span>` and `<span class="asys-undobar__title">`, then `<button asys-button class="asys-undobar__action" [variant]="Variants.Quiet">Undo</button>`, with `protected readonly Variants = ButtonVariant`.
- Failed: `“<title>” is not Done.`, then the detail, then Try again (Secondary, the default variant, only when `canRetry`) and Dismiss (`[variant]="Variants.Quiet"`).
- Notice: the detail and Dismiss (Quiet).

**Behaviour.**
- The host's `pointerenter` and `pointerleave` emit `pointerInside` true and false, and `focusin` and `focusout` (leaving the host) emit `focusInside`.
- Escape inside the host emits `escape`.
- A `document` `keydown` of `z` with `ctrlKey` or `metaKey`, no `shiftKey`, in the Done variant, with a target that is not editable: `preventDefault()` and emit `undo`. Over an `<input>` it emits nothing.
- Styles use tokens only: `surface`, a 1px `line` top border, `space-2` and `space-4` padding, `ink-muted` for the check and Done. The title is on one line with an ellipsis.

**Shell.**
- The template adds, after `</main>`:
  - `<p class="asys-visually-hidden shell__status" role="status">{{ statusText() }}</p>`, always rendered;
  - `@if (undoView(); as v) { <asys-undo-bar class="shell__undo" animate.enter="asys-rise" (animate.leave)="leave($event)" ... /> }`, with unit 4's marked leave.
- `undoView` is computed from `doneUndo.failure()` first, then `doneUndo.pending()`.
- The bar's outputs call `undo`, `retry` and `dismiss`, and `pause` or `resume` with `PauseReason.Pointer` or `PauseReason.Focus`. `escape` calls `focusMain()`.
- An effect on `doneUndo.notice()` sets `statusText` to `''`, then to the text in `afterNextRender`.
- An effect on `doneUndo.focusRequest()` (above 0) calls `focusAction()` after the next render.
- After an Undo (an effect on `undone()`), the shell focuses the restored title after the next render (decision 8).
- Styles:
  - `:host { --shell-nav-height: 56px; --shell-undo-height: 0px; }`.
  - The three `.shell__page` paddings add `var(--shell-undo-height)`.
  - `.shell__capture` and `.shell__quickadd` read `calc(var(--shell-nav-height) + var(--shell-undo-height) + ...)` in place of the literal 56px. `.shell__page--pill` keeps the pill's own 56px.
  - `.shell__undo { position: fixed; inset-inline: 0; bottom: calc(var(--shell-nav-height) + env(safe-area-inset-bottom)); display: block; }`. It sets no `view-transition-name`: plan 1's `styles.css` rule on `.asys-undobar` names the same host, and view-transition CSS lives only in `styles.css`.
  - `:host-context([data-theme='drive']) .shell__undo { bottom: env(safe-area-inset-bottom); }`. Emulated encapsulation scopes every compound selector, so a plain `[data-theme='drive']` ancestor would never match.
- The guarded `ResizeObserver` watches the bar's host while it exists and sets `--shell-undo-height` on the shell host to its border-box height in px. It sets `0px` when the bar goes.

**Account.** `signOut()` awaits `doneUndo.flush()`, then `captureQueue.drain()`, then calls `authApi.signOut()`.

**Tests.**
- `undo-bar.spec.ts` uses a `Host`, as `ui` specs do, and covers the host class `asys-undobar`, each variant's text and buttons, Undo and Dismiss carrying `asys-button--quiet` and Try again not, each output, Escape, and Ctrl+Z (emits) versus Ctrl+Z on an input (does not).
- `shell-layout.spec.ts` overrides `DoneUndo` with a fake through `TestBed.overrideProvider`, which also replaces a component-level provider. The fake has signals for `pending`, `failure`, `notice`, `undone` and `focusRequest`, and `vi.fn` methods. Today every child route renders `Stub` with an empty template (`shell-layout.spec.ts:13-14`), so the `/now` child gets a new `NowStub` whose template is `<h1 tabindex="-1">Now</h1>` plus whatever titles a case puts in a signal. Its `afterEach` (`:156`) gains `vi.unstubAllGlobals()`, because specs share one jsdom (`isolate: false`). New cases:
  - the status region exists, empty, before any Done;
  - a notice appears in it, and an identical second notice empties it and fills it again;
  - `pending` set shows `.asys-undobar` with `Pay the invoice` and Undo, and clicking Undo calls `undo`;
  - a `failure` shows the failed layout in place of a pending Done;
  - `focusRequest` moves focus to Undo, and Escape moves it to `NowStub`'s h1 when no `[data-task-id]` exists;
  - with `NowStub` holding `<span data-task-id="b" tabindex="-1">`, Escape focuses it;
  - with `NowStub` holding `<div data-leaving><span data-task-id="a" tabindex="-1"></span></div>` before `<span data-task-id="b" tabindex="-1">`, Escape focuses `b`, not the leaving `a`;
  - with `ResizeObserver` stubbed by `vi.stubGlobal` to report 64px, the host style has `--shell-undo-height: 64px`, and `0px` after the bar goes.
- `account.spec.ts` is new, with fakes for `AuthApi` (`passkeys` resolves an empty list, `signOut` resolves Ok), `PasskeyCeremony`, `AppUpdate`, `DataStore`, `Clock`, `DeviceZone`, `Session`, `DoneUndo` and `CaptureQueue`. Clicking Sign out calls `flush`, then `drain`, then `signOut`, in that order (`invocationCallOrder`). While `flush` is pending, `signOut` has not been called.

### Unit 9: Now's sequence and the editor Done

Owns `features/now/now.ts` and its spec, `ui/top-pick/top-pick.ts` and its spec, the new `features/now/row-motion.ts` and `row-motion.spec.ts`, and `features/task/task-editor.ts` and its spec.

**TopPick.**
- New input `completed = input<boolean>(false)`. When true, `.asys-top-pick__actions` shows `<p class="asys-top-pick__done">` with the check SVG and "Done" in `ink-muted`, in place of the buttons. The check's path has `pathLength="1"`, `stroke-dasharray: 1` and `animation: asys-check-draw var(--duration-quick) var(--ease-out)` from `stroke-dashoffset: 1`.
- `done` becomes `output<Activation>()`, emitting `activationOf(event)` (`ui/activation`: `{ keyboard: event.detail === 0 }`).
- Nothing wraps the article's content, so `<ng-content />` stays its last child.

**Now.**
- It injects `DoneUndo` and `Motion`.
- `leaving = signal<RankedTask | null>(null)` and `displayed = computed(() => this.leaving() ?? this.dataStore.now()?.ranked[0] ?? null)`.
- The template uses `@if (displayed(); as top)` for the card, with `[attr.inert]` and `[attr.data-leaving]` set while `leaving()` is non-null, and `[completed]="leaving() !== null"`.
- The list iterates `now.ranked` without `displayed()`'s id. Each `<li>` has `(animate.leave)="collapse($event)"` and `(animate.enter)="expand($event, item.task.id)"`.

`done(task: Task, origin = DoneOrigin.Button, keyboard = false)`:
1. A call for the Task that is already held (`doneUndo.pending()?.taskId === task.id`), or a call while `leaving()` holds the same Task, returns at once.
2. A running exit ends at once: a sequence number makes its later steps do nothing.
3. Now's own status line clears.
4. For `displayed()`'s Task with `Button`:
   - `leaving.set(displayed())`, then `doneUndo.complete(task, origin)`, and `doneUndo.requestFocus()` when `keyboard`;
   - it awaits `Motion.play(article, [{ translate: '0 0', opacity: 1 }, { translate: '100% 0', opacity: 0 }], { duration: MotionDuration.Quick, easing: MotionEasing.In, delay: 100 })`;
   - in the same microtask, it sets the article's inline `opacity: 0` and `leaving.set(null)`;
   - after the next render, it plays the rise (`[{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }]`, `MotionDuration.Moderate`, `MotionEasing.Out`), removes the inline opacity, and focuses the title, or the h1 when `displayed()` is null, unless `keyboard`.
5. For `displayed()`'s Task with `Swipe`: `doneUndo.complete`, then the rise and the focus as above, with no `leaving` phase.
6. For any other ranked Task: `doneUndo.complete`. The row's `collapse` runs, focus is not moved, and the card is unchanged.
7. After each `await` it checks `destroyRef.destroyed` and the sequence number.

**Undo.**
- An effect on `doneUndo.undone()` cannot read the displayed id from before the change: `undo()` releases the hold before it sets `undone`, so `dataStore.now()` and `displayed()` already show the restored Task.
- So `done()` records the row to expand at Done time, in a private `Map<string, string>` keyed by the held Task's id. Right after `doneUndo.complete`, for the top pick it stores `dataStore.now()?.ranked[0]?.task.id` (the promoted Task, whose row collapses). For any other ranked Task it stores that Task's own id (its row comes back). Nothing is stored when the value is undefined.
- The effect on `undone()` sets `displaced` from the map entry for `undone().taskId` and deletes the entry. After the next render it plays the rise on the card when the restored Task is displayed.
- `expand` plays only for the row whose id is `displaced`. Every other entering row calls nothing and returns.

**`row-motion.ts`.**
- `collapseRow(motion: Motion, event: AnimationCallbackEvent): Promise<void>`:
  - it sets `data-leaving` on `event.target` and reads its `offsetHeight` as h;
  - it plays `[{ height: h + 'px', overflow: 'clip' }, { height: '0px', overflow: 'clip' }]` with `{ duration: MotionDuration.Moderate, easing: MotionEasing.Out }`;
  - it calls `event.animationComplete()` in `finally`.
- `expandRow(motion: Motion, event: AnimationCallbackEvent): Promise<void>` plays from `0px` to h with the same timing.
- jsdom never calls the template's animate functions, so `row-motion.spec.ts` tests these helpers directly, with a fake event. It checks that `animationComplete` is called once when `play` resolves and once when it rejects.

**Editor.**
- `done(event)` reads `keyboard` from `activationOf(event)` (`event.detail === 0`). It returns when `actionsBusy()` or the Task is missing.
- Otherwise it calls `clearMessages()`, `leaving.set(true)`, `doneUndo.complete(task, DoneOrigin.Button)`, `doneUndo.requestFocus()` when `keyboard`, then `leave()`.
- `drop()` keeps `leaveWith`.

**Spec fakes.**
- `now.spec.ts` and `task-editor.spec.ts` provide a fake `DoneUndo` whose `complete` is a `vi.fn` that removes the Task from the spec's `state` signal, as a hold would. Its signals start null.
- Both provide the `Motion` fake. Unless a case needs the exit phase, `allowed` is false and `play` resolves at once.
- `HTMLElement.click()` sends `detail: 0`, which counts as keyboard. So a pointer press in these specs dispatches `new MouseEvent('click', { bubbles: true, detail: 1 })` through a new `press(el)` helper.

**Tests it legitimately breaks,** in `features/now/now.spec.ts`, the `Done` describe at `:685-839`:
- `:692-700`: `press(Done)` calls `complete` once with the `invoice` Task and `DoneOrigin.Button`. `send` is not called.
- `:702-709`: with `play` pending, the card shows `.asys-top-pick__done` and no Done button, and `complete` was called once.
- `:711-725`: after the exit, Now's status line is `''`. The title is `Call the dentist` and has focus. The announcement is the shell's, tested in unit 8.
- `:727-738`: the fixture is destroyed while `play` is pending, and resolving it throws nothing and moves no focus.
- `:740-753`: with only INVOICE ranked, while `play` is pending the card still shows and "Nothing to do right now." is absent. After it resolves, `topPick()` is null, the text is shown, and the h1 has focus.
- `:755-767`: becomes "Done clears an earlier Log progress message". After a Failed Log progress, `press(Done)` empties the status line.
- `:769-780`: becomes "a released Task returns as the top pick". The fake restores INVOICE in `state`, the title is `Pay the invoice` again, Done is enabled, and focus is not moved. The Failed copy moves to `done-undo.spec.ts` case 8.
- `:782-792`, `:794-804`, `:806-828` and `:830-838` move to `done-undo.spec.ts` cases 8 (the same key after Failed, a new key after any other outcome, the outcome copy, SignedOut).

Also in `now.spec.ts`:
- `:995-1009`: becomes "Done while the Log progress form is open closes the form". After `press(Log progress)` and `press(Done)`, `complete` is called once, `form()` is null after the exit, and `send` is never called.
- New cases:
  - a keyboard Done (`.click()`) calls `requestFocus` and leaves focus off the new title;
  - the leaving card has `inert` and `data-leaving` while `play` is pending;
  - `undone` set for INVOICE after a Done plays the rise on the card (the `Motion` fake records the element);
  - after a Done on INVOICE, with the fake restoring INVOICE in `state` and then setting `undone` for it, the spec calls Now's `expand` handler directly with a fake `AnimationCallbackEvent` for each ranked row id, because jsdom never calls the template's animate functions. The `Motion` fake records a play only for the row of `Call the dentist`, the Task the Done promoted.
- `:434-440`: still passes. It also asserts `complete` was not called.

In `ui/top-pick/top-pick.spec.ts`:
- `:96-113`: still passes. It also asserts `{ keyboard: true }` for `.click()` and `{ keyboard: false }` for a `detail: 1` click.
- `:161-170`: unchanged and still green, because no wrapper is added.
- New cases cover `completed`.

In `features/task/task-editor.spec.ts`:
- `:834-855`: `press(Done)` calls `complete` with `t1` (`Call Marit`) and `Button`, and `send` is not called. `navigate` is called exactly once with `('/now', { replaceUrl: true })` at once. After `update(withoutTask(BASE, 't1'))`, the heading is still `Call Marit` and the text lacks `no longer open`.
- `:857-866`: becomes Drop only. Drop, then confirm, then `update(withoutTask)`, then `finish(0, NOT_APPLICABLE)` shows `This Task is no longer open.` and the outcome message.
- `:870-884`: `complete` with the Task and `Button`, `send` not called, `navigate` once with `('/now', { replaceUrl: true })` and `back` not called, all before any send settles.
- `:886-894`: `back` is called once at once, and `navigate` is not called.
- `:896-910`: becomes "Done disables Done, Drop and Log progress and shows no message". The Failed path is `done-undo.spec.ts`'s.
- `:1110-1121`: becomes "Done navigates once even when destroyed right after". `navigate` is called once, `back` is not, and `handleError` is not called.
- `:1123-1136`: as above with history: `back` once, `navigate` not.
- `:912-953` (awaiting the server, Drop) still pass.

### Unit 10: e2e

Owns `apps/pwa-e2e/src/now.spec.ts`, `two-tabs.spec.ts`, `capture.spec.ts`, `phone-width.spec.ts`, plan 1's `view-transitions.spec.ts` (one added case) and the new `motion-off.spec.ts`.

**The clock recipe.**
- `await page.clock.install()`, then `await page.reload()`. Install before the page loads its timers. The clock is context-wide, and time keeps flowing.
- After a Done, `const sent = page.waitForResponse('**/v1/commands')`, then `await page.clock.fastForward(5_000)`, then `await sent`.
- `fastForward` fires each due timer at most once, and the store's 15 s poll (`data-store.ts:37`) is not reached by one jump.

**`now.spec.ts`:**
- `:111` becomes `await expect(page.locator('.shell__status')).toHaveText('“Renew the permit” is Done.')`. The no-gap watch (`:86-114`) is unchanged and must stay green.
- New "Undo brings the Task back": the clock recipe, then Done, then click Undo in `.asys-undobar`. The top pick title is `Renew the permit` again. After `fastForward(5_000)` no POST to `/v1/commands` was made (count requests with `page.on('request')`), and `snapshot(page).tasks` still holds the Task.
- New "Done is sent when the window ends": the clock recipe, then Done, then the window's end. The response is 200, and `snapshot(page).tasks` lacks the Task.
- New "Done survives an immediate reload": Done, then `page.reload()` at once. `expect.poll` over `snapshot(page)` finds the Task gone, and the top pick after the reload is `Plan the year`.
- New "Enter on Done moves focus to Undo, and Escape to the next title": the Undo button is focused, then the top pick title `Plan the year`.

**`two-tabs.spec.ts:28-43`:**
- `page.clock.install()` goes before the reload at `:11`.
- `:29` reads `.shell__status`.
- Before page2's Done, page's Done is sent with the clock recipe. After page2's Done, `fastForward(5_000)` again before `await commandAnswer`. `:43` still expects `NotApplicable`.
- page2's bar then shows the Review-item sentence.

**`capture.spec.ts:11-21`:** unchanged. The copy is kept, and the field now empties at submit, which `toHaveValue('')` already allows. New cases:
- Focus stays in the field: type a title, click Add with the mouse, then `await expect(page.getByLabel('Capture a Task')).toBeFocused()`.
- A failed capture: `page.route('**/v1/commands', (r) => r.abort(), { times: 1 })`, then Add. The row in the bar reads `Not captured: “Water the plants”`. Close the bar (Close or Escape). The pill is rendered only while the bar is closed (`shell-layout.ts:47-58`), and its accessible name now contains `1 not captured`. Reopen the bar and click Try again. The Inbox badge reads 1, the row is gone, and after closing the bar the pill's accessible name is exactly `Capture`.

**`phone-width.spec.ts`:**
- `expectClearOf` first waits for `document.getAnimations().length === 0` with `expect.poll`.
- `:133-136` is unchanged: the copy is kept.
- A new step after it closes quick add, then presses Enter on the top pick's Done. Focus lands on Undo, which pauses the timer. Then `expectClearOf(lastRow, [undoBar, pill, nav])`.
- Then it hovers the Undo bar (the pointer keeps it paused) and opens quick add with `pill.press('Enter')`, so the pointer stays on the bar. Then `expectClearOf(lastRow, [undoBar, quickAdd, nav])`.

**`view-transitions.spec.ts`** (plan 1's file) gains the case plan 1 hands over, "captures the Undo bar on the editor's Done Pop": seed one Task, reload, open it, click the editor's Done (exact name). The last record is `pop`, and `shell-undo` appears exactly once in its `newNames`.

**`motion-off.spec.ts`,** with `test.use({ reducedMotion: 'reduce' })`. After each step it reads at once `document.getAnimations().length` (expected 0) and `document.activeViewTransition ?? null` (expected null):
- a tab change from Now to Today;
- opening quick add (the bar enters and the pill leaves);
- closing quick add (the pill enters and the bar leaves);
- a capture: the status `Captured. It waits in the Inbox.` and the badge still appear;
- a Done: `.shell__status` and the Undo bar still appear.

A `test.describe` with `reducedMotion: 'no-preference'` repeats the Done and expects `getAnimations().length > 0`, so the zero above means something.

**Check:** `pnpm exec nx e2e pwa-e2e`, then `pnpm exec nx run pwa-e2e:e2e-image` with the image stack running. The full suite is green on both, including `editor.spec.ts:81-84`, whose Done now holds and pops at once.

### Unit 11: budget

`pnpm exec nx build pwa` reports no budget warning: initial under the 500 kB warning, and each component style under 4 kB (`apps/pwa/project.json:31-41`).
- The initial total was about 481 kB from a build older than HEAD (not verified for HEAD). Record the measured total and the `undo-bar`, `quick-add` and `top-pick` style sizes in this plan's "Built on" section.
- If the warning trips, move the Undo bar's and rows' rules into `styles.css` only if several controls share them. Otherwise trim, and say so.

### Unit 12: docs

- **`docs/mvp-plan.md`:**
  - Stage 6's "Undo of queued commands" gains "(a narrow Undo for Done, held in memory for 5 seconds, was pulled ahead on 2026-10-05; see `capture-and-done-animations-plan.md`)".
  - Slice 4's offline paragraph gains: "Its outbox replaces the in-memory held Done (`DoneUndo`) and `CaptureQueue` pulled ahead on 2026-10-05, and its Queued chip replaces their Not captured rows."
  - In the same paragraph, `mvp-plan.md:88`'s "There is no background sync and no Undo of queued commands yet." becomes "There is no background sync, and Undo covers only a Done still in its Undo window.", so slice 4 does not read as removing Undo for Done.
  - The glossary table's MVP row gains Undo.
- **`CONTEXT.md`** gains, under Lifecycle after Done, before any code uses the term:
  > **Undo**:
  > Cancelling a change you just made while ASYS still holds it on the phone, before it is sent. For now only a Done can be undone, during the few seconds its Undo bar shows. Once sent, a change is not undone.
  > _Avoid_: Take back (a Check-in Outcome), reopen, revert
- **`.agents/skills/building-pwa-ui/SKILL.md`:**
  - The layer table names `DoneUndo` and `CaptureQueue` (shell-provided) and `Motion` and `Haptics` (seams).
  - Styling names the motion tokens (`--duration-quick`, `--duration-moderate`, `--ease-out`, `--ease-in`, `--ease-emphasized`) and the shared `asys-rise`, `asys-appear` and `asys-pop`.
  - Line 39 says new code reads `--shell-nav-height`, and that the Undo bar is a fourth place that repeats the nav offset, through `--shell-undo-height`.
  - "Sending from a screen" says a Done goes through `DoneUndo.complete` and quick add through `CaptureQueue.submit`, and that Add is `aria-disabled`, never `disabled`.
  - "There is no offline queue yet" adds: "except the in-memory held Done and `CaptureQueue`, which do not survive a reload".
  - "Tests and checks" says `HTMLElement.click()` counts as keyboard (`detail: 0`).
- **`.agents/skills/writing-e2e-specs/SKILL.md`:**
  - "Writing a spec" gains the clock recipe, and says the Done announcement is in `.shell__status`.
  - Common mistakes gains "Expecting a Done on the server at once" (it is held for 5 s; use the clock recipe) and "Measuring a box mid-animation" (wait for `document.getAnimations().length === 0`).
- **The design-system note** is an addendum handed to the maintainer with plan 1's amendment, and applied only with the go-ahead: "Not captured rows are a temporary inline surface for a capture that failed while the app is open. Slice 4's outbox replaces them with the Queued chip, and failed replays still become Review items. The Undo bar shows the Task title on one line with an ellipsis, an exception to the two-line rule for Task titles in Now, because the bar is chrome and the full title is announced in the status region." Plan 1's "Undo bar" amendment entry states the same exception.
- `docs/slice-1-plan.md` stays as written.

**Check:** `node scripts/check-spdx.mts`, `pnpm exec nx format:check --all`, and a grep for the em-dash character (U+2014) over the changed files finds nothing.

## Built on 2026-10-06

All twelve units were built in order, with units 1 and 2 built as one and units 3 and 4 built as one. Each unit's source and its tests were written separately from one contract, every new test was seen to fail on an assertion by breaking what it covers, and each unit was reviewed adversarially before the next began.

### Departures from the plan

- **Units 1 and 2, and units 3 and 4, were built together.** Removing QuickAdd's `busy` input breaks the shell's `[busy]` binding, which unit 2 owns. Units 3 and 4 both change `shell-layout.ts` and `styles.css`.
- **The Inbox route is lazy-loaded.** After unit 5 the initial bundle reached 505.92 kB, over the 500 kB warning. On 2026-10-06 the maintainer chose to load Inbox lazily, as slice 1's known limits foresaw. `/inbox` now has a `loadComponent`, and its 18.65 kB chunk left the initial bundle.
- **`held-state.ts` calls `completeTask`, not `applyCommand`.** A hold is always a CompleteTask, and `applyCommand`'s switch pulled every domain command handler into the eager bundle (6.9 kB). The result is the same.
- **Try again and Discard move focus to the field** before their row goes, so focus never falls to the body and the keyboard stays up.
- **The pill's label carries its own trailing space** in an interpolation (`'Capture '` while rows exist), so its accessible name is exactly "Capture 1 not captured" whatever the formatter does to the template.
- **Pause reasons are cleared whenever no bar shows,** and `pause` is ignored then. A bar that is removed never reports `pointerleave` or `focusout`, so a stale reason would freeze the next window.
- **The status region keys each notice by its `seq`** (`@for (notice of notices(); track notice.seq)`), so every notice is a new node and an identical second one is read again. Emptying the region and refilling it in `afterNextRender` happens inside one synchronous change-detection pass, so the accessibility tree would never see the empty state.
- **The shell guards focus in the Undo bar.** Whenever the bar's layout changes or the bar goes while focus is in it, the shell checks after the render: focus that fell to the body (or onto the leaving bar) moves to the bar's first button while a bar shows, otherwise to the page as Escape does, and a Focus pause that no `focusout` will end is resumed. Dismiss and Try again emit `activationOf(event)` (`{ keyboard: event.detail === 0 }`), and after a pointer activation the guard never moves focus, because Chrome focuses a tapped button and a move to the first title would scroll a long list to the top. A failure that replaces a held Done while keyboard focus is on Undo therefore lands on the failure's first button.
- **A ranked row that collapses while it holds focus hands focus to the top pick,** which shows the same Task. Escape in the bar during a Done's exit focuses the promoted row just before it leaves.
- **The Undo bar's host keeps its own `display: flex`.** `.shell__undo` sets no `display`, because its emulated selector would win over the bar's and stack Undo under the text. The Done text has `flex: 1 1 0`, so a long title ellipsises instead of pushing Undo to a second line.
- **The Inbox badge pops only on a rise between two known counts.** `BottomNav.inboxCount` is `number | null`, and the shell passes null until the store has state, so the first count after load never pops, and the badge carries `animate.enter` only once the counter has moved. The template reads the counter with `@let` above the badge's `@if`, so the lazy `linkedSignal` also sees a count of 0 and a capture into an empty Inbox pops.
- **Now ends a running exit before it takes its sequence number,** so a Done that interrupts an exit keeps its own later steps. The `undone` effect ignores a value from before Now was created, and the exit's 100 ms stagger is the named constant `EXIT_DELAY_MS`.
- **`shell-layout.spec.ts` replaces `DoneUndo` through `TestBed.overrideComponent`,** because `TestBed.overrideProvider` does not reach a component-level provider (fact 11).
- **Component files.** The `angular-component-files` rule arrived during the build. The eight components this work changed that have 100 lines or more (the bottom nav, quick add, the top pick, the Undo bar, the shell, Now, Account and the editor) moved their templates to `<name>.component.html` and their styles to `<name>.css`, unchanged apart from indentation. The bottom nav moved only its styles.
- **e2e.** One `page.clock.install()` covers both pages of two-tabs, which share a browser context. "Done survives an immediate reload" reloads a second time when the reloaded page still shows the Task, because the keepalive POST and the new page's snapshot can race; repeated runs hit that once. `motion-off.spec.ts` counts the view transitions that ran (their `ready` resolved), not the calls, because Angular starts one on every navigation and the handler skips it.

### Verification (2026-10-06)

- **Proving the tests can fail.** Each unit's planned behaviours were broken one at a time, and the new tests failed on assertions: nine for units 1 and 2 (among them the aria-disabled Add, the mousedown guard, ordered sends, the same key after Failed, a fresh command after KeyReused and `drain`), eight for units 3 and 4 (among them `tabInView`'s edges, the ghost's removal after a rejected play, the badge re-creation and the marked leave), seven for unit 5, four for unit 6, sixteen for unit 7 (with listener removal and the pause clearing on a hidden page and on `flush`), nine for unit 8 and fourteen for unit 9 (with the exit takeover). The review additions failed the same way: the focus return in quick add, the ghost's start box, the keyed status node, the focus guard (six behaviours, among them the pointer mark, the resumed Focus pause and the effect order after an Undo) and the collapsing row's focus. The badge's first-load pop is invisible to jsdom, so `capture.spec.ts` records each new badge's animations a frame after it is inserted: with the badge popping on every creation it failed on `[1]` against `[0]`.
- **Gate.** `nx run-many -t lint typecheck build test --skip-nx-cache` passed for all seven projects: 1924 PWA tests in 66 files before the final review fixes and 1957 after them, 502 server, 676 domain (90 todo), 260 contract and 158 effect-passkeys. `tsc -p scripts/tsconfig.json`, `nx run server:openapi`, `nx format:check --all`, `check-spdx`, `check-licenses` and `palettes --check` passed. `reuse lint` was not available locally; CI runs it. The literal-timing grep finds nothing in `apps/pwa/src`.
- **Bundle (unit 11).** The initial total went from 489.98 kB at the base to 493.92 kB after units 1 and 2, 497.37 kB after units 3 and 4, and 499.04 kB after unit 5. With Inbox lazy it fell to 467.35 kB, then rose to 467.51 kB after unit 6, 471.87 kB after unit 7, 476.12 kB after unit 8 480.21 kB after unit 9 and 481.58 kB after the final review fixes (130.72 kB transferred), with no budget warning. Minified with esbuild, the new component styles are 0.88 kB for the Undo bar, 1.55 kB for quick add, 1.56 kB for the top pick and 1.33 kB for the shell, all under the 4 kB warning.
- **End-to-end.** The dev-stack suite passed with 39 tests after the final review fixes (38 before the badge check), and `motion-off.spec.ts` passed ten runs in a row. The image suite, run on an image rebuilt after those fixes, passed with 41 tests, the image-only specs included.

### Facts checked while building

1. to 6. On the device: open, after a deploy.
7. Not observable cheaply in the e2e. `expand` ignores every row but the displaced one either way.
8. Not measured. It needs a slowed playback or the device.
9. TalkBack: open.
10. `app.routes.spec.ts` stays green with the real `DoneUndo` and `CaptureQueue`: confirmed.
11. `TestBed.overrideProvider` does not replace `ShellLayout`'s component-level `DoneUndo`; `TestBed.overrideComponent` does.
12. `document.activeViewTransition` exists in the bundled Chromium (`typeof` is "object").
13. Not observed in the e2e.
14. A Playwright reload fires `pagehide`, then `visibilitychange` to hidden, and the server applied exactly one CompleteTask (the snapshot's `seq` rose by one). Playwright's request events never see the keepalive POST.
15. See Bundle.

### Known limits

- Facts 1 to 6, 8, 9 and 13 need the installed PWA on a phone.
- The design-system note of unit 12 waits for the maintainer's go-ahead.

## Out of scope

- **An optimistic Inbox count** for queued captures, unless fact to check 4 shows the lag.
- **Keeping captures or a held Done across a reload or a kill,** beyond the keepalive send. That is slice 4's outbox.
- **Undo for anything but Done**: Drop, Log progress, Triage and the Inbox's Drop are unchanged.
- **A ReopenTask Command.** It was offered on 2026-10-05 and declined.
- **The `/capture` share route.** It keeps its own add (`features/capture/capture.ts`).
- **Swipe** (plan 2) and **view transitions** (plan 1).
- **Sound, confetti, or a longer celebration.**
- **Growing the page padding with the Not captured rows** while quick add is open (see Risks).

## Facts checked on 2026-10-05

Installed: `@angular/core`, `@angular/common` and `@angular/router` 22.2.1, `@playwright/test` and `playwright-core` 1.63.0, `vitest` 5.0.2, `jsdom` 30.1.1.

- **The default `HttpClient` backend is fetch** (`node_modules/@angular/common/fesm2022/_module-chunk.mjs`):
  - `HttpBackend`'s root provider is `useExisting: FetchBackend` (`:1258-1275`), and `provideHttpClient` provides `HttpBackend` as `inject(FetchBackend)` (`:2046-2053`).
  - `withXhr()` is the only switch to `HttpXhrBackend` (`:2140-2145`).
  - `FetchBackend` passes `keepalive: req.keepalive` to `fetch` (`:1011`).
  - The XHR backend refuses `keepalive` with error 2813 (`validateXhrCompatibility`, `:1748-1751`).
  - `HttpRequest.clone` carries `keepalive` (`:580`), and `keepalive?: boolean` is in `types/http.d.ts:2290`.
  - `HttpClient` is `providedIn: 'root'` (`:1527-1533`).
- **Only a keepalive request outlives unload** (fetch.spec.whatwg.org, the request's keepalive flag).
- **Angular `animate.*`** (`node_modules/@angular/core`):
  - It does nothing unless `document.documentElement.getAnimations` exists (`fesm2022/_debug_node-chunk.mjs:4073`), so jsdom never runs it.
  - The function form receives `{ target: Element; animationComplete: VoidFunction }` (`types/_debug_node-chunk.d.ts:52-55`).
  - A leave function that never calls `animationComplete` is removed after `MAX_ANIMATION_TIMEOUT`, 4000 ms (`_debug_node-chunk.mjs:3956`).
  - An enter function's `animationComplete` is a no-op (`:14466-14473`).
- **The focus fix-up.** The HTML Standard's update-the-rendering steps run the focusing steps for the viewport when the focused area is no longer focusable, and its note names an element that gets disabled (html.spec.whatwg.org). Clicked buttons take focus in most browsers (MDN, `<button>`).
- **The Chromium IME Next trap** (chromium main, `content/public/android/java/src/org/chromium/content/browser/input/`, fetched 2026-10-05):
  - Without `enterkeyhint`, `ImeUtils.java:188-199` picks `IME_ACTION_NEXT` when a next focusable element exists, otherwise `GO`.
  - `ImeAdapterImpl.java:1275-1283` handles Next by moving focus, not by sending Enter.
  - `ImeUtils.java:204-223` maps `send` to `IME_ACTION_SEND`.
  - `ImeAdapterImpl.java:1265-1269` hides the keyboard only for Done with a fullscreen IME.
  - `enterkeyhint` is supported in Chrome Android 77, Firefox Android 94 and Safari iOS 13.4 (MDN browser-compat-data 8.1.4).
- **Pointer Events Level 3** (w3.org/TR/pointerevents3): cancelling a pointer or compatibility mouse input does not stop `click`. No primary source says whether it stops the focus change on touch, hence fact to check 1.
- **The keyboard covers fixed elements** under the default `interactive-widget=resizes-visual` (developer.chrome.com/blog/viewport-resize-behavior). `apps/pwa/src/index.html:8` sets no `interactive-widget`.
- **Playwright 1.63.0** (`playwright-core/types/types.d.ts`):
  - The clock is installed for the whole browser context (`:20447`).
  - `fastForward` fires due timers at most once (`:20452-20465`).
  - `install` fakes `Date`, the timers, `requestAnimationFrame` and `performance` (`:20467-20491`), and its example says `Date.now` keeps progressing as timers fire (`:20517`).
  - The docs advise installing before navigating (`:20510`).
  - `reducedMotion` is a context option.
- **jsdom 30.1.1** has no `animate`, `getAnimations`, `matchMedia`, `ResizeObserver`, `visualViewport` or `navigator.vibrate`. The PWA's Vitest runs with `isolate: false`. `fixture.whenStable()` hangs under fake timers (`docs/slice-1-plan.md:1031`).
- **Vibration** needs sticky activation. A Done is a click, so the Button Done's haptic works from the first tap. Firefox Android returns true without vibrating.
- **WCAG 2.2.1** asks that a time limit can be turned off, adjusted or extended, unless an exception applies (w3.org/WAI/WCAG22/Understanding/timing-adjustable).

### Facts to check while building

1. **On the device:** Add's `mousedown` `preventDefault()` keeps the Android keyboard up across a tap on Add. If not, use the synchronous refocus in the click handler, and record which.
2. **On the device:** Gboard's label or icon for `enterkeyhint="send"`, and that the action key submits with the keyboard staying up.
3. **On the device:** several captures in a row by the action key alone keep the keyboard up.
4. **On the device:** whether the Inbox tab is inside `visualViewport` with the keyboard up (if never, the flight only runs with the keyboard down), and whether the badge's lag after the flight is noticeable.
5. **On the device:** a held Done survives backgrounding and then a kill from the app switcher (the keepalive send on `visibilitychange`).
6. **On the device:** how the Button Done's haptic feels, between 10 and 20 ms.
7. Whether `(animate.enter)` runs for rows on Now's first render. `expand` ignores them either way.
8. No frame shows the old content at full opacity between the slide-out and the rise-in: the inline opacity is set in the microtask after `finished`.
9. Whether TalkBack's double tap gives `click` a `detail` of 0. If not, screen-reader users on touch rely on the status region and the pointer pause, and decision 8's rationale says so.
10. `app.routes.spec.ts` renders the real shell, so it builds the real `DoneUndo` (which needs `DataApi` and so `HttpClient`) and `CaptureQueue`. It is expected to stay green. If `HttpClient` cannot be built without `provideHttpClient`, override both with fakes there.
11. `TestBed.overrideProvider` replaces `ShellLayout`'s component-level `DoneUndo`.
12. `document.activeViewTransition` exists in the bundled Chromium. The spec treats `undefined` as null either way.
13. `:host-context([data-theme='drive'])` places the Undo bar at the bottom in Voice only.
14. `pagehide` and `visibilitychange` both fire on a Playwright reload, and only one command is sent.
15. The measured bundle sizes (unit 11).

## Risks

- **A held Done can be lost.** A crash or kill with no `visibilitychange` or `pagehide` loses it, and the Task is simply Open again on the next load. Slice 4's outbox closes this.
- **Only the newest Done can be undone.** A second Done sends the first at once.
- **Not captured rows are lost at sign-out.** Sign-out waits for sends in flight, not for rows the person has not retried.
- **The page padding does not grow with Not captured rows.** While quick add is open with rows, the last row of a long list can sit under them. Closing the bar uncovers it.
- **jsdom cannot see motion.** The collapse, the rise, the flight and the pop are proven only by the e2e and the device. The unit tests pin the sequencing through the `Motion` fake and the helpers.
- **The budget.** About 19 kB was left before the warning. The bar, the queue and the sequence all land in the eager shell and Now.
- **A held Task hidden while offline.** After an Applied send whose follow-up poll failed, the Task stays out of Now until a poll succeeds, where today it would show "Saved. Waiting for the server.". The send was Applied, so this is the truth.
- **WCAG 2.2.1 is met by judgement.** If an audit disagrees, the remedy is a longer window or a persistent bar, not a ReopenTask, which was declined.
