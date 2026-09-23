# Task: Lane install-fixes

Kind: Living. Task record.

- **ID:** 2026-09-22-lane-install-fixes-da0a
- **State:** in-progress
- **Branch:** lane/install-fixes-0922
- **Owner:** unassigned
- **Updated:** 2026-09-23T01:02:18.465Z

## Request

LANES.md, dispatched 2026-09-22: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N35. [TOUCH] An empty `.skilliton-off` at a repository's root is honored by every workflow hook, not only by auto-prepare: packs/base/plugins/workflow/runtime/commands/hook.mjs, lib/lifecycle.mjs or lib/session-hooks.mjs (whichever decides; lib/auto-prepare.mjs and lib/join.mjs already read the file): measured in the rehearsal that with the file present the session-start hook still offers preparation to an unprepared repository and reports a prepared one as usual, and the stop and prompt hooks behave as without it. Done: with the file present, session-start prints one line saying the repository is left alone by Skilliton's workflow hooks because of `.skilliton-off` and that the guardrails and read guard still run, and nothing else; stop and user-prompt-submit print nothing and record no event; a `skilliton-off` file inside the `.git` folder does the same, as auto-prepare already accepts. Tests for each hook with and without the file.
- [x] N36. [TOUCH] `skilliton doctor` passes a correct marketplace install and reads CLAUDE_CONFIG_DIR: packs/base/plugins/workflow/runtime/commands/doctor.mjs and lib/doctor.mjs: measured in the rehearsal that on a correct `claude plugin marketplace add` plus four installs, doctor exits 1 with "UNVERIFIED base plugins: not checked from an installed copy" and advice that makes no sense on that path, and that it reads only `~/.claude`, so a custom CLAUDE_CONFIG_DIR gets MISSING for the marketplace. Done: when run from an installed copy, doctor compares the installed base plugins with the catalog of the marketplace they came from (`<config dir>/plugins/marketplaces/<marketplace>/.claude-plugin/marketplace.json`) and passes when they match; the config dir is CLAUDE_CONFIG_DIR when set, else `~/.claude`, and doctor says which it read. While in `commands/doctor.mjs`, turn the `run` function's inline `guarded()` closures (about 218 lines, from line 32) into named check functions in an array, with behavior unchanged, proved by the existing doctor tests passing without edits.
- [x] N37. [TOUCH] `lib/fork.mjs` `validateRepo` quotes its value verbatim, so `company init --marketplace-repo 'TOKEN@github.com/o/r'` prints a token typed as a user name: pass the value through the existing `redact()` from lib/preflight.mjs before it reaches any message. Test that a planted value is not printed.
- [x] N38. [TOUCH] The context-hygiene session-start line "SKILLITON_LESSONS not set or file missing; injecting nothing" reads as an error to a newcomer on every session: packs/base/plugins/context-hygiene/hooks/session-start-checklist.sh: print nothing when SKILLITON_LESSONS is unset (an optional personal feature that was never set up), and keep a line, reworded to name the path it could not read, when it is set but the file is missing or unreadable. Test both cases.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
