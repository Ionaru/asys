---
# SPDX-License-Identifier: EUPL-1.2
paths:
  - 'apps/pwa/src/app/**/*.{ts,html,css}'
---

# Angular component files

A component's template and styles start inline in its `.ts` file and move to files of their own once that file reaches 100 lines.

- **When:** you create or change a component whose `.ts` file has 100 lines or more, counted as `wc -l` counts them on the formatted file. Spec files and `.ts` files without a `@Component` are exempt. Do not split a component you are not otherwise changing.
- **Which first:** move whichever of the `template` and `styles` literals has more lines, measured from its `template:` or `styles:` line to its closing backtick line. That one saves the most. On a tie, move the template.
- **Then:** if the file still has 100 lines or more, move the other literal too, and stop. A file that is still long after both moves is long because of its class, and this rule asks nothing more of it.
- **Exceptions:** a literal that fits on its key line, such as `template: '<ng-content />'`, stays inline, because moving it saves nothing. A moved template or stylesheet stays moved if the component later shrinks below 100 lines.

## Moving a literal

- The template goes to `<name>.component.html` beside `<name>.ts`, as `templateUrl: './<name>.component.html'`. The suffix is deliberate: oxfmt chooses its Angular parser by the `.component.html` suffix alone, and it flattens the `@if` and `@for` blocks of a plain `.html` file.
- The styles go to `<name>.css` beside `<name>.ts`, as `styleUrl: './<name>.css'`.
- Move the content unchanged apart from its indentation. `encapsulation`, `host` and the other decorator fields stay where they are.
- Start each new file with the `SPDX-License-Identifier` line for EUPL-1.2 in its comment form, `<!-- ... -->` for the template and `/* ... */` for the styles. Angular drops the comment when it compiles the template.
- Check the move with the `format`, `build` and `test` rows of the CI table in `AGENTS.md`. `pwa:typecheck` does not read templates, so it proves nothing here.
