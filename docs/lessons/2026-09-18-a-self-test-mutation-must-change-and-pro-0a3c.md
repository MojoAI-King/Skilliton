# A self-test mutation must change and prove the same line

Kind: Living. Lesson entry.

- **ID:** 2026-09-18-a-self-test-mutation-must-change-and-pro-0a3c
- **Status:** accepted
- **Date:** 2026-09-18

## What broke

On 2026-09-18 the offline suite's `node scripts/report-card.mjs --self-test` step failed with "a stale batch table in an area is NOT caught", the first time a batch file under docs/areas/ carried a real ticked item ahead of an unticked one. The same step had passed three hours earlier on the same code.

## The mechanism

The self-test case proved the stale-table check by ticking the first unticked acceptance item in the first batch file and then appending `(evidence: the self-test)` to the first ticked item. While no item was ticked, those were the same line. Once batch 01-01 item 1 was ticked for real, the evidence went onto item 1 (which already had some) and the freshly ticked item 2 had none, so the check failed on "a ticked item does not end with (evidence: ...)" instead of the stale-table message the case expected. The mutation depended on the state of the data it copied, not only on the check it was proving.

## The fix

`scripts/report-card.mjs`, the "a stale batch table in an area" case: one replacement that ticks the item and appends the evidence on the same line (`/^- \[ \] (.+)$/m` to `- [x] $1 (evidence: the self-test)`). Self-test 9 of 9, `node scripts/report-card.test.mjs` and `--check` green afterwards.

## The rule

A self-test mutation must describe the exact line it changes and put every part of the change on that line, so that the case proves the same thing whatever the real files look like on the day. A mutation that finds "the first X" twice assumes both are the same line, and that assumption is only true until the data moves.

## What now enforces it

The corrected case itself: it now fails only when the stale-table check is broken. Nothing checks the other cases for the same shape of assumption beyond reading them; the suite step is the tripwire, as it was here.
