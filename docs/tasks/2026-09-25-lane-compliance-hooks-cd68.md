# Task: Lane compliance-hooks

Kind: Living. Task record.

- **ID:** 2026-09-25-lane-compliance-hooks-cd68
- **State:** merged
- **Branch:** lane/compliance-hooks-0925
- **Owner:** unassigned
- **Updated:** 2026-09-25T07:37:14.094Z

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

### 2026-09-25T07:03:08.000Z

- **State:** Reconciliation done as a second N5 commit. The compliance-runtime lane (N2/N3) merged to main and this branch was rebased onto it before this checkpoint; the first N5 commit's guessed `compliance.mjs` seam (proposeScope/complianceSummary/writeSheet with an invented shape) is now replaced end to end with the real `compliance-scope.mjs`/`compliance-sheet.mjs` (`proposeScope`, `writeProposal`, `readProposal`, `readScope`, `ComplianceRefusal` from compliance-scope.mjs; `sheetStatus`, `writeSheet` from compliance-sheet.mjs), read directly rather than trusted from a paraphrase. `session-hooks.mjs` (the "Leftovers for other lanes" item from the first checkpoint) now has `"compliance"` in `BLOCK_ORDER` after `"security"` and `compliance: "Compliance"` in `BLOCK_LABELS`, so the session-start block prints the line, not only `skilliton status`. The waiting/scope+sheet wording matches the real module's shapes: recordable frameworks compared by id against `scope.json`, never by `proposal.generatedAt`; quiet (ok) when a proposal has no recordable framework; `sheetStatus`'s `current`/`stale`/`missing` state reported verbatim. `project-files.mjs`'s `complianceCheck` and `maintain.mjs`'s `complianceSheetStep` both load `compliance-sheet.mjs` with a dynamic `import()` rather than a static one, discovered necessary because compliance-sheet.mjs itself statically imports `evaluateSecurity` from `security.mjs`; a static import chain down to it broke `scripts/lifecycle.test.mjs`'s existing cross-lane test that swaps in a `security.mjs` missing that export, turning what should be one check's degradation into a crash of the whole CLI. Fixed by mirroring `lifecycle.mjs`'s own `loadOptional` philosophy (defer the load, catch a failure, degrade that one check) instead of a top-of-file import.
- **Evidence:** every check and test file item 7 of the reconciliation named, run individually and read by exit code, all exit 0: `node scripts/lint.test.mjs`; `node scripts/lint-shape.test.mjs`; `node scripts/checks.mjs --only "Dead code"`; `bash scripts/scrub-check.sh`; `node --test scripts/prepare-compliance.test.mjs scripts/lifecycle-compliance.test.mjs` (rewritten against the real modules, no more stubs); `node --test scripts/lifecycle.test.mjs` (59/59, after removing the obsolete `HAS_COMPLIANCE` stub-presence conditional and fixing the doubled `compliance: compliance:` prefix in one not-run assertion); `node --test scripts/rename.test.mjs` (13/13, 1 skipped as expected, after correcting a migrated-project fixture's expected counts from "0 missing" to "1 missing" now that a real proposal.json is genuinely drafted); `node --test scripts/prepare.test.mjs scripts/migrate.test.mjs scripts/records.test.mjs scripts/root-and-handoff-settings.test.mjs scripts/path-form.test.mjs` (76/76, after adding `.skilliton/compliance/proposal.json` to `LAYOUT_FILES` and updating five create/write counts from 19/20 to 20/21); `node --test scripts/maintain-due.test.mjs scripts/record-header.test.mjs scripts/compliance-scope.test.mjs scripts/compliance-sheet.test.mjs scripts/compliance-words.test.mjs scripts/allowlist.test.mjs scripts/write-sites.test.mjs scripts/footprint.test.mjs scripts/packs.test.mjs scripts/skilliton.test.mjs` and `node scripts/compliance-words.test.mjs --self-test`, all pass; `scripts/footprint.test.mjs` needed `DYNAMIC_IMPORTS` updated for the new dynamic imports in `maintain.mjs` (3 to 4) and `project-files.mjs` (0 to 1, newly listed), both explained inline; `node --test scripts/maintain-security-collectors.test.mjs` (4/4, its compliance test rewritten against the real CLI and `writeSheet`).
- **Next:** none remaining from this lane's scope; ready to merge.
- **Git:** lane/compliance-hooks-0925 @ 75cc642 before this checkpoint's commit, 11 uncommitted.

## Handoff

- **State:** N5 reconciled against the real, now-merged compliance-runtime lane (compliance-scope.mjs, compliance-sheet.mjs). Two commits on this branch: the first against a guessed seam, the second replacing that seam end to end with the real modules, wiring session-hooks.mjs (BLOCK_ORDER/BLOCK_LABELS), and fixing every test the change in behavior touched (lifecycle.test.mjs, rename.test.mjs, prepare.test.mjs, footprint.test.mjs), plus the two new compliance test files rewritten against the real modules. Every check named in the reconciliation task ran individually and exited 0; see this record's second checkpoint for the full list.
- **Next:** none remaining from this lane's scope; ready to merge.
- **Blocked:** nothing
- **Watch out:** `project-files.mjs`'s `complianceCheck` and `maintain.mjs`'s `complianceSheetStep` load compliance-sheet.mjs with a dynamic `import()`, not a static one, on purpose: compliance-sheet.mjs statically imports `evaluateSecurity` from security.mjs, and a static import chain down to it would fail the whole module (every lifecycle check, or all of maintain) the moment a build's security.mjs lacks that export, rather than degrading only the compliance step. Keep it dynamic if either file is touched again.
