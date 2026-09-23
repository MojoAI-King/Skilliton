# A new lint ratchet is merged last, or every earlier lane rebases onto it

Kind: Living. Lesson entry.

- **ID:** 2026-09-23-a-new-lint-ratchet-is-merged-last-or-eve-3323
- **Status:** accepted
- **Date:** 2026-09-23

## What broke

The code-clarity lane added scripts/lint-shape.test.mjs (160-character lines, 80-line functions, pinned at that day's counts). Three lanes merged before it had added long lines and grown two functions, so the rebased lane failed eight shape problems that no lane had caused on its own.

## The mechanism

A ratchet pinned on one tree measures every later tree. Code merged between the pin and the merge moves the counts; the pin may only go down.

## The fix

1d4e44f on the lane after its rebase: the long lines wrapped, checkpoint's `run` and `runMaintain` split into named helpers, two pins lowered, none raised.

## The rule

Merge a lane that adds a ratchet before the lanes that add code, or budget one fix round for it at the end. Never raise a pin to make a merge pass; lower it when the count drops.

## What now enforces it

scripts/lint-shape.test.mjs refuses a stale pin in both directions (a raised pin fails as "lower the pin", a count over the pin fails as a violation), and CI runs it on every push.

