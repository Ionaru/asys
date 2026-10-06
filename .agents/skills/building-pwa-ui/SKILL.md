---
# SPDX-License-Identifier: EUPL-1.2
name: building-pwa-ui
description: Use when adding or changing an Angular component, screen, route, form control, style or palette in apps/pwa or libs/design-tokens, or when calling a new server endpoint or Command from the PWA.
---

# Building PWA UI

## Overview

`apps/pwa` is Angular 22, zoneless, with OnPush and standalone as defaults. Never set either explicitly. Its layers:

| Layer                                     | Holds                                                                                                                                                                     | May import                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `core/api`                                | `DataApi`, `AuthApi`, `wire.ts`; the only importer of `src/generated`                                                                                                     | generated client, `@asys/domain`         |
| `core/auth`, `core/data`, `core/platform` | session, `DataStore`, `CommandAttempts`, the shell-provided `DoneUndo` and `CaptureQueue`, seams (`Clock`, `Ids`, `DeviceStorage`, `Motion`, `Haptics`, `TaskMorph`, ...) | `core/*`, `@asys/domain`                 |
| `features/<screen>`                       | routed screens plus their pure helpers                                                                                                                                    | `core`, `ui`, `@asys/domain`             |
| `layout/`                                 | the shell: header, outlet, quick add, bottom nav                                                                                                                          | `core`, `ui`                             |
| `ui/<name>/`                              | presentational components                                                                                                                                                 | `@angular/*`, `@asys/domain`, other `ui` |

Lint bans runtime imports of `@asys/contract`, `effect` and `@ionaru/effect-passkeys/api` (type-only is fine). `@ionaru/effect-passkeys/server` and `/testing` are banned outright. `@ionaru/effect-passkeys/client` is the one passkeys entry the PWA may use at runtime.

## Component conventions

- Use signals throughout: `input()`, `output()`, `model()`, `viewChild()`, and `inject()` fields. Never `@Input`, `@Output`, `NgModule` or `ngModel`.
- Write templates and styles inline until the component's `.ts` file reaches 100 lines, then move them to `<name>.component.html` and `<name>.css` as the `angular-component-files` rule (`.agents/rules/`) says.
- Forms use Signal Forms (`@angular/forms/signals`), and shared controls implement `FormValueControl<T>` (`ui/text-field`, `ui/segmented`).
- **`ui` components:**
  - Use the selector `asys-<name>` and `ViewEncapsulation.None`.
  - The host class has the `asys-` prefix, with BEM elements and `--modifier` classes. Bind them in `host: {}` (see `ui/quadrant-chip`).
  - Closed sets are exported `enum`s, exposed to the template as `protected readonly Variant = ButtonVariant`.
- **Features** keep the default encapsulation, with classes such as `now__title`.
- **Styling:**
  - Use token CSS variables only (`--paper`, `--ink`, `--signal`, `--space-1` to `--space-7`, `--tap-target`, `--font-size-*`), never hex colours.
  - Add a `[data-theme='drive']` rule when tap size must differ in Voice only. Motion needs none: the kill switches in `src/styles.css` and `Motion.allowed()` already turn it off there and under reduced motion.
  - Timings come only from the motion tokens `--duration-quick`, `--duration-moderate`, `--ease-out`, `--ease-in` and `--ease-emphasized`. Never write a literal `ms` value or curve.
  - Script motion goes through `Motion.play` with `MotionDuration` and `MotionEasing`, and a haptic through `Haptics.tick()`. Never call `animate` or `navigator.vibrate` directly; jsdom has neither.
  - View-transition CSS (names, the z-index ladder, keyframes) lives only in `src/styles.css`. The ladder is `page` auto, `task-title` 1, `shell-capture`, `shell-undo` and `shell-nav` 2, `nav-mark` 3. New fixed shell chrome gets a name and a rung, or the sliding page paints over it.
  - Put a style in `src/styles.css` only when several controls share it.
  - The shared enter classes there are `asys-rise` (a small rise and fade, for bars), `asys-appear` (a fade) and `asys-pop` (a badge pop), used with `animate.enter`. A node that leaves with motion uses the function form `(animate.leave)` with `leaveMarked` (`layout/shell-motion.ts`) or `collapseRow` (`features/now/row-motion.ts`), which set `data-leaving` first, so a view transition never sees the leaving node beside its replacement.
- **Accessibility:**
  - Errors read "Error:" with `aria-invalid` and `aria-describedby`, never colour alone.
  - Quadrants differ in lightness or form, never hue alone.
  - The bottom nav's 56px height is repeated in the styles of `ui/bottom-nav` and `ui/capture-button`, and as `--shell-nav-height` in `layout/shell-layout`, so change all three. New code reads `--shell-nav-height`. The Undo bar is a fourth place that sits on the nav: the shell publishes its height as `--shell-undo-height`, which the page padding, the pill and quick add add.

