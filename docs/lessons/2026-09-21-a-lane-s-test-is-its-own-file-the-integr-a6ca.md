# A lane's test is its own file; the integrating gate is the whole suite

Kind: Living. Lesson entry.

- **ID:** 2026-09-21-a-lane-s-test-is-its-own-file-the-integr-a6ca
- **Status:** accepted
- **Date:** 2026-09-21

## What broke

The first real dispatch (B38) changed `import` and `new-skill` from write-on-first-run to preview-by-default with `--apply` (B54). The lane reported 197 checks passing in `scripts/skilliton.test.mjs`, the only test file its brief named, and its worktree was clean and LANE DONE. Both gates the integrating session ran on the lane branch (that test file and lint) passed too.

The full suite on the merged tree failed one step of 57: `node scripts/demo-day.mjs` stopped with "new-skill did not write the skill" and printed the preview text. Three rehearsal scripts (`scripts/rehearsals/fork.mjs`, `machine.mjs`, `company-release.mjs`) had the same call and would have failed the next time they ran.

## The mechanism

A lane is bounded on purpose: its brief lists the files it may touch and one test command, and the lane write guard keeps it inside them. That bound is what lets two lanes run without stepping on each other, and it is also why a lane cannot see who else calls the command it changed. `demo-day.mjs` and the rehearsals live outside every lane's files, are not imported by the command's own test, and are only reached by the suite steps that run them end to end. From inside the lane, the contract change was complete and green; from the whole repository, four callers still held the old contract.

The integrating session's gate on the lane branch repeated the lane's own test and lint, which repeats the lane's blind spot. Only the whole-suite run on the merged tree, which is what CI would have run, saw it.

## The fix

`--apply` added to the four callers (commit on `main` after the merge of efb136a), and to the three guide examples (README.md, docs/HOW-IT-WORKS.md, docs/OWNER_GUIDE.md) plus the two contract rows in docs/CONTRACTS.md. Before the fix, `grep -rn '"new-skill"\|"import"' scripts` listed every script caller in one line each; that grep is the check the lane could not run because the files were outside its bound.

## The rule

When a lane changes a command's contract (its flags, its default action, its exit codes), the integrating session greps the whole repository for the command's callers before merging, and its gate on the merged tree is the full suite, never the lane's own test command again. The lane's test proves the change; the suite proves the callers.

## What now enforces it

The full offline suite on the merged tree, run as one scripted pass with every step's exit status read on its own (scratchpad `suite13.sh` this time; CI runs the same 63 steps on the push). Nothing yet makes the merge-back step itself grep for callers; `dispatch merge` could print the commands a lane's diff touched and every file that names them, and that is a candidate for the dispatch skill's merge checklist rather than a new gate.
