# A docs-only branch still needs the generated-records check

Kind: Living. Lesson entry.

- **ID:** 2026-09-23-a-docs-only-branch-still-needs-the-gener-d243
- **Status:** accepted
- **Date:** 2026-09-23

## What broke

After the records docs branch merged (e90c969), `node scripts/living-docs.mjs --check` failed on main: the milestone table in docs/STATUS.md was stale against PLAN.md section 7. It showed up first in another lane's full check run, as two failures that were nobody's regression.

## The mechanism

scripts/living-docs.mjs generates STATUS's milestone table from PLAN.md section 7. The branch edited PLAN.md and did not run `--apply`; a docs-only branch skipped the full gate because it changed no code.

## The fix

19d0f48 regenerated the table on main (`node scripts/living-docs.mjs --apply`).

## The rule

A branch that edits PLAN.md runs `node scripts/living-docs.mjs --apply` before it commits, and a docs-only branch runs the full gate before it merges like any other; generated records make docs changes code changes.

## What now enforces it

The check is a CI step ("Living records stay short and generated") and in `node scripts/checks.mjs`, so a push cannot carry the drift; the lane brief for a docs branch should name the command (not yet in the dispatch skill).

