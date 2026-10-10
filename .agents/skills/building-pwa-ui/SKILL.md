---
# SPDX-License-Identifier: EUPL-1.2
name: building-pwa-ui
description: Use when adding or changing an Angular component, screen, route, form control, style or palette in apps/pwa or libs/design-tokens, or when calling a new server endpoint or Command from the PWA.
---

# Building PWA UI

## Overview

`apps/pwa` is Angular 22, zoneless, with OnPush and standalone as defaults. Never set either explicitly. Its layers:

| Layer                                     | Holds                                                                                                                                                                                                     | May import                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `core/api`                                | `DataApi`, `AuthApi`, `wire.ts`; the only importer of `src/generated`                                                                                                                                     | generated client, `@asys/domain`                                                                                         |
| `core/auth`, `core/data`, `core/platform` | session, `DataStore`, `TimeZoneSync`, `CommandAttempts`, the shell-provided `DoneUndo` and `CaptureQueue`, `ReportedZone`, seams (`Clock`, `Ids`, `DeviceStorage`, `Motion`, `Haptics`, `TaskMorph`, ...) | `core/*`, `@asys/domain`                                                                                                 |
| `features/<screen>`                       | routed screens plus their pure helpers                                                                                                                                                                    | `core`, `ui`, `@asys/domain`                                                                                             |
| `layout/`                                 | the shell: header, outlet, quick add, bottom nav                                                                                                                                                          | `core`, `ui`                                                                                                             |
| `ui/<name>/`                              | presentational components; `ui/icon` alone imports Font Awesome                                                                                                                                           | `@angular/*`, `@asys/domain`, other `ui`; `ui/swipe-actions` alone also the `core/platform` seams `Motion` and `Haptics` |

Lint bans runtime imports of `@asys/contract`, `effect` and `@ionaru/effect-passkeys/api` (type-only is fine). `@ionaru/effect-passkeys/server` and `/testing` are banned outright. `@ionaru/effect-passkeys/client` is the one passkeys entry the PWA may use at runtime.

## Component conventions

- Use signals throughout: `input()`, `output()`, `model()`, `viewChild()`, and `inject()` fields. Never `@Input`, `@Output`, `NgModule` or `ngModel`.
- A member only the class uses is an ES private `#` field (`readonly #api = inject(DataApi)`). A member the template reads is `protected`, and a signal query is `private`, because Angular refuses a `#` name for either.
- Write templates and styles inline until the component's `.ts` file reaches 100 lines, then move them to `<name>.component.html` and `<name>.css` as the `angular-component-files` rule (`.agents/rules/`) says.
- Forms use Signal Forms (`@angular/forms/signals`), and shared controls implement `FormValueControl<T>` (`ui/text-field`, `ui/segmented`). They extend `FieldControl` (`ui/field-control`), which holds `hint`, `errors`, `touched`, `disabled`, `touch` and the error and hint ids.
- **`ui` components:**
  - Use the selector `asys-<name>` and `ViewEncapsulation.None`.
  - The host class has the `asys-` prefix, with BEM elements and `--modifier` classes. Bind them in `host: {}` (see `ui/quadrant-chip`).
  - Closed sets are exported `enum`s, exposed to the template as `protected readonly Variant = ButtonVariant`.
