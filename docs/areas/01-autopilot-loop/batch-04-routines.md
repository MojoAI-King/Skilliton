# Routines while working (M11, B21)

Kind: Living. Batch record. Area [01-autopilot-loop](AREA.md).

- **Type:** research
- **Goal:** The three routines decided from the hooks reference, then built with fixture tests: a dispatch suggestion on a prompt with six or more items, a checkpoint snapshot before compaction shown again after it, and a maintain suggestion after a merge.
- **Depends on:** 01-01
- **Advances:** M11; B21
- **Estimated sessions:** 2 (one to decide, one to build)

## Acceptance

- [ ] a decision entry names, for each routine, the client event it uses (UserPromptSubmit, PreCompact, SessionStart with matcher compact, Stop, or a git hook) with the documentation line that confirms the event exists, or says unverified
- [ ] the compaction snapshot (PreCompact plus SessionStart compact, already wired in hooks.json) is measured in a live session and the evidence filed
- [ ] the dispatch suggestion hook exists with a fixture test (shared with area 07 batch 04)
- [ ] the after-merge maintain suggestion exists with a fixture test, or the decision entry says why it is instructed only

## Notes

Do not invent hook capabilities. Every event named must be in the hooks reference or seen running.