## Recipes

**UI component:**

1. Create `ui/<name>/<name>.ts` and `<name>.spec.ts`. There is no barrel and nothing to register.
2. Model it on `quadrant-chip` (display), `button` (attribute selector) or `text-field` (form control).
3. Write the spec with a `Host` component that drives signals, and await `fixture.whenStable()`.

**Screen and route:**

1. Create `features/<name>/<name>.ts` and its spec, with `providers: [CommandAttempts]` when it sends Commands.
2. Add the route in `app.routes.ts`: `loadComponent` and `title: '<Name> · ASYS'`, under `ShellLayout` with `data: { level }` unless it is an auth screen. The level is 0 for a tab or a screen of its own, otherwise one more than the screen it opens from. `app.routes.spec.ts` fails without it, and the level decides Push, Pop or Swap.
3. Add the title row to `app.routes.spec.ts`.
4. For a primary tab, update `ui/bottom-nav` and `TAB_PATHS` in `core/platform/tabs.ts`: it gives view transitions the tab order and shows Capture on the tabs, and `shell-layout.spec.ts` fails when it and the bottom nav disagree. For an auth screen, add the path to `AUTH_PATHS` in `app.ts` (the sign-out redirect), and to `AUTH_PATHS` and `AUTH_SEGMENTS` in `core/auth/safe-return-url.ts` with a case in its spec. Use `signedOutGuard` on the route. A screen shown just after sign-in (like `recovered`) goes only in `safe-return-url.ts`, without `signedOutGuard`.
5. An id-keyed editor gets a `<name>-route.ts` wrapper (see `task-editor-route.ts`).
6. Add an e2e spec for the user-facing flow (`writing-e2e-specs`).

**Calling a new endpoint or Command:**

1. Run `pnpm exec nx run pwa:api-client`.
2. Add a method in `core/api/data-api.ts` or `auth-api.ts` that imports `generated/api/fn/<tag>/<op>`. These services never reject; they return the `HttpOutcome` and `CommandOutcome` unions.
3. Add a `SHAPES` entry in `wire.ts` for each new generated model that the PWA converts to a domain type with `fromWire` or `toWire`. Models with no domain type are used as generated.
4. Fix the exhaustive switches in `core/data/command-subject.ts`, `outcome-message.ts` and `features/inbox/review-copy.ts`.
5. Sending from a screen:
   - Get a key from `CommandAttempts.keyFor(command)`, send with `DataStore.send(command, key)`, then call `attempts.settle(...)` and show `outcomeMessage(outcome)`.
   - After every await, check `destroyRef.destroyed`.
   - Disable the control while a send is pending or `awaitingSync()` holds its subject.
   - A Done goes through `DoneUndo.complete(task, origin)` instead: it holds the Task for the Undo window and owns the key and the send. Quick add goes through `CaptureQueue.submit(text)`. Both are provided by the shell. Quick add's Add is `aria-disabled` while the field is empty, never `disabled`, so a tap never takes focus from the field.
   - There is no offline queue yet, except the in-memory held Done and `CaptureQueue`, which do not survive a reload; that comes in slice 4. Offline, a send fails with "cannot reach the server".

**Palette** (ADR 0013, `libs/design-tokens/README.md`):

1. Add `{ name, accent, highlight, ground }` to `PALETTES` in `scripts/palettes.mts`.
2. Run `node scripts/palettes.mts`. It enforces the contrast pairs (4.5 for text, 3 for lines, 7 for text in drive) and writes the token files and resolver contexts.
3. Update the "12 contexts" count in the design-tokens README, ADR 0013 and `terrazzo.config.mts`.
4. Never hand-edit the generated `palettes/*.tokens.json` or `asys.resolver.json`.

## Tests and checks

- Unit tests use `@angular/build:unit-test` (Vitest, jsdom). Vitest globals are not imported.
- `vi.mock` of relative imports is refused, so override a seam service with `{ provide: X, useValue }`. `features/now/now.spec.ts` is the model.
- Use the real domain functions over a fixed state and clock.
- Specs that render scripted motion provide a fake `Motion` whose `play` promise they control. The real one resolves at once in jsdom.
- `HTMLElement.click()` dispatches a click with `detail: 0`, which a Done reads as a keyboard activation (focus goes to Undo). A pointer press in a spec dispatches `new MouseEvent('click', { bubbles: true, detail: 1 })`.

```bash
pnpm exec nx run-many -t lint typecheck test build -p pwa
```

```bash
pnpm exec nx format:check --all
```

`typecheck` skips templates, so the `build` (which also checks bundle budgets) and `test` targets are the template check. The plain `nx serve pwa` runs no service worker; try that with `pnpm exec nx run pwa:serve-sw`.
