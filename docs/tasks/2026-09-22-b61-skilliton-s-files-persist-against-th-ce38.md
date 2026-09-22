# Task: B61: Skilliton's files persist against the assistant and the shared branch, and a removal by a person is named at session start

Kind: Living. Task record.

- **ID:** 2026-09-22-b61-skilliton-s-files-persist-against-th-ce38
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-22T16:28:22.606Z

## Request

make it so that if a user tried deleting something that the skeleton makes it prevents people from deleting skeleton or markdown folders or whatever, like make it so you can't remove it. It's almost like a persistent thing.

## Acceptance criteria

- [ ] guardrails denies rm, git rm and mv aimed at .skilliton, the record files, the entry folders and CLAUDE.md or AGENTS.md, with a reason naming skilliton remove, and a config key turns it off
- [ ] a Write or Edit that would delete the managed block from CLAUDE.md or AGENTS.md in a prepared project is refused
- [ ] a push whose result removes .skilliton files or the managed instruction files needs an approver-signed commit, proven by a rejected then an accepted push in scripts/delivery.test.mjs
- [ ] the session-start block names a missing record or a removed .skilliton with the command that restores it, proven in scripts/lifecycle.test.mjs
- [ ] CONTRACTS sections 2, 11 and 14, the guardrails skill, the allowlist and the troubleshooting page say the new behaviour; guardrails and workflow plugin versions bumped; full suite and scrub pass

## Decisions

not yet written

## Checkpoints

### 2026-09-22T08:47:14.904Z

- **State:** B61 built in three layers: guardrails 0.6.0 denies rm, rmdir, mv and git rm aimed at .skilliton, the records, the entry folders, CLAUDE.md and AGENTS.md (guardrails.protectRecords), and a new managed-block-guard.mjs refuses a Write, Edit or MultiEdit that would take the managed block out of those two files; workflow 0.16.0 rejects a push whose result removes what Skilliton keeps unless an approver signed the removing commit (lib/delivery-persist.mjs), and session start names a missing record or a tracked-but-missing .skilliton/config.json with the command that restores it (lib/records-restore.mjs), restoring nothing itself
- **Evidence:** scripts/guardrails.test.sh 669 checks pass; scripts/delivery.test.mjs 15 of 15; scripts/lifecycle.test.mjs 56 of 56; node scripts/checks.mjs 55 pass, 0 fail, 2 skipped (the CI-only tools and collectors steps) of 58; scrub-check PASS; names, allowlist, deadcode, lint pass
- **Next:** commit and push; read every CI step; then the release skill with 1.0.0 as its first run, the clean-machine README path, the unprepared-repo message, the Usage screen cross-check; B62 (the harness line naming the fourth rule) goes with 1.0.0 because it edits the template
- **Git:** main @ 7dfd18c, 26 uncommitted

### 2026-09-22T16:28:22.606Z

