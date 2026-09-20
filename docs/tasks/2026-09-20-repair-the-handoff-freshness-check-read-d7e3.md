# Task: Repair: the handoff freshness check read its own write as later work

Kind: Living. Task record.

- **ID:** 2026-09-20-repair-the-handoff-freshness-check-read-d7e3
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-20T05:33:11.504Z

## Request

CI run 35491126289 failed on 3896fcb, the wave 4 maintenance commit: the handoff check reported two files the same checkpoint wrote as changes made after the note

## Acceptance criteria

- [ ] the mechanism is stated, not guessed: a minute-granularity Written line compared against millisecond file times over a write that straddles a minute boundary
- [ ] a failing-first test reproduces the CI assertion and passes after the fix, and pins the window so it cannot be widened silently
- [ ] the window is in the handoff contract and the lesson is recorded with its enforcement
- [ ] the offline suite passes and CI is green again on main, every step read

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
