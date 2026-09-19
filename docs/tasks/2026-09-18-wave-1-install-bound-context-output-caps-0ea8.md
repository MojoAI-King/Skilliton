# Task: Wave 1: install, bound context, output caps

Kind: Living. Task record.

- **ID:** 2026-09-18-wave-1-install-bound-context-output-caps-0ea8
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-19T02:50:06.648Z

## Request

not yet written

## Acceptance criteria

- [ ] join applied on this machine, skilliton verify reads VERIFIED for workflow, guardrails and context-hygiene, evidence filed under evidence/live
- [ ] team settings applied to this repository as .claude/settings.json with the 600000 window and bashOutputMaxChars 30000
- [ ] live-clients rehearsal extended with L5 read guard and L6 compaction, run on this machine, SUMMARY read, verdicts reported as they are
- [ ] decision entry records the 600000 window as owner-chosen and unmeasured, the global 1000000 as owner-set, and no per-subagent window in the docs
- [ ] template pins tested in scripts/skilliton.test.mjs, CONTRACTS, CLIENTS, COVERAGE, IT-ALLOWLIST and BACKLOG rows updated from measurement
- [ ] owner interactive checklist written into batch 01-01 Notes, batch ticks carry evidence, report-card --check exits 0, full suite and scrub pass, nothing committed

## Decisions

not yet written

## Checkpoints

### 2026-09-19T02:25:56.752Z

- **State:** Wave 1 in progress: template at 600000 with bashOutputMaxChars 30000 and pinned by the unit test (186 checks pass); decision entry written; CONTRACTS, IT-ALLOWLIST and BACKLOG B36 updated; join applied on this machine for company mojoai with the bundled Claude Code 2.1.276: marketplace skilliton added, three plugins installed and enabled, signers trusted, launcher written; verify reports UNKNOWN VERSION for all three because this repository has no signed release tag (join exit 1, attention); live-clients.mjs extended with L5, L6 and --only, not yet run
- **Evidence:** node scripts/skilliton.test.mjs: all 186 checks passed; join --apply output and verify output kept in the scratchpad; claude plugin list shows context-hygiene 0.3.0, workflow 0.8.0, guardrails 0.4.0 enabled at user scope
- **Next:** project-settings on this repo, the join evidence file, then the paid rehearsal run with the bundled client, then the docs rows and the batch ticks
- **Git:** main @ f8a935c, 72 uncommitted

### 2026-09-19T02:37:10.393Z

- **State:** Rehearsal run 1 (all steps, bundled 2.1.276): L1 to L5 PASS, L6 FAIL because the model ended after two reads; L6 rerun with a firmer prompt: compaction was triggered three times at the 100000 window (journal pre-compact trigger auto, then session-start source compact, three cycles), but the client reported the compaction itself failed three times on the random-hash corpus and ended the session, and the stream carried no PreCompact hook_response; the template also gained taskOutputMaxChars 32000 after the settings reference was read directly (188 checks pass); this repository's .claude/settings.json carries all three keys
- **Evidence:** evidence/rehearsals/2026-09-19-live-clients (run 1) and 2026-09-19-live-clients-run-2 (L6 only); the disposable project's journal read by hand; node scripts/skilliton.test.mjs all 188 checks passed
- **Next:** third L6 run with a prose corpus; then the compaction rows in CLIENTS, COVERAGE and B34, the report card, the full suite, scrub, handoff
- **Git:** main @ f8a935c, 82 uncommitted

### 2026-09-19T02:44:03.352Z

- **State:** L6 passed on the fourth run: a headless session on Claude Code 2.1.276 compacted on its own at a project-set autoCompactWindow of 100000 (compact_boundary, pre 76856 post 21857 tokens), the PreCompact hook ran with trigger auto and SessionStart with source compact (journal), the Project state was shown again after the boundary; no PreCompact hook events appear in the stream; the client ends a session that refills the window within 3 turns of a compaction three times over. Docs flipped: CLIENTS.md compaction, SessionStart and hook-witness rows, COVERAGE.md, PLAN.md row, B34 closed to the archive, B36 note, decision entry Risk and Evidence, hook.mjs comment, batch 01-01 Notes. Nothing committed.
- **Evidence:** evidence/rehearsals/2026-09-19-live-clients-run-4 SUMMARY (L6 PASS); run-2 and run-3 folders hold the failed attempts and the give-up finding; run 1 folder holds L1 to L5 PASS
- **Next:** report-card --apply and --check, docs.test, scrub-check, the 43-step offline suite, git status review, handoff, memory update; the owner's interactive checklist in batch 01-01 Notes stays the owner's
- **Git:** main @ f8a935c, 86 uncommitted

### 2026-09-19T02:50:06.648Z

- **State:** Wave 1 verified and handed off, nothing committed: 43-step suite 42 PASS plus one FAIL (report-card self-test stale-table case) fixed in scripts/report-card.mjs and its three steps rerun green (lesson entry 0a3c); scrub PASS; docs test PASS; report card 14 of 123; docs/HANDOFF.md RESUME HERE written 22:49 EDT, four oldest entries moved to the archive; memory updated
- **Evidence:** scratchpad suite11.out (42 PASS, 1 FAIL before the fix); report-card --self-test 9 of 9, report-card.test.mjs and --check exit 0 after; scrub-check PASS; docs.test exit 0
- **Next:** owner: commit and push decision for waves 0 and 1; owner interactive checklist (batch 01-01 Notes); next-day auto-update observation against f8a935c9b546; wave 2
- **Git:** main @ f8a935c, 89 uncommitted

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
