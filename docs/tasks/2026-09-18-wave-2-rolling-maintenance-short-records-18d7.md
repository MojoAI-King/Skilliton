# Task: Wave 2: rolling maintenance, short records, backlog test

Kind: Living. Task record.

- **ID:** 2026-09-18-wave-2-rolling-maintenance-short-records-18d7
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-19T04:16:20.925Z

## Request

not yet written

## Acceptance criteria

- [ ] 01-02: skilliton checkpoint writes the task handoff bullets, the RESUME HERE block on an integration branch, and the indexes; refusals write nothing; tests prove it
- [ ] 01-02: the handoff and maintain skills and docs/MAINTAIN.md route the mechanical writes to the command and keep judgment steps as a reconciliation
- [ ] 01-03 and 05-02: scripts/living-docs.mjs bounds the RESUME HERE block (24 lines, 4500 bytes), generates the milestone table in docs/STATUS.md from PLAN.md section 7, and bounds the current-state paragraph with an archive
- [ ] 05-01: scripts/backlog.test.mjs enforces the relationship between docs/BACKLOG.md and docs/BACKLOG_ARCHIVE.md and its self-test proves each check can fail
- [ ] The report card records the owner pass at the end and the six batch files carry ticks with evidence
- [ ] The 47-step suite passes, scrub passes on tree and history, CI is green, the wave is pushed

## Decisions

not yet written

## Checkpoints

### 2026-09-19T04:16:20.925Z

- **State:** Wave 2 built: checkpoint writes the task handoff, the RESUME HERE block and the indexes (workflow 0.9.0); living-docs and backlog checks wired into MAINTAIN.md and CI; batch items ticked with evidence; report card regenerated
- **Evidence:** node scripts/lifecycle.test.mjs 38 of 38; node --test scripts/handoff-write.test.mjs 7 of 7; backlog.test.mjs and living-docs.mjs pass with self-tests; report-card.mjs --check current
- **Next:** Run the 48-step suite, scrub the tree and history, commit and push, read the CI steps, then maintain and hand off with checkpoint --handoff
- **Git:** main @ bf65a37, 35 uncommitted

## Handoff

- **State:** Wave 2 built: checkpoint writes the task handoff, the RESUME HERE block and the indexes (workflow 0.9.0); living-docs and backlog checks wired into MAINTAIN.md and CI; batch items ticked with evidence; report card regenerated. Evidence: node scripts/lifecycle.test.mjs 38 of 38; node --test scripts/handoff-write.test.mjs 7 of 7; backlog.test.mjs and living-docs.mjs pass with self-tests; report-card.mjs --check current.
- **Next:** Run the 48-step suite, scrub the tree and history, commit and push, read the CI steps, then maintain and hand off with checkpoint --handoff
- **Blocked:** nothing
- **Watch out:** nothing known
