# Task: B26: a test keeps the IT allow list matched to the code

Kind: Living. Task record.

- **ID:** 2026-09-17-b26-a-test-keeps-the-it-allow-list-match-15b8
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-17T18:11:15.454Z

## Request

not yet written

## Acceptance criteria

- [ ] Every program the runtime starts (child_process calls, wrappers included) and every program the hook scripts, the plugin launcher and the join launcher start is extracted from the code; the test fails when one is missing from docs/IT-ALLOWLIST.md section 1, and when section 1 lists a program nothing starts unless an exception says why
- [ ] Writes outside a repository are measured: a scenario under an empty home folder runs the commands and hooks that write there, and the test fails on any written path that section 2 does not list
- [ ] Network: the test fails when the plugins contain network code or a git command that contacts a remote which section 4 does not name
- [ ] The self-test mode proves each check fails on known-bad input: an unlisted program added to a hook, a spawn added to the runtime, an undocumented write, a network import
- [ ] Wired into .github/workflows/checks.yml and docs/MAINTAIN.md step 2; docs/IT-ALLOWLIST.md no longer says no test keeps it matched

## Decisions

not yet written

## Checkpoints

### 2026-09-17T18:06:22.519Z

- **State:** B26 is built: scripts/inventory.mjs reads the shell and JavaScript code, scripts/allowlist.test.mjs checks docs/IT-ALLOWLIST.md against it, and the document gained the four programs and one path it was missing
- **Evidence:** node scripts/allowlist.test.mjs passes (42 JavaScript files, 8 scripts, 349 paths written in an empty home folder); --self-test passes 16 of 16; join, release, skilliton and security-evidence tests still pass after the stand-in change; docs, names and scrub checks pass
- **Next:** B28: the small-footprint test
- **Git:** main @ 5acf0ad, 7 uncommitted

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
