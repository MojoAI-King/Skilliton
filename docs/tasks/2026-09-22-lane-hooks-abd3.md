# Task: Lane hooks

Kind: Living. Task record.

- **ID:** 2026-09-22-lane-hooks-abd3
- **State:** in-progress
- **Branch:** lane/hooks-0922
- **Owner:** unassigned
- **Updated:** 2026-09-22T22:43:49.371Z

## Request

LANES.md, dispatched 2026-09-22: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [ ] N4. [TOUCH] The stop hook asks for a checkpoint on a clean tree right after the checkpoint was committed: packs/base/plugins/workflow/runtime/lib/session-hooks.mjs (evaluateStop, line 24 onward; the fingerprint is head plus porcelain, lib/journal.mjs line 252), a new scripts/stop-clean-tree.test.mjs: measured tonight on main 4223af0, where a checkpoint was taken, its records committed, and the next stop was held with "the working tree has changed since the last checkpoint" although `git status` was empty. Decision for the lane to implement and record as a proposed decision entry: when the working tree is clean (no porcelain lines) the reminder does not fire, and `why` says the tree is clean and the commits since carry their own messages; a dirty tree behaves exactly as today. Tests: the measured sequence (checkpoint, commit, clean tree, stop) does not block; a dirty tree after a checkpoint and past minMinutes still blocks; a clean tree with a merge since the checkpoint does not block (maintenance has its own hold); a mutation check proves the new test fails when the clean-tree branch is removed.
- [ ] N5. [TOUCH] The release skill runs the checks again after the manifest is committed and before it signs (B64): packs/base/plugins/workflow/skills/release/SKILL.md step 2: after `release create --apply` and the manifest commit, the full check list runs again on that commit and its exit status is read before `release sign`; say why in one sentence (the manifest is itself a change to the tree; on 2026-09-22 it alone broke a check that copies the repository). If a test reads the skill's steps (grep scripts/ for "release/SKILL.md"), extend it in a new file rather than a pinned one.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
