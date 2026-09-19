# Split core.mjs and size ceilings

Kind: Living. Batch record. Area [06-clean-code](AREA.md).

- **Type:** build
- **Goal:** Commands live in their own files and no runtime file exceeds a stated size.
- **Depends on:** 06-01
- **Advances:** M2
- **Estimated sessions:** 2

## Acceptance

- [ ] the commands in lib/core.mjs move into commands/ files following commands/gate.mjs, with no behavior change
- [ ] a test fails when any runtime file exceeds the stated line count, with a self-test
- [ ] the full offline suite passes after the move

## Notes

None yet.
