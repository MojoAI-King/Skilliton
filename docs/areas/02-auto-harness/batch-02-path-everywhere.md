# The command on the path everywhere

Kind: Living. Batch record. Area [02-auto-harness](AREA.md).

- **Type:** build
- **Goal:** skilliton is found in every supported client's terminal, or the harness text says exactly where it is.
- **Depends on:** 01-01 (report whether the path was set after join)
- **Advances:** M7; B30
- **Estimated sessions:** 1

## Acceptance

- [x] the workflow plugin's shell path in Claude Code terminals confirmed by running which skilliton in a live session, filed (evidence: evidence/live/2026-09-19-which-skilliton-in-a-session.md, the join launcher resolves and no plugin bin was on the PATH of a session begun before the install; evidence/live/2026-09-19-path-in-a-new-session.md, a headless session begun after the install has the three plugin bin folders on PATH behind the launcher, with the workflow SessionStart hooks in the stream)
- [x] the join launcher works on macOS and Linux (tests exist for the file it writes; the live run confirms the shell finds it) (evidence: scripts/join.test.mjs executes the written launcher, on macOS here and on Linux in CI; the live session on this machine found it first on PATH, evidence/live/2026-09-19-which-skilliton-in-a-session.md)
- [x] a .cmd launcher for Windows exists with a test, or the Windows doc says why not (evidence: runtime/lib/join.mjs launcherCmdText, written on win32 and removed by undo; three tests in scripts/join.test.mjs with the platform injected, 39 of 39; docs/WINDOWS.md says it has not been run on Windows, which is the owner pass with 03-02)
- [x] the harness template's if-not-found sentence is rewritten from what was measured (evidence: packs/base/plugins/workflow/templates/harness.md names the launcher as the route a session resolves first and the plugin bin as present in a session started after the install, both measured; migrated into CLAUDE.md and AGENTS.md here by receipts 0100-instructions-4a1e22b6073c and 6cc3ea2ffa20)

## Notes

The Windows run of the .cmd launcher is the owner's, with 03-02 (docs/REPORT_CARD.md, Owner pass at the end).

The gap seen on 2026-09-18: skilliton was not on the shell path in this repository's session; the runtime had to be run by its full path.
