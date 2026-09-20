# Task: Maintenance after wave 6: the gate list finding and the parallel promo branch

Kind: Living. Task record.

- **ID:** 2026-09-20-maintenance-after-wave-6-the-gate-list-f-ea3c
- **State:** merged
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-20T21:15:23.724Z

## Request

maintain

## Acceptance criteria

- [x] the hand-typed gate list finding is a lesson entry and a backlog row with its measurement (evidence: docs/lessons/2026-09-20-a-gate-list-typed-by-hand-from-prose-has-ce6a.md and docs/BACKLOG.md B43, both carrying the measurement that the two lists name the same 42 scripts)
- [x] the shared handoff names the parallel task/promo-anatomy worktree so no session cleans or merges it (evidence: the RESUME HERE block written 2026-09-20 17:14 EDT carries it as Watch out)

## Decisions

not yet written

## Checkpoints

### 2026-09-20T21:14:58.364Z

- **State:** Wave 6 is on main at c8bd045 and green; this maintenance pass added the gate list finding as a lesson and B43
- **Evidence:** Every index current before the pass; docs, living-docs --check and backlog all exit 0 after it; the 42 scripts named in docs/MAINTAIN.md step 2 and in checks.yml were extracted and compared, and they match
- **Next:** Wave 7 from docs/REPORT_CARD.md, planned in plan mode with the batch files under docs/areas read first
- **Git:** main @ c8bd045, 4 uncommitted

## Handoff

- **State:** Wave 6 is on main at c8bd045 and green; this maintenance pass added the gate list finding as a lesson and B43. Evidence: Every index current before the pass; docs, living-docs --check and backlog all exit 0 after it; the 42 scripts named in docs/MAINTAIN.md step 2 and in checks.yml were extracted and compared, and they match.
- **Next:** Wave 7 from docs/REPORT_CARD.md, planned in plan mode with the batch files under docs/areas read first
- **Blocked:** nothing
- **Watch out:** A parallel session owns task/promo-anatomy in the sibling worktree ~/Desktop/Skilliton-promo, five commits ahead of main with uncommitted work and a site/ tree that is not on main: do not clean those worktrees or merge that branch
