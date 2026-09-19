# Output caps in the team settings

Kind: Living. Batch record. Area [04-token-efficiency](AREA.md).

- **Type:** build
- **Goal:** The shell and task output caps are explicit in the team settings, so a team cannot raise them by accident.
- **Depends on:** none
- **Advances:** M2
- **Estimated sessions:** 1 (small)

## Acceptance

- [x] the documented defaults are on record: shell output 30000 characters, task output 32000, both clamped to 4000 to 128000 (evidence: the settings reference read directly on 2026-09-18 22:29 EDT, entries `bashOutputMaxChars` and `taskOutputMaxChars`; an earlier reading the same day gave the maximum as 150000, corrected here; and the scratchpad measurement of Bash results in this machine's transcripts)
- [x] templates/project-settings.json sets bashOutputMaxChars and the task output cap explicitly at the documented defaults, with the setup test updated (evidence: templates/project-settings.json bashOutputMaxChars 30000 and taskOutputMaxChars 32000; scripts/skilliton.test.mjs section "team settings template: the keys a team relies on are pinned"; this repository's .claude/settings.json written from it by `skilliton project-settings --apply` on 2026-09-18)
- [x] docs/IT-ALLOWLIST.md and docs/CONTRACTS.md name the settings (evidence: docs/CONTRACTS.md section 5 names autoCompactWindow, bashOutputMaxChars and taskOutputMaxChars with their documented range, defaults and client versions; docs/IT-ALLOWLIST.md section 2 row for a project's `.claude/settings.json` names the three keys; both changed 2026-09-18)

## Notes

The setting names must be checked against the settings reference before they are written; say unverified if a name is not found.

2026-09-18: `bashOutputMaxChars` (default 30000) and `taskOutputMaxChars` (default 32000) are both in the settings reference (Claude Code 2.1.261 or later, clamped to 4000 to 128000), and the template sets both, pinned by `scripts/skilliton.test.mjs`. A reading through the documentation agent earlier the same day had reported no task output key; the reference read directly settled it. No key caps a subagent's reply, so none is set. Setting either key makes the client ignore the matching environment variable (BASH_MAX_OUTPUT_LENGTH, TASK_MAX_OUTPUT_LENGTH), which is the point: a team cannot raise a cap by accident through a shell variable.