- **Features** keep the default encapsulation, with classes such as `now__title`.
- **Styling:**
  - Use token CSS variables only (`--paper`, `--ink`, `--signal`, `--space-1` to `--space-7`, `--tap-target`, `--font-size-*`), never hex colours.
  - Add a `[data-theme='drive']` rule when tap size must differ in Voice only. Motion needs none: the kill switches in `src/styles.css` and `Motion.allowed()` already turn it off there and under reduced motion.
  - Timings come only from the motion tokens `--duration-quick`, `--duration-moderate`, `--ease-out`, `--ease-in` and `--ease-emphasized`. Never write a literal `ms` value or curve.
  - Script motion goes through `Motion.play` with `MotionDuration` and `MotionEasing`, and a haptic through `Haptics.tick()`. Never call `animate` or `navigator.vibrate` directly; jsdom has neither. `play` never rejects (it reports a failure other than a cancel with `console.error`), so a caller adds no `catch`.
  - View-transition CSS (names, the z-index ladder, keyframes) lives only in `src/styles.css`. The ladder is `page` auto, `task-title` 1, `shell-capture`, `shell-undo` and `shell-nav` 2, `nav-mark` 3, and `nav-glyph-1` to `nav-glyph-3` and `nav-badge` 4. New fixed shell chrome gets a name and a rung, or the sliding page paints over it. Anything drawn inside the moving `nav-mark` pill gets a name of its own on the top rung, or it travels with the pill.
  - Put a style in `src/styles.css` only when several controls share it.
  - Reuse the shared classes in `src/styles.css` instead of copying their rules, and keep the feature class (such as `now__status`) on the element as the hook that specs query. Next to `asys-page` are `asys-page__title` (a screen's `h1`, with `asys-page__title--flush` when the screen spaces its blocks with a gap), `asys-page__status` (the status line under it, which takes no room while empty), `asys-count` (the pill that holds a count, used with `asys-num`, with the colours set in the component) and `asys-fieldset-reset` (a fieldset without the browser's border, padding and margin).
  - `asys-num` sets the mono font and tabular figures. A component rule on the same element that sets `font-family` beats it (equal specificity, and component styles load after `styles.css`), so leave `font-family` out of that rule.
  - The shared enter classes there are `asys-rise` (a small rise and fade, for bars), `asys-appear` (a fade) and `asys-pop` (a badge pop), used with `animate.enter`. A node that leaves with motion uses the function form `(animate.leave)` with `leaveMarked` (`layout/shell-motion.ts`) or `collapseRow` (`features/now/row-motion.ts`), thin calls to `Motion.leave`, which sets `data-leaving` first, so a view transition never sees the leaving node beside its replacement, and then calls `animationComplete` once.
- **Icons:** draw them with `<asys-icon [name]="IconName.X" />` (`ui/icon`), or a Button's `icon` input. `IconName` is the closed set of Font Awesome Pro Classic Regular names the design system's Icon table lists (Solid only for the current tab); add a name there, with its import, when a screen needs a new one. Icons are 1em tall and take the text colour, so size them with `font-size` in `em`, never px. Never import `@fortawesome/*` outside `ui/icon`, and never copy Pro SVG data into the repository.
- **Swipe** (`ui/swipe-actions`): `<asys-swipe-actions [taskId] [disabled] [endEnabled] [startEnabled] (commitEnd) (commitStart)>` wraps a Task's content. A right swipe emits `commitEnd`, a left one `commitStart`, each with the Task id recorded at `pointerdown`, and nothing when the input has changed since. Use it only on Now's top pick and ranked rows, wrapped inside the `<li>` so the row selectors hold, and only where every swipe action has a single-pointer control elsewhere (WCAG 2.5.1 and 2.5.7): the top pick's buttons, the editor behind a row's link. Touch and pen only; Voice only, a mouse, a form control and the screen edges never swipe. The tuning constants live in `swipe-decision.ts`. Pointer listeners use `addEventListener` and write the surface's `translate` straight to the DOM, so a move runs no change detection. Its specs stub `getBoundingClientRect` on the host instance (never the prototype) and `performance.now`, and dispatch `PointerEvent`s with `isPrimary: true`.
- **Accessibility:**
  - Errors read "Error:" with `aria-invalid` and `aria-describedby`, never colour alone.
  - Quadrants differ in lightness or form, never hue alone.
  - A clipping wrapper (`overflow: clip`) keeps the focus ring with `overflow-clip-margin: 4px`, and when its content is positioned it lifts itself with `:focus-within`, so the next row does not cover the ring. `ui/swipe-actions` makes each host its own stacking context (`z-index: 0`) and lifts the focused one to 1, so its inner layers never rise over the shell's fixed bars.
  - The bottom bar holds the three destinations and, on the tabs, the Capture button at its end. Its height grows with Text size, so the shell measures it with a `ResizeObserver` and publishes it as `--shell-nav-height` (the CSS default, `tap-target-large` plus its padding and line, only covers the first frame). The Undo bar sits on the nav, and the shell publishes its height as `--shell-undo-height` the same way. The page padding and quick add read both; never repeat a bar height as a literal.

## Recipes

**UI component:**

1. Create `ui/<name>/<name>.ts` and `<name>.spec.ts`. There is no barrel and nothing to register.
2. Model it on `quadrant-chip` (display), `button` (attribute selector) or `text-field` (form control).
3. Write the spec with a `Host` component that drives signals, and await `fixture.whenStable()`.

