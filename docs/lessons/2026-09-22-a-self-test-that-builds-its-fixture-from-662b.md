# A self-test that builds its fixture from the live record breaks the day the record gains the feature

Kind: Living. Lesson entry.

- **ID:** 2026-09-22-a-self-test-that-builds-its-fixture-from-662b
- **Status:** accepted
- **Date:** 2026-09-22

## What broke

The first real `skilliton maintain --apply` on this repository wrote the security findings block into `docs/BACKLOG.md`. On the next full check run, the step "Backlog check can fail" (`node scripts/backlog.test.mjs --self-test`) failed: its case "a findings block in the backlog still passes" was rejected with "the security findings markers must appear once each (found 2 start, 2 end)". Nothing in the backlog check itself was wrong.

## The mechanism

The self-test copies the live `docs/BACKLOG.md` into a temporary folder and appends a synthetic findings block to prove that rows inside the markers are skipped. That was sound while the live file carried no block. The moment the live file gained a real block, the fixture held two, and the check it was proving refused the fixture for the right reason. A fixture built from a live file inherits every feature the live file gains later.

## The fix

`scripts/backlog.test.mjs`, the case "a findings block in the backlog still passes": the mutation strips any existing block between the two markers before appending its own (commit 12c6ab2).

The same day it happened a second time. `scripts/demo-day.mjs` copies this repository as its sample company and cut a release numbered 1.0.0; once this repository shipped 1.0.0, the copy already held `releases/1.0.0.json` and `release create` refused, so the release commit itself went red in CI. The demo now takes the next minor version above the newest manifest its copy holds.

## The rule

A self-test fixture built from a live record must first normalize away the feature it is about to add, or be built from a fixed text instead. Whichever is chosen, say in a comment which live feature the case assumes absent.

## What now enforces it

The two cases themselves (the backlog self-test and the demonstration's derived version), which now runs against the repository's own backlog with its real block present; `scripts/checks.mjs` runs it on every push. Nothing checks the other self-tests for the same shape; the next one that copies a live record should follow this entry.
