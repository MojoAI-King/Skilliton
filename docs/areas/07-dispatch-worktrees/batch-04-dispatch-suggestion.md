# Dispatch suggestion (M11)

Kind: Living. Batch record. Area [07-dispatch-worktrees](AREA.md).

- **Type:** build
- **Goal:** A prompt with six or more separate items gets a dispatch suggestion from a hook.
- **Depends on:** 01-04
- **Advances:** M11; B21
- **Estimated sessions:** 1

## Acceptance

- [x] the hook exists on the event 01-04 decided, with a fixture test (evidence: the event 01-04 decided is UserPromptSubmit; the hook, its counting rules, its four fixture tests and its two mutation checks are the same work ticked in docs/areas/01-autopilot-loop/batch-04-routines.md item 3, and the suite passed 51 of 51 on 2026-09-20)
- [x] seen once in a live session, filed (evidence: evidence/live/2026-09-22-dispatch-automation-live.md, headless Claude Code 2.1.278 with the installed plugin: dispatch-suggested in the journal, and with workflow 0.20.1 the assistant ran /workflow:dispatch from the note and wrote LANES.md; the first run found the prompt field is prompt, fixed in 0.20.0; the interactive extension was not run separately)

## Notes

Same work as area 01 batch 04's third item.

The second item is the one thing a headless fixture cannot buy: whether Claude Code delivers UserPromptSubmit to a
plugin hook in a real session. It joins the owner pass at the end of the build, where the live dispatch run already
sits, and the decision entry records the delivery as unverified until then.