**Screen and route:**

1. Create `features/<name>/<name>.ts` and its spec, with `providers: [CommandAttempts]` when it sends Commands.
2. A screen that reads `DataStore.state()` shows `<asys-load-state>` (`ui/load-state`) while there is none, bound to `dataStore.status() === SyncStatus.Failed` and `dataStore.refresh()`.
3. Add the route in `app.routes.ts`: `loadComponent` and `title: '<Name> · ASYS'`, under `ShellLayout` with `data: { level }` unless it is an auth screen. The level is 0 for a tab or a screen of its own, otherwise one more than the screen it opens from. `app.routes.spec.ts` fails without it, and the level decides Push, Pop or Swap.
4. Add the title row to `app.routes.spec.ts`.
5. For a primary tab, update `ui/bottom-nav` and `TAB_PATHS` in `core/platform/tabs.ts`: it gives view transitions the tab order and shows Capture on the tabs, and `shell-layout.spec.ts` fails when it and the bottom nav disagree. For an auth screen, add the path to `SIGNED_OUT_PATHS` in `core/auth/safe-return-url.ts`, which the sign-out redirect in `app.ts` also reads, with a case in its spec. Use `signedOutGuard` on the route. A screen shown just after sign-in (like `recovered`) goes in that file's `AUTH_PATHS` instead, without `signedOutGuard`.
6. An id-keyed editor gets a `<name>-route.ts` wrapper (see `task-editor-route.ts`). An editor that follows the store while the person edits uses `followStore` and `settleSaved` from `core/data/draft-follow.ts`.
7. Add an e2e spec for the user-facing flow (`writing-e2e-specs`).

**Calling a new endpoint or Command:**

1. Run `pnpm exec nx run pwa:api-client`.
2. Add a method in `core/api/data-api.ts` or `auth-api.ts` that imports `generated/api/fn/<tag>/<op>` and calls it through the generated `Api` service as `this.api.invoke(<op>, params)`, wrapped in `callApi` (`run` in `AuthApi`). `invoke` rejects on an HTTP error, but these services never reject; they return the `HttpOutcome` and `CommandOutcome` unions. `provideApi()` in `app.config.ts` sets the root URL.
3. Add a `SHAPES` entry in `wire.ts` for each new generated model that the PWA converts to a domain type with `fromWire` or `toWire`. Models with no domain type are used as generated.
4. Fix the exhaustive switches in `core/data/command-subject.ts`, `outcome-message.ts` and `features/inbox/review-copy.ts`.
5. Sending from a screen:
   - Send with `CommandAttempts.send(command)`, which takes the command's key from `keyFor`, sends through `DataStore.send` and settles the attempt. Then show `outcomeMessage(outcome)`.
   - After every await, check `destroyRef.destroyed`.
   - Disable the control while `CommandAttempts.busy(subject)` holds, which is true while a send for the subject is in flight or `awaitingSync()` holds it, and show `<p asys-sync-note>` (`ui/sync-note`) while `awaitingSync()` holds it. `send` raises and lowers the in-flight count itself, so a screen keeps no pending signal of its own. A send that skips `CommandAttempts.send` (the time zone choice) wraps its work in `track(subject, work)`. The subject is the id `commandSubject(command)` returns.
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
- A click handler that must tell Enter or Space from a pointer calls `activationOf(event)` (`ui/activation`), which returns an `Activation` (`{ keyboard: boolean }`). Never read `event.detail` yourself, and type an output that carries it as `Activation`. A template cannot call an import, so the component exposes it as `protected readonly activationOf = activationOf`.
- `HTMLElement.click()` dispatches a click with `detail: 0`, which `activationOf` reads as keyboard (a Done then moves focus to Undo). A pointer press in a spec dispatches `new MouseEvent('click', { bubbles: true, detail: 1 })`.

```bash
pnpm exec nx run-many -t lint typecheck test build -p pwa
```

```bash
pnpm exec nx format:check --all
```

`typecheck` skips templates, so the `build` (which also checks bundle budgets) and `test` targets are the template check. The plain `nx serve pwa` runs no service worker; try that with `pnpm exec nx run pwa:serve-sw`.
