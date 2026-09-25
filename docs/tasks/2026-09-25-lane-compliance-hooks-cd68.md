# Task: Lane compliance-hooks

Kind: Living. Task record.

- **ID:** 2026-09-25-lane-compliance-hooks-cd68
- **State:** in-progress
- **Branch:** lane/compliance-hooks-0925
- **Owner:** unassigned
- **Updated:** 2026-09-25T05:20:58.311Z

## Request

LANES.md, dispatched 2026-09-25: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N5. [FEATURE] Prepare, session start and maintain: packs/base/plugins/workflow/runtime/lib/prepare.mjs (planPrepareItems :528-547 adds a scope proposal item that calls proposeScope and writes .skilliton/compliance/scope.proposal.json, and writes `compliance.builtByCompany: false` into the drafted config with a comment-free note in the plan output that a person sets it true when the company built the software), packs/base/plugins/workflow/runtime/lib/project-files.mjs (:230-240 the security README gains two sentences on compliance: what the proposal is and how to confirm it), packs/base/plugins/workflow/runtime/lib/lifecycle.mjs (the Project state next to securityCheck :486-501 gains one line: "compliance: proposal waiting for a named confirmation (<n> frameworks): skilliton compliance scope --apply --decided-by <you>" or "compliance: <n> frameworks in scope, sheet <current|stale|missing>: skilliton compliance sheet --apply", nothing when there is no proposal and no scope), packs/base/plugins/workflow/runtime/lib/maintain.mjs (after the findings step :152-206, when a scope exists: writeSheet with apply and report "compliance sheet: <n> rows changed" or "current"), the matching tests (lifecycle, prepare, maintain) with the seam modules stubbed: a project with a proposal shows the waiting line, one with a scope and a stale sheet shows stale, one with neither shows nothing, maintain refreshes and reports the count. Done looks like: the session-start line reads correctly in all three states in the test output.

## Decisions

not yet written

## Checkpoints

### 2026-09-25T05:20:58.311Z

- **State:** N5 done in the 4 named files (prepare.mjs, project-files.mjs, lifecycle.mjs, maintain.mjs) plus new test files prepare-compliance.test.mjs and lifecycle-compliance.test.mjs and additions to maintain-security-collectors.test.mjs; checks green (lint, lint-shape, dead code, scrub-check, and every affected test file run in full)
- **Evidence:** node scripts/lint.test.mjs; node scripts/lint-shape.test.mjs; node scripts/checks.mjs --only "Dead code"; bash scripts/scrub-check.sh; node --test scripts/prepare.test.mjs scripts/prepare-compliance.test.mjs scripts/prepare-interrupt.test.mjs scripts/migrate.test.mjs scripts/records.test.mjs scripts/root-and-handoff-settings.test.mjs scripts/path-form.test.mjs scripts/rename.test.mjs scripts/record-header.test.mjs scripts/lifecycle-compliance.test.mjs scripts/maintain-security-collectors.test.mjs scripts/maintain-due.test.mjs; node scripts/lifecycle.test.mjs -- all green
- **Next:** main window: wire compliance into the session-start hook block (BLOCK_ORDER/BLOCK_LABELS in session-hooks.mjs, out of this lane's file scope) once a lane owns that file; reconcile this lane's guessed compliance.mjs seam contract (proposeScope, complianceSummary, writeSheet shapes, documented in LANE_REPORT.md) against whichever lane actually builds runtime/lib/compliance.mjs
- **Git:** lane/compliance-hooks-0925 @ deaf668, 11 uncommitted

## Handoff

- **State:** N5 done in the 4 named files (prepare.mjs, project-files.mjs, lifecycle.mjs, maintain.mjs) plus new test files prepare-compliance.test.mjs and lifecycle-compliance.test.mjs and additions to maintain-security-collectors.test.mjs; checks green (lint, lint-shape, dead code, scrub-check, and every affected test file run in full). Evidence: node scripts/lint.test.mjs; node scripts/lint-shape.test.mjs; node scripts/checks.mjs --only "Dead code"; bash scripts/scrub-check.sh; node --test scripts/prepare.test.mjs scripts/prepare-compliance.test.mjs scripts/prepare-interrupt.test.mjs scripts/migrate.test.mjs scripts/records.test.mjs scripts/root-and-handoff-settings.test.mjs scripts/path-form.test.mjs scripts/rename.test.mjs scripts/record-header.test.mjs scripts/lifecycle-compliance.test.mjs scripts/maintain-security-collectors.test.mjs scripts/maintain-due.test.mjs; node scripts/lifecycle.test.mjs -- all green.
- **Next:** main window: wire compliance into the session-start hook block (BLOCK_ORDER/BLOCK_LABELS in session-hooks.mjs, out of this lane's file scope) once a lane owns that file; reconcile this lane's guessed compliance.mjs seam contract (proposeScope, complianceSummary, writeSheet shapes, documented in LANE_REPORT.md) against whichever lane actually builds runtime/lib/compliance.mjs
- **Blocked:** nothing
- **Watch out:** nothing known
