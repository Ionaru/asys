<!-- SPDX-License-Identifier: EUPL-1.2 -->

@AGENTS.md

## Claude Code

- Each skill in `.claude/skills/` is a symbolic link to its folder in `.agents/skills/`, so edit the copy in `.agents/skills/`. A new skill gets its folder there plus a link: `ln -s ../../.agents/skills/<name> .claude/skills/<name>`.
- Each rule in `.claude/rules/` is a symbolic link to its file in `.agents/rules/` in the same way. A new rule gets its file there plus a link: `ln -s ../../.agents/rules/<name>.md .claude/rules/<name>.md`. Quote its `paths` globs and keep them relative to the repo root.
- The desktop app's browser pane cannot create or use passkeys, and it cannot fetch service-worker scripts. A check that needs a signed-in session becomes a Playwright spec in `apps/pwa-e2e` (see `writing-e2e-specs`). It is not a manual click-through.
