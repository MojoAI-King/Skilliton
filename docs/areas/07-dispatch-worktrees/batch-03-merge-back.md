# Merge-back and main-only paths

Kind: Living. Batch record. Area [07-dispatch-worktrees](AREA.md).

- **Type:** build
- **Goal:** Lanes cannot write the shared records, and their own records come back to main in one step.
- **Depends on:** 07-01
- **Advances:** M11
- **Estimated sessions:** 2

## Acceptance

- [x] a guardrails rule refuses writes to the main-only paths inside a lane, with a fixture test (evidence: packs/base/plugins/guardrails/hooks/lane-write-guard.mjs on Write, Edit, MultiEdit and NotebookEdit, with the lane's own task, decision and lesson folders as the exception; bash scripts/guardrails.test.sh RESULT PASS 538 checks on 2026-09-20, 15 of them red against an always-allow stub)
- [x] skilliton dispatch merge integrates lane task records and proposed entries into main (evidence: dispatch merge in workflow 0.12.0 reads what each lane branch committed under the task, decision and lesson folders, writes the new ones into the integration working tree and commits nothing; node --test scripts/dispatch.test.mjs 22 of 22 on 2026-09-20)
- [x] a conflict report names what did not merge, with a test (evidence: three classes, brought back, already here and conflict, plus the uncommitted-lane and no-LANE-DONE warnings, all of which exit 1; two mutations, writing conflicts anyway and dropping the linked-worktree refusal, each turned the suite red on 2026-09-20)

## Notes

Exit 1 covers the two warnings as well as a conflict, which goes one step past the batch's wording on purpose: a lane with uncommitted work or without LANE DONE means the merge-back is incomplete, and exit 0 would round that up. Two lanes committing the same path with different content is a conflict rather than last writer wins, for the same reason.

The write guard has one limit, stated in its header, in each refusal and in docs/CONTRACTS.md section 17: it sees the assistant's own file-writing tool calls and cannot intercept a script writing through Bash. It bounds the assistant, not the worktree.
