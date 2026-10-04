<!-- SPDX-License-Identifier: EUPL-1.2 -->

@AGENTS.md

## Claude Code

- Each skill in `.claude/skills/` is a symbolic link to its folder in `.agents/skills/`, so edit the copy in `.agents/skills/`. A new skill gets its folder there plus a link: `ln -s ../../.agents/skills/<name> .claude/skills/<name>`.
- The desktop app's browser pane cannot create or use passkeys, and it cannot fetch service-worker scripts. A check that needs a signed-in session becomes a Playwright spec in `apps/pwa-e2e` (see `writing-e2e-specs`). It is not a manual click-through.
