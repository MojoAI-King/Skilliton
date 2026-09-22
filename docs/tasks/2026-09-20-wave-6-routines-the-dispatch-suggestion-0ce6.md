# Task: Wave 6: routines, the dispatch suggestion, docs consolidation, dead code

Kind: Living. Task record.

- **ID:** 2026-09-20-wave-6-routines-the-dispatch-suggestion-0ce6
- **State:** merged
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-20T19:47:34.805Z

## Request

continue you work on the next wave as we get closer to completeling all waves and begin the review

## Acceptance criteria

- [x] 06-04: scripts/deadcode.mjs lists exported symbols with no importer and near-duplicate blocks across the runtime, and every finding is fixed or recorded in the backlog with a reason (evidence: scripts/deadcode.mjs and its self-test, commit cb9da5c; 117 exports with no importer, each one either removed or recorded with its reason in docs/areas/06-clean-code/batch-04-dead-code.md)
- [x] 05-04: docs/README.md reaches every document under docs/, superseded ones move to docs/archive/ with a Kind: Reference label, and scripts/docs.test.mjs fails on an unreachable document with a self-test case (evidence: commit f8b465e; docs/README.md reaches every document, docs/archive/ holds the superseded ones with Kind: Reference, and scripts/docs.test.mjs fails on an unreachable document in its self-test)
- [x] 01-04: a decision entry names the client event each of the three routines uses with the documentation line that confirms it, the compaction snapshot is measured in a live session and filed, and the after-merge maintain suggestion exists with a fixture test (evidence: docs/decisions/2026-09-20-the-client-event-behind-each-of-the-thre-f6c2.md for the three events; live rehearsal L6 for the compaction snapshot; the Stop hook's merge rule with three fixture tests in scripts/lifecycle.test.mjs, commit 6e072b7)
- [x] 07-04: the dispatch suggestion hook exists on the decided event with a fixture test, counting numbered, bulleted and sentence-separated items, with the live sighting named in the report card owner pass (evidence: UserPromptSubmit in the workflow plugin's hooks.json running skilliton hook user-prompt-submit, four fixture tests and two mutation checks over the counting rules, commit 6e072b7. Item 2, the live sighting, is open and named in the report card owner pass)

## Decisions

not yet written

## Checkpoints

### 2026-09-20T19:47:16.659Z

- **State:** Wave 6 is on main at 634da8e and green: the four headless batches built and pushed, then the maintenance pass on top of them
- **Evidence:** Full offline suite 48 of 48 steps exit 0; scrub-check tree and history both PASS; report-card --check exit 0 at 65 of 123; CI 35532803307 (6e072b7) and 35533207494 (634da8e) both success, all 58 steps read
- **Next:** Wave 7 from docs/REPORT_CARD.md, planned in plan mode with the batch files under docs/areas read first
- **Git:** main @ 634da8e, 1 uncommitted

## Handoff

- **State:** Wave 6 is on main at 634da8e and green: the four headless batches built and pushed, then the maintenance pass on top of them. Evidence: Full offline suite 48 of 48 steps exit 0; scrub-check tree and history both PASS; report-card --check exit 0 at 65 of 123; CI 35532803307 (6e072b7) and 35533207494 (634da8e) both success, all 58 steps read.
- **Next:** Wave 7 from docs/REPORT_CARD.md, planned in plan mode with the batch files under docs/areas read first
- **Blocked:** nothing
- **Watch out:** The dispatch suggestion ships on UserPromptSubmit, which has never been seen delivered to a plugin hook (DECISIONS.md O27); one live prompt settles it or the registration comes out
