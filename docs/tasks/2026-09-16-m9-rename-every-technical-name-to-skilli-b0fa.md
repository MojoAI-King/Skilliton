# Task: M9: rename every technical name to Skilliton

Kind: Living. Task record.

- **ID:** 2026-09-16-m9-rename-every-technical-name-to-skilli-b0fa
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-17T02:25:35.034Z

## Request

not yet written

## Acceptance criteria

- [ ] No current file names Skillgate outside an allowlist of historical records and the migration's old-name table, enforced by a test that fails on a new occurrence
- [ ] A project prepared under the old names moves to .skilliton/ by a previewable migration with backup and rollback, and refuses when both folders exist
- [ ] Setup, verify and undo work under the new names; old-name machine state is detected and never silently ignored
- [ ] Every offline suite passes; fork, machine and company release rehearsals pass on Claude Code and Codex; an independent review's findings are fixed before publishing

## Decisions

not yet written

## Checkpoints

### 2026-09-17T02:25:35.034Z

- **State:** M9 code done locally, uncommitted: every current name renamed; lib/legacy-names.mjs; layout 3 and migration 0003 (applied to this repository); unmigrated projects refused except migrate/status/doctor/hooks; old-name state reported (join receipt, trust file, installs, release tags, delivery hook, env vars, denylist, statusline backups); guardrails and the delivery gate keep enforcing settings and policy at the earlier paths; rollback ordered by receipt time (bug found by the new tests); workflow 0.6.0, guardrails 0.3.0, context-hygiene 0.2.0
- **Evidence:** all offline suites pass (CLI 181, prepare/migrate/records, rename 9, lifecycle 32, security 38 and collectors, release 21, join 36, delivery 11, guardrails, hooks, demo, names and self-test, docs, scrub PASS); strict validation passes on Claude Code 2.1.273
- **Next:** Docs (CONTRACTS, BRANDING, DELIVERY, COVERAGE, PLAN, PHASE-3, MAINTAIN, CI steps), decision and lesson entries, local commit, fork/machine/company-release/projects rehearsals on real clients, independent review, push
- **Git:** main @ e5900d5, 140 uncommitted

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
