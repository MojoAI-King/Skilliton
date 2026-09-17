# A commit message said every suite passed after a late wording change broke one test

Kind: Living. Lesson entry.

- **ID:** 2026-09-16-a-commit-message-said-every-suite-passed-6d54
- **Status:** accepted
- **Date:** 2026-09-16

## What broke

The first local rename commit said every offline suite passed. The independent review ran the suites at that commit and found `scripts/migrate.test.mjs` failing one test. The commit was never pushed.

## The mechanism

The full suite ran and passed; then a refusal message in `runtime/lib/migrations.mjs` was reworded (while fixing a path the scripted rename had changed wrongly) and the commit was made after running only the names and docs checks. The test matched the old wording.

## The fix

The test now matches the new wording, and the whole suite was run again after the last change before the commit was rewritten.

## The rule

A statement that tests pass describes the exact tree being committed: after any edit, run the full suite again, or state which suites ran on which tree.

## What now enforces it

Nothing automatic locally; CI runs every suite on the pushed commit and its result is read before a publish is reported. A local pre-commit run of the full suite is a practice, not a check.
