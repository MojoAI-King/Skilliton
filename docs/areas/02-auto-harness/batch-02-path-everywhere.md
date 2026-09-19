# The command on the path everywhere

Kind: Living. Batch record. Area [02-auto-harness](AREA.md).

- **Type:** build
- **Goal:** skilliton is found in every supported client's terminal, or the harness text says exactly where it is.
- **Depends on:** 01-01 (report whether the path was set after join)
- **Advances:** M7; B30
- **Estimated sessions:** 1

## Acceptance

- [ ] the workflow plugin's shell path in Claude Code terminals confirmed by running which skilliton in a live session, filed
- [ ] the join launcher works on macOS and Linux (tests exist for the file it writes; the live run confirms the shell finds it)
- [ ] a .cmd launcher for Windows exists with a test, or the Windows doc says why not
- [ ] the harness template's if-not-found sentence is rewritten from what was measured

## Notes

The gap seen on 2026-09-18: skilliton was not on the shell path in this repository's session; the runtime had to be run by its full path.
