<!-- SPDX-License-Identifier: EUPL-1.2 -->
# Known limits and open work

What the built work leaves open: the known limits of each part, the checks still to do on an Android phone, what waits on the maintainer, and later work. A plan in `docs/` is removed once its work is built, its open items move here, and the plan stays in git history ([Built plans](#built-plans)). A change that fixes a limit, settles a check or does a piece of later work updates this file in the same commit.

## Known limits

### Sign-in

These four are also in ADR 0006's consequences.
- Sessions have no absolute lifetime.
- Credential changes need only a valid session; there is no step-up authentication.
- A flood of anonymous sign-in options can evict real ones within their partition, and so delay sign-ins.
- `pnpm audit` cannot see advisories for JSR packages, the SimpleWebAuthn server and browser packages included.

### The PWA shell

- A cached old PWA can talk to a newer server until Slice 4's rules-version check; the update prompt narrows this.
- Offline, the screens show "Loading…" under "ASYS cannot reach the server.", because the working set lives in memory until Slice 4 keeps it in IndexedDB; captures fail as Not captured rows. A device keeps the sign-in only once a build from 2026-10-22 on has seen it signed in, so the first launch after that update, if offline, still waits up to 10 s for `/me` before it shows anything, as does a launch on a device that was never signed in.
- A remembered launch whose session has ended (an expired cookie, a revocation from another device) shows the signed-in screens until `/me` answers 401, then goes to sign-in.
- `animate.enter` and `animate.leave` do nothing in jsdom, so the unit tests cannot show that `animation: none` removes an element at once; that is checked in a browser.
- `pwa:typecheck` is plain `tsc` and does not check templates; `pwa:build` and `pwa:test` do.
- Validating all 12 token contexts and the typography references in the token build stays open (ADR 0013).
- Safari cannot keep the `__Host-` cookie on `http://localhost` (development only), and its passkey activation timing is untested.
- The variable fonts are 126 kB together, larger than a Latin subset would be.

### The Task screens

- The copy is English only, in the domain (reason lines and display formats) and in the PWA.
- Review items can only be dismissed; applying their command again is later work.
- Cycles through closed Tasks are caught by the server only, and the editor shows its answer in the Blocked by sheet.
- Read-your-writes costs one poll round trip before a screen updates; Slice 4's outbox removes it.
- The Area editor's time inputs write `''` back into a time input whose time became partial: clearing one part of a From or To empties the whole time and shows "Enter a time". `apps/pwa-e2e/src/known-limits.spec.ts` pins it, so a fix flips that test and this bullet together.
- The Area editor keeps its inputs enabled while sending; only Save or Create is disabled. A missing Area offers "Go to Areas".
- Areas cannot be deleted, because no command exists, and Privacy gets no UI until Stage 2.
- The initial bundle is over its 650 kB warning budget (the error stays at 1 MB): it was 664 kB when the Triage card merged on 2026-10-27. About 105 kB of it is the Font Awesome Angular component and its SVG core; an Icon component that drew the same icon definitions as inline SVG measured 104.57 kB less (2026-10-09).

### Deployment

- A file-level backup of a running PostgreSQL volume is not crash-consistent; backups stay the VPS's job.
- Caddy strips incoming `traceparent`, `tracestate`, `b3` and `X-B3-*`, but containers on `edge` or `telemetry` can still reach `asys:3000` directly and set them.
- Export failures are silent (Debug level only); SigNoz itself is the check.
- `GET /v1/<unknown>` is a bodyless 404, not a JSON error, and writes no log line.
- A static file that exists but cannot be read closes the connection without a status, because `HttpStaticServer` opens it while the body streams, after the route has returned; the server keeps serving. The image's files are always readable.
- The service name `asys-postgres` must stay unique on `edge` and `telemetry`, because the app resolves it on every network it joins.
- An HTTP span's `server.address` comes from the request's Host header.
- The deploy job does not pin the VPS host key, and appleboy/ssh-action downloads drone-ssh at run time without a checksum (both accepted, as in fruiz).
- pnpm in the image is checked only by npm's registry integrity, and the image digests are updated by hand.
- `migrate` runs in one transaction without a lock, so two migrators at once are not safe; the stack runs one.
- In an Android work profile the installed PWA does not show up as a share target, while the personal profile works. Not investigated; likely causes are a work-profile install that is a home-screen shortcut rather than a WebAPK, or the profile's management policy.

### Undo, capture and motion

- A held Done lives in memory only. A crash, or a kill that fires neither `visibilitychange` nor `pagehide`, loses it, and the Task is Open again on the next load. Only the newest Done can be undone: a second Done sends the first at once. Slice 4's outbox replaces this.
- Not captured rows are in memory too, so a reload or a sign-out loses them; sign-out waits for sends in flight, not for rows nobody retried. While quick add is open with rows, the last row of a long list can sit under them, because the page padding does not grow with them.
- After an Applied Done whose follow-up poll failed, the Task stays out of Now until a poll succeeds.
- The 5-second Undo window meets WCAG 2.2.1 (Timing Adjustable) by judgement, not by an audit: focus in the bar or a pointer resting on it pauses the window. If an audit disagrees, the remedy is a longer window or a persistent bar. A ReopenTask Command was offered on 2026-10-05 and declined.
- In dev mode every skipped view transition (None, reduced motion, Voice only, an interrupted one) logs a rejected `ready` with `console.error`. The production build logs nothing.
- A poll that re-ranks Now during a swipe springs the swipe back, or resets it once its exit ends, and nothing tells the person why.
- The left swipe's reveal reads "Needs an Estimate" for an Estimate of 1 min as well as for a missing one.
- The e2e suites run Chromium only, so view transitions and the swipe are unchecked on Safari and iOS, `overflow-clip-margin` for a focused row's ring included. iOS has no `navigator.vibrate`, so it gets no haptics.

### The Current Area

- A Work pick at 23:50 lasts 10 minutes, and work past midnight needs a fresh pick. A pick on a day the clocks change can end up to an hour off when the picked Area's hours start in the skipped or repeated hour (02:00 to 03:00 in Amsterdam).
- When Areas overlap, or none is current, the look is the default and the control names the Areas. Evergreen also stays on the splash (the manifest's `theme_color`), before Angular boots, and at any launch without a stored palette from the last hour.
- The Other Areas line names only Overdue: a Task of another Area that is urgent but not yet Overdue shows only in the count. The pick is per device, so the phone and a laptop can show different sides.
- After a rollback and a roll-forward, an Area changed while the previous release ran has change-log entries without a palette; a device that syncs through them shows the default look for that Area until its next snapshot, at the latest on its next launch.
- The new Personal seed and its Harbour palette reach only Users created from 2026-10-12 on.

### The Task editor

- An editor reopened on the same Task cannot see the previous editor's last flushed save; if both change the same field within one round trip, the older value can land last.
- The Undo bar is inert while a sheet is open, and its window keeps running.
- A Failed save whose request did apply on the server can be overwritten by the next poll's baseline, as with the old Save button.
- Correcting a mis-tapped Due date counts one Due move.
- A Title typed, but not yet committed, while another device renames the Task can send the other device's title back once; the server takes it as a no-op.
- An edit made while a save comes back Rejected or Failed is sent with the next change or Try again, not on its own.
- A Done waits for the editor's last save before it sends, except when the app is hidden or closed before that Done has gone out, during the Undo window or while it still waits for the save: then the Done goes out at once with keepalive beside the edit's own send, it can land first, and the edit becomes a Review item.
- While the Undo bar shows on the editor, a focused control can sit under it: the scroll padding counts only the editor's own bar and footer.

### The Triage card

- When an earlier Triage fails after the person has moved on, its Task is the oldest in the Inbox again and replaces the card being edited, which drops focus and the phone keyboard. The other card's edits are kept, and the Undo bar says what failed.
- Another device's edit of a Task while its Triage is held changes the Task's version, so the card shows again until the window ends, and then the Triage does not apply: the Undo bar says it is not triaged, and the server files a Review item.
- When the shell itself is destroyed (a sign-out, for example) while a Triage's send is still on its way, a Done of the same Task held after it goes out at once and can arrive first.
- Edits made on the card and not yet triaged are lost when the Inbox is left or reloaded, unless Open in the editor saved them.
- One Undo at a time: a Triage followed by a Drop, or by a Done on Now, sends the Triage at once. A held Triage or Drop lives in memory only, as a held Done does.
- With a mouse, Triage and Drop leave the pointer where the Undo bar appears, so the window waits until the pointer leaves it. Touch has no such pause.
- Open in the editor sends only what the person changed. The Area the card proposes from the Current Area is not saved, so a Task without an Area opens in the editor with No Area although the card showed one.

## Open checks on the phone

These need the installed PWA on an Android phone. Record each outcome in a docs-only commit: a check that passes leaves this list, and one that fails becomes a known limit or later work.
- **Quick add.** A tap on Add keeps the keyboard up through its `mousedown` `preventDefault()`; if not, refocus synchronously in the click handler. Gboard shows a send key for `enterkeyhint="send"`, and several captures in a row by that key alone keep the keyboard up.
- **One-line fields.** Since 2026-10-18 quick add, the share screen's Title, Find a Task, an Area's name, a new passkey's name, Log progress and the Estimate's Other minutes are one-row textareas (`components/atoms/input/single-line.ts`), because Chrome on Android shows its passwords, cards and addresses bar above the keyboard on every text input, whatever its `autocomplete`, and never on a textarea (the Task editor's Title and Notes show none). The sign-up Name and the Recovery code stay text inputs, where autofill helps. Check that the bar stays away from the others, and whether Gboard shows its return key on the free text ones in place of send or Go; either key does what Enter did. The two minutes fields ask for a number keypad, which Chrome does not mark multi-line, so their key should not change.
- **The capture flight.** Whether the Inbox tab is inside `visualViewport` while the keyboard is up (if it never is, the flight runs only with the keyboard down), and whether the badge's lag after the flight is noticeable.
- **The held Done** survives backgrounding followed by a kill from the app switcher, through the keepalive send on `visibilitychange`.
- **Done's motion.** No frame shows the old content at full opacity between the slide-out and the rise-in. In Voice only the Undo bar sits at the bottom of the screen.
- **Haptics.** The Done button's tick (`HAPTIC_TICK_MS`, 15 ms) feels right, the swipe's arm and disarm ticks feel distinct, and the first swipe after launch gives none.
- **View transitions.** The back gesture plays Chrome's own animation, Angular starts none, and no stale `data-transition` stays on `<html>`. The `task-title` morph between the top pick's and the editor's text sizes does not stretch; if it does, try `height: 100%; object-fit: none; object-position: left top` on the `task-title` old and new images, or drop the `[data-morph]` rule and keep Push and Pop. Tabs, Push and Pop hold 60 fps with a long Now in a remote DevTools trace; if they do not, Push and Pop fall back to Swap in the kind matrix.
- **The swipe.** Android's edge back gesture leaves alone a swipe that starts just past `EDGE_DEAD_ZONE_PX` (24 px); raise it if not. The thresholds in `swipe-decision.ts` (40% of the width, a 0.6 px/ms fling past 64 px, a 10 px slop and a 1.5 axis ratio) feel right. Tracking holds 60 fps with its direct DOM writes, the row's pressed `signal-soft` ground does not show for the whole drag, and `Motion.play` animates `translate` in Chrome Android.
- **The Current Area.** Now switches from Work to Personal at 18:00 by itself, and the palette with it. A Saturday pick of Work holds until midnight. The status bar repaints live with the `theme-color` meta on the installed PWA, in light and dark (no source confirms it for an installed Android PWA; if it does not, only the status bar keeps its colour). The Evergreen flash at a cold start is acceptable; if not, a same-origin `<script src>` in `<head>` can apply the stored palette before boot, which the CSP's `script-src 'self'` allows. At phone width the control and More drop under the moment together, and the native list opens.
- **The Task editor.** The sheets rise, and close by a tap on the backdrop (`closedby="any"`; unverified on Android) and by the back gesture. The keyboard stays down when a sheet opens. The sticky footer behaves with the keyboard up. The Title morph from Now lands on the Title field without stretching. A Title typed and then the app backgrounded and killed survives through the keepalive save.
- **The Triage card.** After Triage, Drop and Undo, focus lands on the card and the keyboard stays down. The action bar stays on the nav while the Title is typed with the keyboard up. More hands over to Blocked by cleanly, and closing Blocked by puts focus on the card's More button. TalkBack reads the line under the card again on each refused Triage.
- **The bottom bar's pressed pill.** No tab keeps its pill after a tap, a long press (with or without the link menu), a press that turns into a scroll, or a system gesture that starts on the bar. Only the current tab shows a pill once the finger is up.
- **TalkBack.** A double tap gives `click` a `detail` of 0, so a Done moves focus to Undo and pauses the window; if not, screen-reader users on touch rely on the status region and the pointer pause. A one-finger swipe should never reach the page, and the buttons stay the path either way.

## Waiting on the maintainer

For the existing account, which the new seed does not reach, Personal's hours are edited by hand in Settings, Areas: Monday to Friday 00:00 to 08:00 and 18:00 to 00:00 (two rows a day), Saturday and Sunday 00:00 to 00:00. After the deploy, Personal gets the Harbour palette in the same editor.

The design-system note from the Done work goes into the design system artifact only with a go-ahead: "Not captured rows are a temporary inline surface for a capture that failed while the app is open. Slice 4's outbox replaces them with the Queued chip, and failed replays still become Review items. The Undo bar shows the Task title on one line with an ellipsis, an exception to the two-line rule for Task titles in Now, because the bar is chrome and the full title is announced in the status region." The motion amendment, with its Undo bar and Swipe entries, was accepted and applied on 2026-10-05. The Task editor's note waits for a go-ahead too: the `--scrim` token for the sheet backdrop, and the ChevronLeft (Back) and Clock (a time) icons, where the design mirrored chevron-right and drew its own clock. So does the ActionBar's "Mark Done" as a secondary Button, with a Don't: "Don't make Done the primary action of an editor; it reads as save and close."

## Later work

- Publishing `@ionaru/effect-passkeys` on JSR needs a `jsr.json`, `npm:` import mappings, and a check of extensionless imports and slow types (`--allow-slow-types` is likely).
- A one-time hint that teaches the swipe, decided after the phone check. Revisit the "Needs an Estimate" copy with it.
- An optimistic Inbox count for queued captures, only if the phone check shows the badge lagging.
- For the Current Area: syncing the pick across devices (a Command and a Settings field), dated exceptions such as holidays through slice 2's calendar import, "copy to days" in the Area editor, and the order between an Area's palette and the User's once the appearance settings exist.
- Shared CSS, second phase (the first was pull request #27): a shared legend, the segmented and Estimate chip buttons, and a common base for the quadrant and status chips. Unified legends give the date-spec and Area editor legends `padding: 0` and a `space-2` margin, a visible change, so it needs a go-ahead.
- The Task editor's rows paint no line between them, because the ChoiceRow and DateField hosts are inline elements. The Triage card's rows set their hosts to `display: block` (`triage-card.css`); the editor's rows need the same.
- GapSummary and GapBand come with the Gap rule and the screens that show it in slice 2. Building them earlier would leave unused code (decided 2026-10-26).
- The pickers on SegmentedControl's Wrap, Grid and Track layouts (only Wrap and Fill exist today): the Estimate chips and ruler, DatePicker's quick days and TimePicker, which place their Segments themselves.
- Segment's `now` form and its VoiceLabel, once Voice is built.

## Built plans

Each plan below was removed once its work was built. Its decisions, departures, verification and dated "Facts checked" notes stay in git history, where its counts and versions are historical. The rules the code follows are in `CONTEXT.md`, `libs/domain/CHANGELOG.md`, the ADRs, `apps/pwa/src/app/components/README.md` and the skills in `.agents/skills/`.

| Work | Removed | Read it with |
| --- | --- | --- |
| Slice 1, piece 2: contract and database core | 2026-10-02 | `git show 0c6ce75^:docs/slice-1-piece-2-plan.md` |
| The end-to-end tests against the image | 2026-10-05 | `git show ee7a5a9^:docs/e2e-image-plan.md` |
| View transitions and the motion foundation (pull request #3) | 2026-10-11 | `git show ca5b964^:docs/view-transitions-plan.md` |
| Capture and Done animations (pull request #5) | 2026-10-11 | `git show ca5b964^:docs/capture-and-done-animations-plan.md` |
| Swipe to Done (pull request #24) | 2026-10-11 | `git show ca5b964^:docs/swipe-to-done-plan.md` |
| The Current Area (pull request #29) | 2026-10-13 | `git show 8e387be^:docs/current-area-plan.md` |
| Slice 1: the seven pieces, their decisions and the facts checked for them | 2026-10-30 | `git show a25be28:docs/slice-1-plan.md` |
| The Task editor (pull request #30) | 2026-10-30 | `git show a25be28:docs/task-editor-plan.md` |
| The Atomic Design refactor | 2026-10-30 | `git show a25be28:docs/atomic-design-plan.md` |
| The Triage card (pull request #57) | 2026-10-30 | `git show a25be28:docs/triage-plan.md` |