- **State:** Tuesday's list, three commits on main, each CI run 64 of 64: B61 persistence (17189d2: guardrails 0.6.0 rule 4 and managed-block-guard.mjs; workflow 0.16.0 gate removal rule and the session-start restore line), the release skill with its dirty-tree eval case (3c86bf2, workflow 0.17.0), and B62 with migration 0100 applied here plus the records wording and the live unprepared-repo probe (753ba58, workflow 0.17.1). Installed plugins on this machine updated to workflow 0.17.1 and guardrails 0.6.0 at user and project scope (a restart loads them); verify reports UNKNOWN VERSION until 1.0.0 is signed. The 1.0.0 preview shows every changed plugin with a new version (context-hygiene 0.3.0 unchanged). Meter self-test and reference pass; for the Usage screen comparison, this checkout's 2026-09-21 top-level window is 990 requests with a peak context of 566309 tokens, and no cost figure leaves the repository until the owner compares it. Lesson entry a324 filed; portable lessons 230 and 231 on the Desktop.
- **Evidence:** scripts/checks.mjs 56 pass, 0 fail, 2 skipped of 58 on 753ba58; guardrails.test.sh 669; delivery.test.mjs 15 of 15; lifecycle.test.mjs 56 of 56; packs.test.mjs (release skill and eval case ok); gh run view on each of the three runs: 64 steps, 0 not success; evidence/live/2026-09-22-fresh-clone-readme-path.md and 2026-09-22-unprepared-repo-session-start.md
- **Next:** On the owner's go: 1.0.0 through /workflow:release (evidence files: the two evidence/live notes of 2026-09-22 and docs/REPORT_CARD.md), then git push of the tag and the fresh-clone proof. The owner's keyboard checks: the second repository on this machine will show migration 0100 pending (the managed block gained the removal rule): skilliton migrate --apply there, commit the receipt, restart the session; on every machine, claude plugin update workflow@skilliton and guardrails@skilliton, then restart. The Usage screen compared with the 2026-09-21 window above. Meeting Wednesday 11:00.
- **Git:** main @ 753ba58, 2 uncommitted

## Handoff

- **State:** Tuesday's list, three commits on main, each CI run 64 of 64: B61 persistence (17189d2: guardrails 0.6.0 rule 4 and managed-block-guard.mjs; workflow 0.16.0 gate removal rule and the session-start restore line), the release skill with its dirty-tree eval case (3c86bf2, workflow 0.17.0), and B62 with migration 0100 applied here plus the records wording and the live unprepared-repo probe (753ba58, workflow 0.17.1). Installed plugins on this machine updated to workflow 0.17.1 and guardrails 0.6.0 at user and project scope (a restart loads them); verify reports UNKNOWN VERSION until 1.0.0 is signed. The 1.0.0 preview shows every changed plugin with a new version (context-hygiene 0.3.0 unchanged). Meter self-test and reference pass; for the Usage screen comparison, this checkout's 2026-09-21 top-level window is 990 requests with a peak context of 566309 tokens, and no cost figure leaves the repository until the owner compares it. Lesson entry a324 filed; portable lessons 230 and 231 on the Desktop. Evidence: scripts/checks.mjs 56 pass, 0 fail, 2 skipped of 58 on 753ba58; guardrails.test.sh 669; delivery.test.mjs 15 of 15; lifecycle.test.mjs 56 of 56; packs.test.mjs (release skill and eval case ok); gh run view on each of the three runs: 64 steps, 0 not success; evidence/live/2026-09-22-fresh-clone-readme-path.md and 2026-09-22-unprepared-repo-session-start.md.
- **Next:** On the owner's go: 1.0.0 through /workflow:release (evidence files: the two evidence/live notes of 2026-09-22 and docs/REPORT_CARD.md), then git push of the tag and the fresh-clone proof. The owner's keyboard checks: the second repository on this machine will show migration 0100 pending (the managed block gained the removal rule): skilliton migrate --apply there, commit the receipt, restart the session; on every machine, claude plugin update workflow@skilliton and guardrails@skilliton, then restart. The Usage screen compared with the 2026-09-21 window above. Meeting Wednesday 11:00.
- **Blocked:** B53: where the company's join file is published is the owner's call; the fifteen security applicability decisions; the join --apply half of the clean-machine path and every walkthrough step that needs another machine or a person
- **Watch out:** Every checkpoint on main rewrites the indexes and, with --handoff, docs/HANDOFF.md; preview first without --apply. Read the clock before typing a time. This repository's CLAUDE.md and AGENTS.md changed between the markers by migration 0100 (committed with the receipt); any further template edit makes 0100 pending again. The hooks running in an already-open session are the copies loaded at its start: the removal rule and the managed block guard act only in a session started after the plugin update. macOS has no timeout command: exit 127 from a command wrapped in it reads as the program missing. A guard test that hands CLAUDE_PROJECT_DIR the cwd tests a state Claude Code never produces (lesson a324).
