# The merge-back half of dispatch: the lane's record is committed for it, and a warning is exit 1

Kind: Living. Decision entry.

- **ID:** 2026-09-20-the-merge-back-half-of-dispatch-the-lane-ef33
- **Status:** accepted
- **Date:** 2026-09-20

## Decision

Workflow 0.12.0 finishes the loop `dispatch` opened. Four choices are fixed here.

1. **Dispatch writes and commits each lane's task record**, on the lane branch, inside the lane worktree, before the lane session starts. The record's acceptance criteria are the lane's own items from the lane plan, one criterion per item, carrying the item's number. The brief no longer tells a lane to run `task start`.
2. **`skilliton dispatch merge` collects what each lane committed**, not what its working tree holds, under the project's task, decision and lesson folders. It classifies every file as brought back (main does not have it), already here (identical), or conflict (present and different), and it never overwrites a conflict.
3. **With `--apply` it writes into the integration working tree and commits nothing.** The person reads the diff and commits.
4. **A warning is exit 1, not exit 0.** A conflict, a lane with uncommitted changes, and a lane whose `LANE_REPORT.md` has no `LANE DONE` line each end the run at exit 1, which this repository's exit contract reads as attention. Exit 0 means every lane finished and everything merged clean.

A fifth choice belongs with them, in the guardrails plugin (0.5.0): **a `PreToolUse` hook refuses a write, from inside a lane worktree, to a path the project reserves for its integration branch** (`dispatch.mainOnlyPaths`), with the lane's own task, decision and lesson entries as the exception.

## Why

**The lane's record is committed for it because an instruction is not a mechanism.** The acceptance item says each lane writes its own task record; a brief that asks the lane to run a command is satisfied only if the lane complies, and a test can prove the asking but never the doing. Writing the record in `dispatch --apply` makes the item provable by a test, gives `dispatch merge` something deterministic to collect, and fixes the scope at the moment the plan is read rather than leaving it to a session that may paraphrase it. The owner chose this over the brief's instruction on 2026-09-20.

**The merge reads commits because the brief tells the lane to commit.** A working tree is what a session has in progress; a commit is what it finished. Collecting uncommitted files would bring back half-written records and would race a lane that is still working, and the lane's uncommitted state is reported as a warning rather than silently swept up.

**It writes without committing** for the same reason `prepare` shows its plan first: a merge-back reaches shared records, and the integrating person should see the diff before it becomes history. There is also a practical half: the records that come back are often a lane's proposed decisions, which the integrator edits or rejects, and a commit would make rejecting one a revert.

**A warning is exit 1 because rounding it up to 0 is the failure this repository has a rule against.** A lane with uncommitted work has not finished; a lane with no `LANE DONE` line has not said it finished. Both mean the merge-back is incomplete, and a green exit would say the opposite. Two lanes committing the same path with different content is the same argument: last-writer-wins would silently drop one lane's work, so both are named and neither is written.

**The write guard exists because the brief's bound is prose.** Every lane would otherwise edit the same lines of the same shared status, handoff and decision index, and the merge would be one conflict per lane. The entry-folder exception is not a convenience but a correctness requirement: `docs/` is the first main-only path in a prepared project, and the brief tells the lane to write its task record and to propose entries, which are one file each under those folders. Refusing those would refuse the work the brief asks for.

## Alternatives rejected

- **Ask the lane to run `task start` in its brief** (the wave 4 behavior). Rejected: it cannot be tested, and a lane that skips it leaves the merge with nothing to collect.
- **Merge the lanes' working trees.** Rejected: it races a running lane and brings back unfinished files.
- **Commit the merge-back.** Rejected: the integrator loses the review step exactly where the records are shared, and rejecting a proposed entry becomes a revert.
- **Last writer wins on a conflict.** Rejected: it deletes one lane's work with no trace.
- **Exit 0 with a printed warning.** Rejected by the standing rule that nothing is rounded up to success; a script reading the exit status would call an unfinished batch done.
- **A `git merge` per lane branch instead of a file-level collection.** Rejected for this batch: a lane branch carries the lane's product changes as well as its records, and merging those is the integrator's own review, not a records step. The file-level collection is deliberately narrow and says so.
- **Put the write guard in `guard-bash.sh`.** Rejected: that hook matches on `Bash` and fast-exits unless the command mentions git, and the writes this guard is about come through the file-writing tools.

## Risk

**The guard sees the assistant's own file-writing tool calls and cannot intercept a script writing through Bash.** It bounds the assistant, not the worktree. That limit is stated in the hook's header, in each refusal it prints, and in docs/CONTRACTS.md section 17, because an unstated limit in a guard is worse than no guard: it invites the belief that the worktree is sealed.

**None of this has been run for real.** Both halves are proved by fixture tests over throwaway repositories and by mutations that turn those tests red. No dispatch of two or more live lanes has been run and merged back (B38), so what is proved is the mechanism, not the experience of using it.

The merge is narrow on purpose and a person could expect it to bring back a lane's code. It reports only records, and its preview names every path it would write, which is where that expectation is corrected.

## Reversibility

High for the merge: `dispatch merge` is a new sub-verb behind a parser table, a bare `dispatch` still means plan the lanes, and removing it touches nothing else. Medium for the committed task record: a project that has run a dispatch has lane branches carrying a commit that would not exist under the old behavior, which is additive but visible. The guard is a hook file plus one entry in `hooks/hooks.json` and can be removed by deleting both; a project that has learned to rely on it would lose a bound it never fully had.

## Evidence

`packs/base/plugins/workflow/runtime/lib/dispatch.mjs` and `runtime/commands/dispatch.mjs` (workflow 0.12.0); `packs/base/plugins/guardrails/hooks/lane-write-guard.mjs` and `hooks/hooks.json` (guardrails 0.5.0); docs/CONTRACTS.md sections 11, 17 and 18. `node --test scripts/dispatch.test.mjs` 22 of 22 and `bash scripts/guardrails.test.sh` PASS with 538 checks, both on 2026-09-20; an always-allow stub of the guard turns 15 of those checks red, and two mutations of the merge (writing conflicts anyway, dropping the linked-worktree refusal) each turn the dispatch suite red.
