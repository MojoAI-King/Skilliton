# A session that installed the plugins still sees the PATH computed at its start; measure in a session started after the change

Kind: Living. Lesson entry.

- **ID:** 2026-09-19-a-session-that-installed-the-plugins-sti-fd48
- **Status:** accepted
- **Date:** 2026-09-19

## What broke

The harness template told every prepared project that the workflow plugin's `bin/` is on the Bash tool's PATH. In this repository's own session `which -a skilliton` found only the launcher join wrote under `~/.local/bin`, and no Skilliton plugin `bin/` folder was on PATH, while two other marketplaces' plugin `bin/` folders were. The template's claim was unverified and, in that session, false.

## The mechanism

Claude Code computes the Bash tool's PATH when a session starts, adding each enabled plugin's `bin/` folder then. The plugins were installed by `skilliton join` at 22:24 on 2026-09-18, inside a session that had started earlier, so that session kept the PATH from before the install. A headless session started after the install (`claude -p` with `--include-hook-events`, the workflow SessionStart hooks in the stream as proof the plugins loaded) had all three plugin `bin/` folders on PATH, behind the launcher. The doc had described the steady state and the measurement was taken in the one session that could not show it.

## The fix

`packs/base/plugins/workflow/templates/harness.md` line 10 now names both routes as measured: the launcher first, the plugin `bin/` in a session started after the install. Both measurements are filed: `evidence/live/2026-09-19-which-skilliton-in-a-session.md` and `evidence/live/2026-09-19-path-in-a-new-session.md`. docs/ONBOARDING.md, docs/CLIENTS.md and docs/COVERAGE.md say the same.

## The rule

A claim about what a session sees (PATH, environment variables, loaded hooks, enabled plugins) is measured in a session started after the change that is supposed to produce it. The session that made the change is evidence of the old state only. Until that measurement exists the doc says unverified.

## What now enforces it

The two evidence files above, cited from the template's batch item (docs/areas/02-auto-harness/batch-02-path-everywhere.md item 1). Nothing mechanical checks a future template sentence against a measurement; docs/CONTRACTS.md section 8 keeps evidence kinds separate and the report card requires a ticked item to name its evidence.
