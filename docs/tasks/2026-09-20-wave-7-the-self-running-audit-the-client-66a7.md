# Task: Wave 7: the self-running audit, the client policy, the meter as a command, and two decisions

Kind: Living. Task record.

- **ID:** 2026-09-20-wave-7-the-self-running-audit-the-client-66a7
- **State:** merged
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-21T04:20:55.569Z

## Request

Wave 7. Read each batch file under docs/areas/ first and plan only what its acceptance items name. Ask me the owner questions before the plan, not during the build. Commit and push when the wave passes the suite, then maintain, then hand off.

## Acceptance criteria

- [x] 09-02: the audit runs on changed files with a deterministic result, in a routine, a pre-push hook and the merge gate, each with a fixture test, and its findings land as scoped observations (evidence: commit f1a878a; runtime/lib/audit.mjs, six rules over three controls, pure over the files it is handed; node scripts/audit.test.mjs exit 0 asserting each planted flaw at its line and the matched text never printed, --self-test exit 0; the Stop sentence in runtime/lib/session-hooks.mjs covered in scripts/lifecycle.test.mjs with a mutation check that drops it; the marked pre-push hook and its refusals in scripts/audit.test.mjs; the gate step proved in scripts/delivery.test.mjs by a push carrying a planted flaw rejected naming lib/greet.mjs:4, the same line accepted once it carries an allow marker; audit --record --apply writing one record per control whose sources are exactly the files the run read)
- [x] 03-05: docs/CLIENTS.md states the supported-client rule in one sentence and scripts/docs.test.mjs fails when README names a client the matrix does not carry (evidence: commit f1a878a; the rule in bold in the opening paragraph of docs/CLIENTS.md; the supported-client check in scripts/docs.test.mjs reading the matrix header for its columns and README.md for the names in CLIENT_NAMES, exit 0 reporting 4 columns with 3 having a measured row, and --self-test exit 0 whose case adds a Windsurf claim to README.md and sees it caught)
- [x] 04-04: skilliton usage wraps the meter with a per-merged-batch scorecard, tested, and docs/USAGE_BASELINE.md says plainly that the window is still a placeholder (evidence: commit f1a878a; runtime/lib/usage.mjs and runtime/commands/usage.mjs, workflow 0.14.0; node scripts/usage.test.mjs exit 0 with 19 checks over the window boundaries, a timezone disagreement failing rather than reporting a wrong window, and no output line carrying a percentage or a savings claim; skilliton usage --limit 3 against the real meter exit 0, one batch row because all 13 merges here landed on 2026-09-16; docs/USAGE_BASELINE.md second paragraph in bold)
- [x] 03-03 item 1: a decision entry records that hooks in Codex are instructed, not enforced (evidence: docs/decisions/2026-09-20-hooks-in-codex-are-instructed-not-enforc-a566.md, taking the second branch the item offers: codex features list reports plugin_hooks as removed on 0.154.0-alpha.6.2, so a plugin is not a delivery route and every enforced harness line is instructed there; item 2 is recorded in the batch Notes as not applicable rather than left silent, so the batch stands at 1 of 3)
- [x] 03-04: a decision entry lists what Cursor reads from its published documentation with retrieval dates, and docs/CLIENTS.md gains a Cursor column marked documented only (evidence: docs/decisions/2026-09-20-what-cursor-reads-and-what-a-skilliton-a-006f.md, six published pages read on 2026-09-20 with their URLs and a table of what an adapter would have to write; the fourth matrix column headed Cursor, documentation only, retrieved 2026-09-20, whose every cell carries its URL or reads not documented and none says measured)

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

### 2026-09-21T04:20:55.569Z

- **State:** Wave 7 is on main at 51c38e5 and green: the audit that runs itself in three places, the supported client rule, skilliton usage, and the Codex and Cursor decisions, then this maintenance pass on top of them
- **Evidence:** CI 35559200451 on f1a878a and 35560317702 on 51c38e5, both success, all 61 steps read one by one; the audit over the 47 files the wave changed reports 0 findings with 6 allowed lines, and over all 475 files this repository has ever changed 41 findings, every one a rule's own pattern or a planted fixture (B45); records gates each its own step, backlog, living-docs --check, docs, report-card --check, names all exit 0; scrub-check PASS on the tree and over 138 commits
- **Next:** Wave 8, the last build wave: 06-03's cleanup skills first, then the authorized eval run, and B45's allow markers. Then the owner pass
- **Git:** main @ 51c38e5, 3 uncommitted

## Handoff

- **State:** Wave 7 is on main at 51c38e5 and green: the audit that runs itself in three places, the supported client rule, skilliton usage, and the Codex and Cursor decisions, then this maintenance pass on top of them. Evidence: CI 35559200451 on f1a878a and 35560317702 on 51c38e5, both success, all 61 steps read one by one; the audit over the 47 files the wave changed reports 0 findings with 6 allowed lines, and over all 475 files this repository has ever changed 41 findings, every one a rule's own pattern or a planted fixture (B45); records gates each its own step, backlog, living-docs --check, docs, report-card --check, names all exit 0; scrub-check PASS on the tree and over 138 commits.
- **Next:** Wave 8, the last build wave: 06-03's cleanup skills first, then the authorized eval run, and B45's allow markers. Then the owner pass
- **Blocked:** The owner pass list in docs/REPORT_CARD.md: interactive checklist, maintain minutes, the live unprepared session, the Windows run, B7 decisions, signing key, hosted repository approval, M5 participant, Codex login. Any cost statement (PLAN.md sections 6 and 8)
- **Watch out:** A repository with a delivery policy would now reject a push touching scripts/guardrails.test.sh, guard-bash.sh or scripts/preflight.test.mjs, because the audit reads their own patterns as findings; B45 marks those lines and nothing here is gated meanwhile (B43). The parallel session still owns task/promo-anatomy in ~/Desktop/Skilliton-promo: do not clean that worktree or merge that branch
