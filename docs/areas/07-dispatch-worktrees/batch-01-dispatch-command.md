# The dispatch command

Kind: Living. Batch record. Area [07-dispatch-worktrees](AREA.md).

- **Type:** build
- **Goal:** skilliton dispatch reads the lanes (or the notes), creates the worktrees, runs the lane setup and writes the lane briefs, previewable and undoable.
- **Depends on:** none
- **Advances:** M11
- **Estimated sessions:** 2

## Acceptance

- [x] the dispatch skill and the config's dispatch section (lane root, main-only paths, lane setup) exist and are rehearsed (evidence: workflow plugin skill dispatch; scripts/rehearsals/projects.mjs, PASS in the suite run of 2026-09-18)
- [x] skilliton dispatch --apply creates one worktree per lane with git worktree add under the lane root, and --preview shows the plan first (evidence: scripts/dispatch.test.mjs, the preview test and the one-worktree-per-lane test, 14 of 14 on 2026-09-20)
- [x] each lane gets a brief file with its scope, its bound and the main-only paths it must not touch (evidence: LANE_BRIEF.md written by applyDispatch, checked by the brief test in scripts/dispatch.test.mjs)
- [x] tests with a fixture repository cover create, preview and the refusal when a lane's branch exists (evidence: scripts/dispatch.test.mjs builds a fixture repository per test and covers preview, create and every refusal, 14 of 14 on 2026-09-20)

## Notes

Built on 2026-09-20 in workflow 0.11.0: `runtime/lib/dispatch.mjs` parses `LANES.md`, plans and applies; `runtime/commands/dispatch.mjs` is the command; the contract is docs/CONTRACTS.md section 17.

What is not in this batch: undoing a dispatch, and collecting the lane reports. The goal line above says "previewable and undoable" and only the preview half shipped. Undo belongs with `dispatch collect` in 07-03; if it is not in a batch by the time area 07 is next picked up, add it.
