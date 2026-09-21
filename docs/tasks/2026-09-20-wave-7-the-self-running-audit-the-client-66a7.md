# Task: Wave 7: the self-running audit, the client policy, the meter as a command, and two decisions

Kind: Living. Task record.

- **ID:** 2026-09-20-wave-7-the-self-running-audit-the-client-66a7
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-21T03:26:24.279Z

## Request

Wave 7. Read each batch file under docs/areas/ first and plan only what its acceptance items name. Ask me the owner questions before the plan, not during the build. Commit and push when the wave passes the suite, then maintain, then hand off.

## Acceptance criteria

- [ ] 09-02: the audit runs on changed files with a deterministic result, in a routine, a pre-push hook and the merge gate, each with a fixture test, and its findings land as scoped observations
- [ ] 03-05: docs/CLIENTS.md states the supported-client rule in one sentence and scripts/docs.test.mjs fails when README names a client the matrix does not carry
- [ ] 04-04: skilliton usage wraps the meter with a per-merged-batch scorecard, tested, and docs/USAGE_BASELINE.md says plainly that the window is still a placeholder
- [ ] 03-03 item 1: a decision entry records that hooks in Codex are instructed, not enforced
- [ ] 03-04: a decision entry lists what Cursor reads from its published documentation with retrieval dates, and docs/CLIENTS.md gains a Cursor column marked documented only

## Decisions

not yet written

## Checkpoints

### 2026-09-21T02:39:02.480Z

- **State:** Wave 7 steps 1-5 done: the audit engine, the audit command, the pre-push hook, and the delivery policy/gate split
- **Evidence:** audit.test 21 engine + 16 repository checks exit 0; --self-test 14 mutants exit 0; lint, deadcode, allowlist, gate.test, prepare.test, delivery.test all exit 0; self-audit exit 0 with 6 allowed lines
- **Next:** Step 6: the audit step inside evaluateUpdate, the audit policy field, and three delivery.test cases
- **Git:** main @ a24d8aa, 14 uncommitted

### 2026-09-21T02:53:34.744Z

- **State:** Wave 7 step 6 done: the delivery gate audits the files a push changed, reading them from the archive it already verified against the commit, and rejects a finding. lib/delivery.mjs is 576 lines and no longer pinned (was 885), split into lib/delivery-policy.mjs (228) and lib/delivery-install.mjs (162).
- **Evidence:** node scripts/delivery.test.mjs exit 0, 14 tests 14 pass, including the new case that pushes a planted shell-true flaw and is rejected naming lib/greet.mjs:4, accepts the same line once it carries a marker, and accepts the flaw after an approver-signed policy sets audit.enabled false. node scripts/audit.test.mjs exit 0. node scripts/lint.test.mjs exit 0.
- **Next:** Step 7: the Stop hook audit sentence in lib/session-hooks.mjs and its case in scripts/hook-fixture.test.sh.
- **Git:** main @ a24d8aa, 17 uncommitted

### 2026-09-21T03:18:17.222Z

- **State:** Wave 7 step 9 done: skilliton usage reads the project's meter and prints one row per merged batch. lib/usage.mjs and commands/usage.mjs are new and registered; scripts/usage.test.mjs is new; docs/IT-ALLOWLIST.md names the meter, the pre-push hook and the transcripts it reads; docs/USAGE_BASELINE.md states the window is a placeholder and why. Windows are whole days that tile the calendar, because the meter buckets by day and a per-merge window would count a shared day twice.
- **Evidence:** node scripts/usage.test.mjs exit 0, 19 checks. node scripts/allowlist.test.mjs exit 0. node scripts/lint.test.mjs exit 0. node scripts/docs.test.mjs exit 0 and --self-test exit 0. skilliton usage --limit 3 against the real meter exit 0: 1 batch row from 13 merges, because every merge in this repository landed on 2026-09-16.
- **Next:** Step 10: the Codex and Cursor decision entries, and the CLIENTS.md Cursor column with documented cells only.
- **Git:** main @ a24d8aa, 28 uncommitted

### 2026-09-21T03:26:24.279Z

- **State:** Step 10 done: both decision entries written and indexed, and docs/CLIENTS.md carries a fourth column for Cursor whose every cell is documentation with its URL and the 2026-09-20 retrieval date, never measured. The Codex entry records that plugin_hooks is removed on 0.154.0-alpha.6.2 so every enforced harness line is instructed there, and names 03-03 item 2 as not applicable. The Cursor entry records what Cursor reads from six published pages and the shopping list an adapter would need, with two findings: AGENTS.md and .agents/skills already reach it unchanged, and beforeSubmitPrompt has no context field so the dispatch suggestion has no Cursor route.
- **Evidence:** node scripts/docs.test.mjs exit 0 (4 column(s), 3 with a measured row); --self-test exit 0; lint.test exit 0 (481 files); names.test exit 0; scrub-check PASS (dashes 0, home paths 0); skilliton index --apply exit 0, both entries listed in DECISIONS.md. scripts/docs.test.mjs was corrected in the same change: a cell reading not measured was being counted as a measured row, which would have reported the documentation-only Cursor column as evidence.
- **Next:** Step 11: contracts sections 1, 6, 11, 12 and 14; MAINTAIN step 2 and checks.yml gain the two new test scripts with the B43 two-copies comparison re-run; backlog B20 closed and B17 restated; batch ticks with evidence; report card waves rows and owner-pass bullets; workflow plugin 0.13.0 to 0.14.0.
- **Git:** main @ a24d8aa, 31 uncommitted

## Handoff

- **State:** Step 10 done: both decision entries written and indexed, and docs/CLIENTS.md carries a fourth column for Cursor whose every cell is documentation with its URL and the 2026-09-20 retrieval date, never measured. The Codex entry records that plugin_hooks is removed on 0.154.0-alpha.6.2 so every enforced harness line is instructed there, and names 03-03 item 2 as not applicable. The Cursor entry records what Cursor reads from six published pages and the shopping list an adapter would need, with two findings: AGENTS.md and .agents/skills already reach it unchanged, and beforeSubmitPrompt has no context field so the dispatch suggestion has no Cursor route. Evidence: node scripts/docs.test.mjs exit 0 (4 column(s), 3 with a measured row); --self-test exit 0; lint.test exit 0 (481 files); names.test exit 0; scrub-check PASS (dashes 0, home paths 0); skilliton index --apply exit 0, both entries listed in DECISIONS.md. scripts/docs.test.mjs was corrected in the same change: a cell reading not measured was being counted as a measured row, which would have reported the documentation-only Cursor column as evidence.
- **Next:** Step 11: contracts sections 1, 6, 11, 12 and 14; MAINTAIN step 2 and checks.yml gain the two new test scripts with the B43 two-copies comparison re-run; backlog B20 closed and B17 restated; batch ticks with evidence; report card waves rows and owner-pass bullets; workflow plugin 0.13.0 to 0.14.0.
- **Blocked:** nothing
- **Watch out:** nothing known
