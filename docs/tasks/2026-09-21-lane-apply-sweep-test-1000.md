# Task: Lane apply-sweep-test

Kind: Living. Task record.

- **ID:** 2026-09-21-lane-apply-sweep-test-1000
- **State:** merged
- **Branch:** lane/sweep-0921
- **Owner:** unassigned
- **Updated:** 2026-09-22T02:30:19.759Z

## Request

LANES.md, dispatched 2026-09-21: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N4. [FEATURE] B47: the --apply sweep as a committed test: scripts/prepare.test.mjs: in a prepared fixture, every command that takes --apply is run with --apply and no target, and the test asserts exit 2 with an unchanged tree for each form that is missing an argument, and exit 0 with an unchanged tree for harness, index, migrate and prepare; the list of forms is in the test with one line per command

## Decisions

not yet written

## Checkpoints

### 2026-09-22T02:08:27.510Z

- **State:** N4 done: the --apply sweep test is committed
- **Evidence:** node scripts/prepare.test.mjs exit 0 (42 pass, 18 new); node scripts/lint.test.mjs exit 0
- **Next:** hand off to the integrating session for merge
- **Git:** lane/sweep-0921 @ 63a527c, 0 uncommitted

## Handoff

- **State:** N4 done: the --apply sweep test is committed. Evidence: node scripts/prepare.test.mjs exit 0 (42 pass, 18 new); node scripts/lint.test.mjs exit 0.
- **Next:** hand off to the integrating session for merge
- **Blocked:** nothing
- **Watch out:** nothing known
