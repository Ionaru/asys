---
# SPDX-License-Identifier: EUPL-1.2
name: writing-e2e-specs
description: Use when a change needs checking in a real browser (sign-up, passkeys, Now, Inbox, triage, editors, phone width, two tabs), when adding or fixing a Playwright spec in apps/pwa-e2e, when nx e2e pwa-e2e fails, or when nx run pwa-e2e:e2e-image fails.
---

# Writing e2e specs

## Overview

`apps/pwa-e2e` runs Playwright in Chromium against the real stack, in two forms:

- **The dev stack** (`nx e2e pwa-e2e`), isolated from the developer's own dev stack: the API on port 3100, the PWA dev server on port 4300 and the database `asys_e2e`, in the same Postgres container.
- **The image stack** (`nx run pwa-e2e:e2e-image`): the production image on `http://localhost:3200`, started from `deploy/compose.yaml` and `deploy/compose.e2e.yaml` under the compose project `asys-e2e`. `playwright.image.config.mts` sets the fixture option `stack` to `Stack.Image` (the default is `Stack.Dev`), which makes the `page` fixture take its Sign-up link from `docker compose exec ... signup-link` in the image's container instead of the host bundle. It also blocks service workers.

Both suites must pass before a change is done.

Each test signs up a fresh Owner with a WebAuthn virtual authenticator, so tests run in parallel and need no person at a passkey prompt. Browser checks of signed-in flows belong here, not in a manual click-through.

## Writing a spec

1. Create `apps/pwa-e2e/src/<topic>.spec.ts`, starting with the EUPL-1.2 SPDX line, copied from any other spec. Imports carry the `.ts` extension, and only erasable syntax is allowed, so use `as const` objects, not enums. A spec that only makes sense against the image (static files, headers) is named `<topic>.image.spec.ts`, uses only the `request` fixture, and runs only under the image config.
2. Write `import { expect, test } from './support/fixtures.ts';`. Its `page` fixture has already signed up a new Owner with a virtual passkey and waits on `/now`. `owner` only carries that Owner's name.
3. Seed data through the API helpers in `support/seed.ts` (`seedTask`, `captureTask`, `triageTask`, `editTask`, `addBlocker`, `areaId`, `snapshot`, or `command` for anything else). These post to `/v1/commands` with the right Origin. Add a helper there for a new Command. Then call `page.reload()`, or the PWA waits up to 15 s for its next poll.
4. For dates, use `support/time.ts`: `localToday()`, `addDays`, `dayLabel`, and the zone `E2E_ZONE` (Europe/Amsterdam). The clock is real, so call `skipNearMidnight(test)` when "today" matters.
5. Select by role and label first, then by component BEM classes. For phone width, use `test.use({ viewport: { width: 375, height: 812 } })`. To simulate a stale tab, block `**/v1/changes**` with `page.route`.
   - **Touch** (a swipe, a drag-scroll, a pinch): per file, `test.use({ viewport: { width: 412, height: 839 }, hasTouch: true, isMobile: true })`, then `const touch = await touchscreen(page)` from `support/touch.ts` (`down`, `move`, `up`, `cancel`, `drag`, `pinch`). It sends CDP `Input.dispatchTouchEvent`, so the page gets trusted touch input as Pointer Events with `pointerType: 'touch'`, and `touch-action` applies. Open the session after the seeding reload. A swipe starts at least 24px from the viewport edge, or the swipe ignores it (`swipe.spec.ts` starts 40px inside the target).
6. A Done is held for 5 seconds before CompleteTask is sent, and the shell announces it in `.shell__status`. To see a Done reach the server, install the clock before the page loads its timers, `await page.clock.install(); await page.reload();`, then after the Done run `const sent = page.waitForResponse('**/v1/commands'); await page.clock.fastForward(5_000); await sent;`. The clock covers the whole browser context, so a second page in it shares it, and one jump never reaches the 15 s poll.
7. To pin a known UX limit, add it to `known-limits.spec.ts` and note it in the slice plan's Known limits. A fix then flips both.

There is no need to edit `project.json` or `playwright.config.mts` for either target; per-file targets are inferred.

## Running

Prerequisites for the dev stack: `docker compose up -d --wait`, a `.env` holding the database passwords, and `pnpm exec playwright install chromium` once.

```bash
pnpm exec nx e2e pwa-e2e -- src/<topic>.spec.ts
```

For the image stack, follow the README's "Against the image" recipe (never in the deployed checkout), then:

```bash
pnpm exec nx run pwa-e2e:e2e-image -- src/<topic>.spec.ts
```

- `nx e2e pwa-e2e` and `nx run pwa-e2e:e2e-image` are the only supported entry points. The first one's `reset-db` dependency recreates `asys_e2e`, migrates it and copies the server bundle to `dist/pwa-e2e/server`; the second builds nothing and needs the image stack already running.
- The scripts refuse any database other than `asys_e2e`, and refuse to start while ports 3100 or 4300 are live.
- **Beside a running dev stack**, follow the README's "End-to-end tests" section. Build once with the dev servers stopped, then run `reset-db` and `e2e` with `--exclude-task-dependencies`.
- Reports and traces land in `dist/.playwright/apps/pwa-e2e`, for both targets, so each run replaces the other's.

## Common mistakes

| Mistake                                                | Symptom                                                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Seeding without `page.reload()`                        | The test waits for a poll and times out                                                                          |
| Fixed calendar dates                                   | Fails on another day; use `localToday()`                                                                         |
| Renamed sign-up UI strings                             | Every spec fails in the fixture (`fixtures.ts`)                                                                  |
| Running Playwright directly                            | Stale `asys_e2e`, or the server bundle changes mid-run; use `nx e2e pwa-e2e` or `nx run pwa-e2e:e2e-image`       |
| Expecting the service worker                           | Neither stack runs one: the dev stack serves none, and the image config blocks it                                |
| Expecting a Done on the server at once                 | It is held for 5 s; use the clock recipe                                                                         |
| Measuring a box mid-animation                          | The box is still moving; first wait for `document.getAnimations().length` to be 0 with `expect.poll`             |
| Counting the keepalive POST                            | Playwright's request events miss a keepalive fetch sent while the page unloads; check the server with `snapshot` |
| Swiping with `page.mouse`                              | Nothing moves: the swipe ignores mouse pointers                                                                  |
| Using `page.touchscreen` for a drag                    | It only taps; use `support/touch.ts`                                                                             |
| Dispatching `TouchEvent`s with `locator.dispatchEvent` | They are untrusted and produce no Pointer Events                                                                 |
| Waiting for every animation while the Undo bar shows   | The Undo ring's fill runs for the whole 5 s window; leave it out of the count, as `swipe.spec.ts` does           |
