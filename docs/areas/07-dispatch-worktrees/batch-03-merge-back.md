# Merge-back and main-only paths

Kind: Living. Batch record. Area [07-dispatch-worktrees](AREA.md).

- **Type:** build
- **Goal:** Lanes cannot write the shared records, and their own records come back to main in one step.
- **Depends on:** 07-01
- **Advances:** M11
- **Estimated sessions:** 2

## Acceptance

- [ ] a guardrails rule refuses writes to the main-only paths inside a lane, with a fixture test
- [ ] skilliton dispatch merge integrates lane task records and proposed entries into main
- [ ] a conflict report names what did not merge, with a test

## Notes

None yet.
