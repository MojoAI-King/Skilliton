# Task: Lane security-records

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-security-records-43cb
- **State:** in-progress
- **Branch:** lane/security-records-0924
- **Owner:** unassigned
- **Updated:** 2026-09-24T03:39:48.744Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N10. [TOUCH] B71's CI half: skilliton security status --require-collected (commands/security.mjs, lib/security.mjs) exits 1 and names each collector-backed control (secrets; the delivery policy when .skilliton/delivery.json exists) whose latest record is missing, and 0 when each has a record, reporting stale and expired as words on the line without failing on them (a stale record is refreshed by maintain, a missing one is what CI must not pass); scripts/security-require.test.mjs covers missing, current and stale; the CI step is the main window's: write under Merge-time expectations the exact step (`node scripts/skilliton.mjs security status --require-collected`) and where in .github/workflows/checks.yml it belongs.
- [ ] N11. [FEATURE] B72: evidence a repository already has is ingested as artifacts: skilliton security collect ingest --format <gitleaks|npm-audit|junit> --file <report> [--control <id>] [--reviewer <label>] [--dir <project>] --apply in a new lib/collectors-ingest.mjs (collectors.mjs is 531 lines; the new module stays under 600): reads the report (gitleaks JSON, an array of findings; npm audit --json, vulnerabilities by severity; JUnit XML, tests, failures and errors), refuses a file over 8 MB, a symbolic link, or one it cannot parse (naming the first bad line or element), maps it to the control (gitleaks to SG-SECRETS-IN-SOURCE, npm-audit to SG-DEPENDENCY-RISK, junit to SG-SECURITY-TESTS, unless --control names another), copies the report under .skilliton/private-evidence/ as the artifact, fingerprints it like every other, records observed when the report shows zero findings or failures and gap otherwise with the counts in the note and never a matched value or a secret; the verb is in commands/security.mjs help; scripts/collectors-ingest.test.mjs with a fixture per format, clean and not, and the three refusals.
- [ ] N12. [FEATURE] B78: security findings live in their own file: the generated findings section moves out of the backlog record: lib/security.mjs's findings writer writes the project's docs/SECURITY_FINDINGS.md (security.findingsFile in .skilliton/config.json, default docs/SECURITY_FINDINGS.md; Kind: Reference; wholly generated between the two marker lines) and the backlog record keeps between its own markers one line, a link to that file with the count of open findings; maintain calls the same writer; a migration whose body lives in a new lib/migrations-findings.mjs and is registered by one line at the end of the list in lib/migrations.mjs moves an existing section out of a project's backlog into the new file, idempotent, with a receipt like every other migration; scripts/security-findings.test.mjs covers the write, the backlog line, the migration on a fixture backlog holding the old section, and a second run changing nothing; do not run any of it against this repository's docs/ (main-only): the main window runs skilliton migrate --apply and security findings --apply after the merge.
- [ ] N13. [TOUCH] Assessments recorded for every applicable control with no current record: read .skilliton/security/applicability.json and catalog.json and the report from skilliton security status; for each of the eleven controls the report lists as missing, find the evidence this repository already holds (for example SG-COMMAND-INJECTION: runProgram takes argument lists with no shell, the audit rules and scripts/audit.test.mjs; SG-INPUT-INJECTION: parseArgs refusals, the --since shape check in commands/usage.mjs, the guard's 64 KB cap; SG-SECURITY-TESTS: the guard suites and the two red-team suites; SG-POLICY-CHANGE-REVIEW: the delivery policy signature rule and its test; SG-CHECK-CRITERIA: .skilliton/delivery.json; SG-CHECK-EVIDENCE: releases/*.json manifests hashing their evidence files; SG-ROOT-CAUSE and SG-RECURRING-PATTERNS: docs/lessons entries with their mechanism lines and the LESSONS index; SG-WORKFLOW-IMPROVEMENT: lessons that name the test now enforcing them; SG-SECURITY-LOGGING: the journal and the guard's decision log; SG-DEPENDENCY-RISK: zero dependencies in package.json and scripts/footprint.test.mjs; SG-ACCESS-CONTROL: protected branches, approver signatures on policy commits, the guard's record protection) and record observed with at least one --source (the file the evidence lives in) and one --artifact (a short evidence note per control written under .skilliton/private-evidence/2026-09-24-assessment-<control>.md naming the exact files and test names, no secrets), reviewer "build session 2026-09-24, for the owner to countersign"; where the evidence is thinner than the control asks, record gap saying what is missing rather than observed; SG-SECRETS-IN-SOURCE stays needs-human and gains a record whose note explains the 1766 shape matches in 300 files (which shapes, that they are hashes and fixtures, and what a person must confirm); commit the new record files and never edit an existing record; list every record with its assessment in LANE_REPORT.md.

## Decisions

not yet written

## Checkpoints

### 2026-09-24T03:39:48.744Z

- **State:** N10 done: security status --require-collected exits 1 naming each collector-backed control with no record, 0 when each has one, stale and expired named and passing, invalid exits 2
- **Evidence:** node scripts/security-require.test.mjs 8 of 8 pass; the four security suites 66 of 66 pass; lint and lint-shape pass; this repository reports both records present, stale, exit 0
- **Next:** N12: findings in their own file
- **Git:** lane/security-records-0924 @ bc137fd, 4 uncommitted

## Handoff

- **State:** N10 done: security status --require-collected exits 1 naming each collector-backed control with no record, 0 when each has one, stale and expired named and passing, invalid exits 2. Evidence: node scripts/security-require.test.mjs 8 of 8 pass; the four security suites 66 of 66 pass; lint and lint-shape pass; this repository reports both records present, stale, exit 0.
- **Next:** N12: findings in their own file
- **Blocked:** nothing
- **Watch out:** nothing known
