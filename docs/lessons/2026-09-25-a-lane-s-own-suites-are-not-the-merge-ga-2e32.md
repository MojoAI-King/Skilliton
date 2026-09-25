# A lane's own suites are not the merge gate: run the whole-tree checks at every merge

Kind: Living. Lesson entry.

- **ID:** 2026-09-25-a-lane-s-own-suites-are-not-the-merge-ga-2e32
- **Status:** accepted
- **Date:** 2026-09-25

## What broke

In the compliance batch of 2026-09-25, `scripts/allowlist.test.mjs` was red on `main` from the compliance-skill merge (ca4b52a) until 4f64564, three merges later: the lane's eval fixture starts `bin/skilliton` three times through a variable, and the allow-list table had no row for it. The lane's own suites and the ones I ran at merge (its test, docs, lint, lint-shape) were all green. CI went red on ca4b52a and stayed red for every push after it; I read the conclusions from the forge (`gh run list`) an hour and six pushes later, while writing this batch's lessons. By then a second cause was in the history (B97).

## The mechanism

Two shortcuts, taken to save minutes. At merge I ran the suites the lane report named plus a few checks, not the delivery policy's full run (`node scripts/checks.mjs`, which is what `.skilliton/delivery.json` names and what CI runs): the whole-tree checks (allow list, write sites, dead code, packs, the scrub with `--history-all`) are exactly the ones a lane's own list leaves out, because a lane's list is about what it changed. And after each push I never read the run's conclusion; a green local subset felt like a green push. The cross-project checklist says to read each pushed commit's build conclusion from the forge; I knew the rule and skipped it under time pressure.

## The fix

The allow-list row (4f64564). For the four merges that followed I ran the whole-tree checks on the rebased tree before fast-forwarding, and this entry records the CI reading. The history-scan failure that CI also found is a separate defect with its own row (B97) and remedy.

## The rule

The merge gate is the full run the delivery policy names, on the rebased lane tree, whatever the lane touched; the lane's own suites are in addition, never instead. And a push is not done until the forge's conclusion for that commit has been read: `gh run list` after every push of `main`, red or green, before the next merge. Neither is optional when the batch is late.

## What now enforces it

Instructed, not enforced: the dispatch skill's merge protocol already says "run the full gate", and the checklist already says to read the forge. What would enforce it is a `dispatch merge <lane>` that runs `skilliton gate --policy` on the rebased tree and refuses to fast-forward on red, and a stop-hook line that names the last push whose CI conclusion was never read; neither exists yet. Until then the rule lives here and in the merge checkpoint's evidence line, which now has to name the full run.
