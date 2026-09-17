# Task: B25: a handoff Written time in the future is reported, not trusted

Kind: Living. Task record.

- **ID:** 2026-09-17-b25-a-handoff-written-time-in-the-future-1de1
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-17T16:08:07.143Z

## Request

not yet written

## Acceptance criteria

- [ ] status and the session start report a Written time more than five minutes later than now as needing attention on an integration branch, instead of calling the handoff current
- [ ] a Written time within five minutes ahead is still accepted, for clocks that differ between machines
- [ ] a lifecycle test reproduces the measured case (a future time with newer uncommitted changes) and a mutant without the check fails it
- [ ] the maintain skill says to read the Written time from the clock; the workflow plugin version, CONTRACTS and the backlog agree

## Decisions

not yet written

## Checkpoints

### 2026-09-17T16:08:07.019Z

- **State:** Built: handoffCheck reports a Written time more than five minutes ahead of the clock; maintain skill reads the clock; workflow 0.6.1; CONTRACTS section 3 and the status exit list updated; B25 archived
- **Evidence:** lifecycle.test.mjs 32 of 32, a copy without the check fails 1; full offline suite 31 of 31 steps exit 0 (rename: 1 known macOS skip), strict validation on 2.1.274
- **Next:** commit; publish with the rest when the owner decides the push
- **Git:** main @ 171d773, 9 uncommitted

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
