# Rolling maintenance (B35)

Kind: Living. Batch record. Area [01-autopilot-loop](AREA.md).

- **Type:** build
- **Goal:** The records are written as the work goes, so the end-of-day maintain becomes a short reconciliation instead of a 5 to 10 minute ritual.
- **Depends on:** 01-01 for the before measurement (the owner's reported minutes)
- **Advances:** B35; M2
- **Estimated sessions:** 2

## Acceptance

- [ ] skilliton checkpoint --apply also regenerates the indexes (the index command's work) and rewrites the task record's handoff section from the checkpoint
- [ ] a --handoff flag on checkpoint writes the RESUME HERE block of docs/HANDOFF.md from the checkpoint text on main, and the task record on any other branch
- [ ] the maintain skill's end-of-day steps read as reconcile only: each step says what it checks, not what it writes from scratch
- [ ] lifecycle tests cover the new flags, including the refusal when a checkpoint would overwrite a handoff written after it
- [ ] the owner reports the maintain minutes for one day before and one day after, recorded in this file as owner-reported counts

## Notes

Design first: which parts of the maintain skill are mechanical (indexes, handoff block, status line) and which need judgment (lessons, decisions). Only the mechanical parts move into checkpoint.
