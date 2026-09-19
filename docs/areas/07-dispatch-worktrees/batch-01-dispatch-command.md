# The dispatch command

Kind: Living. Batch record. Area [07-dispatch-worktrees](AREA.md).

- **Type:** build
- **Goal:** skilliton dispatch reads the lanes (or the notes), creates the worktrees, runs the lane setup and writes the lane briefs, previewable and undoable.
- **Depends on:** none
- **Advances:** M11
- **Estimated sessions:** 2

## Acceptance

- [x] the dispatch skill and the config's dispatch section (lane root, main-only paths, lane setup) exist and are rehearsed (evidence: workflow plugin skill dispatch; scripts/rehearsals/projects.mjs, PASS in the suite run of 2026-09-18)
- [ ] skilliton dispatch --apply creates one worktree per lane with git worktree add under the lane root, and --preview shows the plan first
- [ ] each lane gets a brief file with its scope, its bound and the main-only paths it must not touch
- [ ] tests with a fixture repository cover create, preview and the refusal when a lane's branch exists

## Notes

None yet.
