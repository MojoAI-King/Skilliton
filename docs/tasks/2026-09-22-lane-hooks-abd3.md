# Task: Lane hooks

Kind: Living. Task record.

- **ID:** 2026-09-22-lane-hooks-abd3
- **State:** merged
- **Branch:** lane/hooks-0922
- **Owner:** unassigned
- **Updated:** 2026-09-23T08:37:19.478Z

## Request

LANES.md, dispatched 2026-09-22: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N4. [TOUCH] The stop hook asks for a checkpoint on a clean tree right after the checkpoint was committed: packs/base/plugins/workflow/runtime/lib/session-hooks.mjs (evaluateStop, line 24 onward; the fingerprint is head plus porcelain, lib/journal.mjs line 252), a new scripts/stop-clean-tree.test.mjs: measured tonight on main 4223af0, where a checkpoint was taken, its records committed, and the next stop was held with "the working tree has changed since the last checkpoint" although `git status` was empty. Decision for the lane to implement and record as a proposed decision entry: when the working tree is clean (no porcelain lines) the reminder does not fire, and `why` says the tree is clean and the commits since carry their own messages; a dirty tree behaves exactly as today. Tests: the measured sequence (checkpoint, commit, clean tree, stop) does not block; a dirty tree after a checkpoint and past minMinutes still blocks; a clean tree with a merge since the checkpoint does not block (maintenance has its own hold); a mutation check proves the new test fails when the clean-tree branch is removed.
- [x] N5. [TOUCH] The release skill runs the checks again after the manifest is committed and before it signs (B64): packs/base/plugins/workflow/skills/release/SKILL.md step 2: after `release create --apply` and the manifest commit, the full check list runs again on that commit and its exit status is read before `release sign`; say why in one sentence (the manifest is itself a change to the tree; on 2026-09-22 it alone broke a check that copies the repository). If a test reads the skill's steps (grep scripts/ for "release/SKILL.md"), extend it in a new file rather than a pinned one.

## Decisions

not yet written

## Checkpoints

### 2026-09-22T22:49:57.844Z

- **State:** N4 done: evaluateStop gives no checkpoint reminder on a clean tree; a dirty tree as before; proposed decision entry filled
- **Evidence:** node --test scripts/stop-clean-tree.test.mjs: 5 pass 0 fail (incl. mutation check); node scripts/lifecycle.test.mjs: 59 pass 0 fail; lint, deadcode, names, docs, allowlist, footprint, scrub-check exit 0; audit 0 findings
- **Next:** N5: the release skill reruns the checks after the manifest commit, before release sign
- **Git:** lane/hooks-0922 @ 4feda6c, 6 uncommitted

### 2026-09-22T22:50:50.407Z

- **State:** N5 done: release skill step 2 reruns the full check list on the manifest commit and reads its exit status before release sign; no test in scripts/ reads release/SKILL.md, so no test file was needed
- **Evidence:** grep -rln release/SKILL.md scripts: no match; packs.test, docs.test, names.test, lint.test, scrub-check exit 0
- **Next:** full check list via node scripts/checks.mjs, then LANE_REPORT.md
- **Git:** lane/hooks-0922 @ 07195b1, 2 uncommitted

## Handoff

- **State:** N5 done: release skill step 2 reruns the full check list on the manifest commit and reads its exit status before release sign; no test in scripts/ reads release/SKILL.md, so no test file was needed. Evidence: grep -rln release/SKILL.md scripts: no match; packs.test, docs.test, names.test, lint.test, scrub-check exit 0.
- **Next:** full check list via node scripts/checks.mjs, then LANE_REPORT.md
- **Blocked:** nothing
- **Watch out:** nothing known
