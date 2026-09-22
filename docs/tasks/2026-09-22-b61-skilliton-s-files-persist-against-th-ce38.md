# Task: B61: Skilliton's files persist against the assistant and the shared branch, and a removal by a person is named at session start

Kind: Living. Task record.

- **ID:** 2026-09-22-b61-skilliton-s-files-persist-against-th-ce38
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-22T18:57:36.441Z

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

### 2026-09-22T17:42:16.609Z

- **State:** Auto-prepare shipped (b25abcf, workflow 0.18.0): on a joined machine a repository with no .skilliton/config.json is prepared at its first session start, said in the block; opt-outs (join file prepare offer, .skilliton-off at the root, skilliton-off inside .git, SKILLITON_AUTO_PREPARE=off) each named; the stop hook is quiet in a repository with no configuration. Proven live through the installed hook in a fresh repository (evidence/live/2026-09-22-auto-prepare-live.md). Installed workflow updated to 0.18.0 at both scopes on this machine. Earlier today: B61 (17189d2), the release skill (3c86bf2), B62 with migration 0100 (753ba58); every CI run 64 of 64.
- **Evidence:** scripts/checks.mjs 56 pass, 0 fail, 2 skipped of 58 on b25abcf; lifecycle.test.mjs 57 of 57; join.test.mjs, footprint, deadcode, lint, allowlist pass; gh run view: 64 steps, 0 not success; claude -p in a fresh repository left .skilliton/config.json, the managed block and the records, with session-start and session-end in the journal
- **Next:** The owner's next ask: maintain and dispatch run without a person invoking them. Build in order: skilliton maintain --apply for the mechanical half (indexes, handoff rotation, backlog archive, status), then the stop hook holds the session until maintain ran when a merge landed, a decision or lesson has no entry file, or the last maintain is older than a day; dispatch through the prompt hook the same way. Then 1.0.0 through /workflow:release on the owner's go, with the two 2026-09-22 live notes and docs/REPORT_CARD.md as evidence. Client repositories the owner wants untouched: touch .git/skilliton-off there. The owner's second repository shows migration 0100 pending: skilliton migrate --apply, commit the receipt, restart. Meeting Wednesday 11:00.
- **Git:** main @ b25abcf, 1 uncommitted

### 2026-09-22T18:16:11.142Z

- **State:** README gained the section written to the coding agent (what is particular to a company, where each decision lives, the command that changes it, the sweep for repositories already on a machine, what is not automatic yet), commit 5d5886e. The owner's 26 Desktop repositories were prepared or migrated by the one-line sweep and verified: every one reports layout current, no migration pending, all 9 records present, files left uncommitted for the owner. The owner's global instructions gained a paragraph saying Skilliton's prepared files belong in every repository, client repositories included, so a session there no longer declines a checkpoint over them.
- **Evidence:** docs, names, lint and scrub checks pass on 5d5886e; gh run: every step success; skilliton status across the 26 repositories read from this session
- **Next:** The maintain and dispatch automation (skilliton maintain --apply for the mechanical half, then the stop hook holding the session until maintain ran after a merge or a day of commits); 1.0.0 through /workflow:release on the owner's go
- **Git:** main @ 5d5886e, 0 uncommitted

## Handoff

- **State:** README gained the section written to the coding agent (what is particular to a company, where each decision lives, the command that changes it, the sweep for repositories already on a machine, what is not automatic yet), commit 5d5886e. The owner's 26 Desktop repositories were prepared or migrated by the one-line sweep and verified: every one reports layout current, no migration pending, all 9 records present, files left uncommitted for the owner. The owner's global instructions gained a paragraph saying Skilliton's prepared files belong in every repository, client repositories included, so a session there no longer declines a checkpoint over them. Evidence: docs, names, lint and scrub checks pass on 5d5886e; gh run: every step success; skilliton status across the 26 repositories read from this session.
- **Next:** The maintain and dispatch automation (skilliton maintain --apply for the mechanical half, then the stop hook holding the session until maintain ran after a merge or a day of commits); 1.0.0 through /workflow:release on the owner's go
- **Blocked:** B53 (where the join file is published); the fifteen applicability decisions; the join --apply half of the clean-machine path and every walkthrough step that needs another machine or a person
- **Watch out:** Every checkpoint on main rewrites the indexes and, with --handoff, docs/HANDOFF.md; preview first. Read the clock before typing a time. This repository's CLAUDE.md and AGENTS.md follow the template by migration 0100; another template edit makes it pending again. Hooks in an open session are the copies loaded at its start: restart after a plugin update. On this machine every repository opened in a session is now prepared unless it carries an opt-out; a test fixture repository opened with claude -p gets prepared too. join.mjs is at its pin (603): move code out rather than adding. auto-prepare loads prepare.mjs and join.mjs lazily because join.mjs reaches release and migrations; scripts/footprint.test.mjs lists those two imports.
