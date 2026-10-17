---
# SPDX-License-Identifier: EUPL-1.2
name: taking-screenshots
description: Use when taking or retaking screenshots of PWA screens (for a pull request, a review, or to look at a signed-in screen yourself), or when putting images on a GitHub pull request.
---

# Taking screenshots

## Overview

Screenshots come from a **shots file**, `apps/pwa-e2e/src/<topic>.shots.ts`. It is a Playwright file run on demand against the e2e dev stack. `nx e2e pwa-e2e` and CI never run it.

- **The page.** Each test gets the same signed-in `page` as a spec (see `writing-e2e-specs`).
- **Light and dark.** Each `shoot` switches the colour scheme and writes the screen in both, each as a PNG with a JSON sidecar.
- **Upload.** `scripts/pr-screenshots.mts` reads the sidecars to lay the images out on a pull request.
- **Example.** `task-editor.shots.ts` is the worked one.

Steps 1 to 3 are the whole job when no pull request is involved.

## Steps

1. **Write or update the shots file.** Keep one per screen in the repo. Start from `task-editor.shots.ts`. Done when:
   - every state the request names has a `shoot` or `shootEnds` call;
   - each such call follows an `expect` that the state is on screen;
   - `pnpm exec nx run-many -t lint typecheck -p pwa-e2e` passes.
2. **Run it** with `pnpm exec nx run pwa-e2e:shots -- src/<topic>.shots.ts`.
   - It needs what `nx e2e pwa-e2e` needs; see `writing-e2e-specs`, Running.
   - It empties `dist/screenshots/` first.
   - CI never runs a shots file, so a failure usually means a selector went stale. Fix the file.
   - Done when the run passes and `dist/screenshots/<topic>/` holds a `-light` and a `-dark` PNG, each with its JSON, for every name.
3. **Review every image.**
   - Open each PNG. A `magick montage` contact sheet per group is quicker, and a subagent keeps 30 images out of your context.
   - Record one line per image: its name, what it shows, and whether that matches its caption.
   - Done when every image has its line and none mismatches. For any mismatch, fix the shots file and go back to step 2.
4. **Upload.**
   1. Dry run: `node scripts/pr-screenshots.mts <pr> dist/screenshots/<topic> --dry-run`. It checks the pairs and prints the section.
   2. Get the go-ahead. On a public repository the images become public. Go ahead when the request asked for images on that pull request. Otherwise, show the user the dry run's pull request, image count and captions, and wait for their yes.
   3. Run it without `--dry-run`. It replaces the body's `## Screenshots` section, or appends one.
   4. If it exits non-zero, it has put back the body it saved, and its message names the backup. If its message says that restore failed, run the `gh pr edit` it prints before going back to step 2, which empties the folder.
   - Done when it prints `<url>: <N> images in ## Screenshots`. Give the user the pull request link.

## Writing a shots file

- **Imports.** Import `test`, `expect` and the helpers from `./support/screenshots.ts`. Its `test` is the signed-in one, with the tap highlight that emulation leaves behind hidden.
- **Seeding.** Call `pinClock(page)` first, seed relative to the date it returns, then load the page with `goto` or `reload`.
  - By default it pins 10:00 on a weekday. Work is then the Current Area, which gives the Evergreen palette, and today cannot flip mid-run.
  - Dates still follow the run's week. For the same dates on every run, pass `pinClock(page, at)`.
  - `shoot` checks the palette is Evergreen. A shot in another palette needs a helper that sets it, and a `shoot` that expects it.
- **Viewport.** Call `test.use(PHONE)` or `test.use(DESKTOP)` once per `describe`, and interact with `tap()` under `PHONE`.
- **Names, captions and groups.**
  - Names look like `NN-kebab` and sort into display order.
  - Captions head the table columns.
  - `group` gives each set of tables its bold heading.
- **Tall screens.** For a screen taller than the viewport, `shootEnds` shoots the top and the end. For the end alone, call `scrollTo(page, 'end')`, then `shoot`. A full-page shot would put fixed bars mid-page.
- **Focus.** After a keyboard step (Escape, Tab), call `blurActive(page)` before `shoot`, or the image shows a focus ring. Focus that a script moves after a tap shows none, as on a phone.

## Other uses

- **A comment instead of the body.** Use `gh pr comment <pr> --attach <file>#<alt>`.
- **Before and after.** Give both runs the same instant with `pinClock(page, at)`.
  - In a `git worktree add` checkout of the base, run `pnpm install` and copy in `.env` and the shots file. While the base lacks them, also copy the helpers, the shots config and the `shots` target.
  - Run `shots` there once the feature branch's run has finished: both use ports 3100 and 4300 and the `asys_e2e` database.
  - The images land in that worktree's `dist/screenshots/<topic>/`. The script lays out one folder, so ask the user how to show the pair.
