# Rolling maintenance (B35)

Kind: Living. Batch record. Area [01-autopilot-loop](AREA.md).

- **Type:** build
- **Goal:** The records are written as the work goes, so the end-of-day maintain becomes a short reconciliation instead of a 5 to 10 minute ritual.
- **Depends on:** 01-01 for the before measurement (the owner's reported minutes)
- **Advances:** B35; M2
- **Estimated sessions:** 2

## Acceptance

- [x] skilliton checkpoint --apply also regenerates the indexes (the index command's work) and rewrites the task record's handoff section from the checkpoint (evidence: workflow 0.9.0, runtime/commands/checkpoint.mjs and runtime/lib/tasks.mjs rewriteHandoffSection; scripts/lifecycle.test.mjs "checkpoint --handoff on main rewrites RESUME HERE byte for byte, the task Handoff, the tasks index, and reads back as current" and the unprepared-main skip test, 38 of 38 passing 2026-09-19)
- [x] a --handoff flag on checkpoint writes the RESUME HERE block of docs/HANDOFF.md from the checkpoint text on main, and the task record on any other branch (evidence: runtime/lib/handoff.mjs; scripts/handoff-write.test.mjs 7 of 7 and the lifecycle tests for the main round-trip, the rotation into a created archive and the branch case; this wave's own handoff written by the flag, docs/HANDOFF.md)
- [x] the maintain skill's end-of-day steps read as reconcile only: each step says what it checks, not what it writes from scratch (evidence: packs/base/plugins/workflow/skills/maintain/SKILL.md "The resume marker" section and docs/MAINTAIN.md step 6, 2026-09-19; the handoff skill section 2 routes to the command)
- [x] lifecycle tests cover the new flags, including the refusal when a checkpoint would overwrite a handoff written after it (evidence: scripts/lifecycle.test.mjs "checkpoint refuses with nothing written", five cases with exit 2 and no file, event or backup changed, and the mutation check that sets WRITTEN_AHEAD_MS to Infinity, 2026-09-19)
- [ ] the owner reports the maintain minutes for one day before and one day after, recorded in this file as owner-reported counts

## Notes

Design first: which parts of the maintain skill are mechanical (indexes, handoff block, status line) and which need judgment (lessons, decisions). Only the mechanical parts move into checkpoint.

Built 2026-09-19 (decision entry 2026-09-19-records-are-written-at-checkpoint-time-m-554d). Item 5 waits for the owner pass at the end (docs/REPORT_CARD.md): the owner said on 2026-09-18 they will time one day first, so no before count exists yet.
