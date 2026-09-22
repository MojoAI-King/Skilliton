# A clean working tree gets no checkpoint reminder at stop

Kind: Living. Decision entry.

- **ID:** 2026-09-22-a-clean-working-tree-gets-no-checkpoint-8302
- **Status:** proposed
- **Date:** 2026-09-22

## Decision

When the working tree is clean (`git status --porcelain` prints no lines), the Stop hook's checkpoint reminder does not fire, whatever moved HEAD since the last checkpoint or since the session started. The decision's `why` says the tree is clean, so nothing is waiting to be recorded, and that the commits since carry their own messages. A dirty tree is judged exactly as before: fingerprint changed, past `checkpoints.minMinutes`, not yet reminded for this state. The maintenance reminder is unchanged and still holds a stop on an integration branch when a merge landed, on its own.

## Why

The fingerprint the reminder compares is HEAD plus the porcelain status, so the commit that saves a checkpoint's own records changes it. Measured on 2026-09-22 on this repository's main at 4223af0: a checkpoint was taken, its records committed, and the next stop was held with "the working tree has changed since the last checkpoint" although `git status` was empty. A reminder that fires on the very act it asked for teaches everyone to decline it.

## Alternatives rejected

Recording a fresh baseline fingerprint after every commit: the hook sees no commit event, so it would need a Git hook of its own, which is a new install surface. Comparing porcelain only and ignoring HEAD: a dirty tree that also moved HEAD would then be judged on part of its state, changing the dirty case the lane was told to leave alone. Keeping the reminder for a clean tree with a merge: the maintenance reminder already holds that stop on an integration branch, and on a lane branch a merge on a clean tree has nothing uncommitted to record.

## Risk

A session that only commits (never leaves anything uncommitted at a stop) is never asked for a checkpoint, so its task record can fall behind its commits. The commit messages still say what happened, and the session-start block still shows the task's last checkpoint, so the gap is visible there. The merge sentence in the checkpoint reminder now appears only when the tree is also dirty.

## Reversibility

One line in `evaluateStop` (packs/base/plugins/workflow/runtime/lib/session-hooks.mjs); removing it restores the earlier rule, and the mutation check in scripts/stop-clean-tree.test.mjs shows exactly that behavior.

## Evidence

scripts/stop-clean-tree.test.mjs, five tests, all passing on lane/hooks-0922: the rule called directly (clean not reminded, the same window dirty reminded); the measured sequence through the shipped hook does not block; a dirty tree after a checkpoint past minMinutes blocks; a clean tree with a merge since the checkpoint is not held on a non-integration branch and is held by maintenance alone on main; and a mutation check where the clean-tree line is removed from a copy of the plugin and the measured sequence blocks. scripts/lifecycle.test.mjs passes 59 of 59 after six existing merge-sentence and maintenance fixtures were changed to leave one file uncommitted, since they relied on a clean tree being reminded.
