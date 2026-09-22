# Task: B61: Skilliton's files persist against the assistant and the shared branch, and a removal by a person is named at session start

Kind: Living. Task record.

- **ID:** 2026-09-22-b61-skilliton-s-files-persist-against-th-ce38
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-22T08:47:14.904Z

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

## Handoff

- **State:** B61 built in three layers: guardrails 0.6.0 denies rm, rmdir, mv and git rm aimed at .skilliton, the records, the entry folders, CLAUDE.md and AGENTS.md (guardrails.protectRecords), and a new managed-block-guard.mjs refuses a Write, Edit or MultiEdit that would take the managed block out of those two files; workflow 0.16.0 rejects a push whose result removes what Skilliton keeps unless an approver signed the removing commit (lib/delivery-persist.mjs), and session start names a missing record or a tracked-but-missing .skilliton/config.json with the command that restores it (lib/records-restore.mjs), restoring nothing itself. Evidence: scripts/guardrails.test.sh 669 checks pass; scripts/delivery.test.mjs 15 of 15; scripts/lifecycle.test.mjs 56 of 56; node scripts/checks.mjs 55 pass, 0 fail, 2 skipped (the CI-only tools and collectors steps) of 58; scrub-check PASS; names, allowlist, deadcode, lint pass.
- **Next:** commit and push; read every CI step; then the release skill with 1.0.0 as its first run, the clean-machine README path, the unprepared-repo message, the Usage screen cross-check; B62 (the harness line naming the fourth rule) goes with 1.0.0 because it edits the template
- **Blocked:** nothing
- **Watch out:** nothing known
