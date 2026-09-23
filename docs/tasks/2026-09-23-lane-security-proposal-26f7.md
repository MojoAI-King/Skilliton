# Task: Lane security-proposal

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-security-proposal-26f7
- **State:** merged
- **Branch:** lane/security-proposal-0923
- **Owner:** unassigned
- **Updated:** 2026-09-23T08:37:20.357Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N64. [FEATURE] Maintenance refreshes the collector-backed security records that are missing or stale, never one record per run (field report N44, backlog B71): packs/base/plugins/workflow/runtime/lib/maintain.mjs runMaintain (a new step after the indexes and before the findings block), lib/collectors.mjs and lib/security.mjs only through their exported functions, commands/maintain.mjs for the output, a new test file: done when `maintain --apply` runs `collect secrets` when the SG-SECRETS-IN-SOURCE record is missing or stale and `collect delivery-policy` when SG-CHECK-CRITERIA's is, only for applicable controls and only when the delivery policy exists for the second, with reviewer label `skilliton maintain`; a current record is left alone (a test shows two maintain runs write one record, not two); `maintain` without `--apply` says which it would run; the `tests` collector is never run by maintain (it runs the project's own checks, which can take long and belong to the gate); a collector that cannot run is reported as not run, never as success. Keep maintain.mjs's evaluateMaintain unchanged.
- [x] N65. [FEATURE] Applicability is proposed from what the repository shows, so the owner answers once (field report N43, backlog B70): packs/base/plugins/workflow/runtime/commands/security.mjs (`security applicability --propose [--dir] [--apply]` and `security applicability --accept-proposal --decided-by <label> [--apply]`), a new lib/security-propose.mjs under 300 lines, a new test file: done when `--propose` reads only tracked files (git ls-files, bounded in count and bytes as the secrets collector is) for fixed, listed signals (web frameworks and servers, sign-in and token libraries, session and cookie handling, database and query libraries, a child process or shell use, dependency manifests) and writes `.skilliton/security/applicability-proposal.json` with, per control, `applies`, the signals and up to three example paths that led to it, and a plain reason; the six process controls (SG-CHECK-CRITERIA, SG-CHECK-EVIDENCE, SG-SECURITY-TESTS, SG-ROOT-CAUSE, SG-RECURRING-PATTERNS, SG-WORKFLOW-IMPROVEMENT) and SG-SECRETS-IN-SOURCE, SG-DEPENDENCY-RISK when a manifest exists, and SG-POLICY-CHANGE-REVIEW always apply; `--accept-proposal` records one decision per control through the existing applicability path with rationale "proposed from repository signals: <reason>" and the given label, refuses when the proposal is older than the tracked files it read (stale) or missing, and never overwrites a decision a person already made unless `--replace` is given; on this repository the proposal matches the decisions already recorded in .skilliton/security/applicability.json except where the signals say otherwise, and LANE_REPORT.md lists each difference.

## Decisions

See ../decisions/2026-09-23-applicability-signals-match-import-shape-bcbd.md (N65: applicability signals match
import-shaped code, not bare library names) and ../lessons/2026-09-23-a-whole-tree-content-scan-can-be-invalid-4895.md
(N64: maintain's collector step settles over a few runs, not two, when the security findings step it runs before
rewrites a tracked file the collector itself just scanned).

## Checkpoints

### 2026-09-23T07:52:20.099Z

- **State:** N64 and N65 both implemented, tested and committed on lane/security-proposal-0923
- **Evidence:** node --test scripts/maintain-security-collectors.test.mjs scripts/security-propose.test.mjs scripts/security-evidence.test.mjs scripts/collectors.test.mjs scripts/security-record-refusals.test.mjs scripts/maintain-due.test.mjs (all pass); node scripts/lifecycle.test.mjs (59/59 pass); node scripts/lint.test.mjs, names.test.mjs, docs.test.mjs, skilliton.test.mjs all pass
- **Next:** main window merges this lane per LANE_REPORT.md's merge-time expectations
- **Git:** lane/security-proposal-0923 @ 968369a, 3 uncommitted

## Handoff

- **State:** N64 and N65 both implemented, tested and committed on lane/security-proposal-0923. Evidence: node --test scripts/maintain-security-collectors.test.mjs scripts/security-propose.test.mjs scripts/security-evidence.test.mjs scripts/collectors.test.mjs scripts/security-record-refusals.test.mjs scripts/maintain-due.test.mjs (all pass); node scripts/lifecycle.test.mjs (59/59 pass); node scripts/lint.test.mjs, names.test.mjs, docs.test.mjs, skilliton.test.mjs all pass.
- **Next:** main window merges this lane per LANE_REPORT.md's merge-time expectations
- **Blocked:** nothing
- **Watch out:** nothing known
