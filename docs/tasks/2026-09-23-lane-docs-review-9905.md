# Task: Lane docs-review

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-docs-review-9905
- **State:** merged
- **Branch:** lane/docs-review-0923
- **Owner:** unassigned
- **Updated:** 2026-09-23T15:15:35.361Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N76. [TOUCH] SECURITY.md says what the guard is and is not: a section "What the guard is" in plain words: a seatbelt against an assistant's ordinary and accidental commands, not a security boundary; it reads command text and cannot see inside scripts, `bash -c`, `eval`, aliases or functions; a write to `.claude/settings.json` or `.claude/settings.local.json` can turn the hooks off unless a company delivers them through Claude Code's managed settings, which is the only way "enforced" holds against the assistant itself (cite Claude Code's documented precedence in one sentence, marked as read from the documentation, not measured); `SKILLITON_GUARDRAILS=off` in the environment turns every check off for that session and a company forbids it by policy; the shared-branch gate runs a project's own checks under its own account and detects tampering after the fact, it does not sandbox them (docs/DELIVERY.md says so; link it); the limits found by the 2026-09-23 reviews (option prefixes, `--no-force` after `--force-with-lease`, `-c` push and alias configuration, unresolved variables, the commit-path size cap, the discard verbs, the record-deletion forms, the symlinked gate log and skills folder) each named in one line with "fixed in guardrails 0.9.0 and workflow 0.23.0, in progress" so the reader knows which release carries the fix. Keep the existing sections; add, do not rewrite.
- [ ] N77. [TOUCH] README and INSTALL say what is current: README line 7 and the evidence table's release row (lines 27 and 65 at the base) say 1.1.0 and workflow 0.22.0 (the signed release is 1.1.0 at commit 1f9f041); the guardrails bullet in "Open a git repository" (line 13 at the base) says "the common forms" and links SECURITY.md's new section for what it cannot see; a short "Your ten minutes" section after the At a glance table naming the five files a reviewer reads first (README, docs/ARCHITECTURE.md, docs/CONTRACTS.md, SECURITY.md, docs/REPORT_CARD.md) and what to skip (docs/archive, evidence folders except the two comparison summaries); INSTALL: the prerequisites name OpenSSH's `ssh-keygen` (the demo and `verify` use it; on Debian and Ubuntu it is the openssh-client package) and say "Node.js 22 tested; 20 ran in one review and is not a supported floor"; the "Try it" path (path 2) says in its first sentence that it tracks `main` unsigned with automatic updates and is for trying, and the team path (path 3, the signed join) is the one for a machine that holds client work; README's Install paragraph says the same in one sentence.
- [x] N78. [TOUCH] The team template defaults automatic updates off: templates/project-settings.json line 8 and .claude/settings.json line 16 `"autoUpdate": true` become `false`, with the reason in a decision entry (`skilliton record decision "The team settings template does not auto-update plugins" --apply`): a machine that holds client work updates plugins by `skilliton pin --latest` and a signed release, never by tracking main; the try-it path may turn it on by hand and INSTALL says how. Check `docs/CONTRACTS.md` section 5 and the enrollment evidence for what they say about auto-update (read only; main updates them) and name in your report every sentence that must change on main. Run `node scripts/skilliton.mjs project-settings` (preview) in a temporary prepared repository to confirm the template still applies cleanly.
- [x] N79. [TOUCH] The guardrails skill's user-facing list agrees with SECURITY.md: read packs/base/plugins/guardrails/skills/guardrails/SKILL.md (guard-review edits its rules and limits lists; you do not edit that file) and report in LANE_REPORT.md under Leftovers any sentence in it that SECURITY.md's new section would contradict, so main reconciles the two at merge. This item writes nothing; it is a read with a reported result.

## Decisions

- docs/decisions/2026-09-23-the-team-settings-template-does-not-auto-ba3c.md (N78: the team settings template defaults `autoUpdate` to `false`)

## Checkpoints

### 2026-09-23T15:11:53.848Z

- **State:** N76 and N78 done and committed; N77 partially done (INSTALL.md written; README.md lines deferred to main, a main-only path for this lane); N79 read and reported, nothing written for it
- **Evidence:** scrub-check.sh PASS; node scripts/checks.mjs --only Guides/Names/Living-records PASS; node --test scripts/skilliton.test.mjs 198 checks PASS; project-settings preview confirmed in a temporary prepared repo
- **Next:** main applies the README.md changes N77 names (line 7, evidence table release row, guardrails bullet, Your ten minutes section, Install paragraph) and reconciles the guardrails skill limits list N79 flagged
- **Git:** lane/docs-review-0923 @ ec2753a, 4 uncommitted

## Handoff

- **State:** N76 and N78 done and committed; N77 partially done (INSTALL.md written; README.md lines deferred to main, a main-only path for this lane); N79 read and reported, nothing written for it. Evidence: scrub-check.sh PASS; node scripts/checks.mjs --only Guides/Names/Living-records PASS; node --test scripts/skilliton.test.mjs 198 checks PASS; project-settings preview confirmed in a temporary prepared repo.
- **Next:** main applies the README.md changes N77 names (line 7, evidence table release row, guardrails bullet, Your ten minutes section, Install paragraph) and reconciles the guardrails skill limits list N79 flagged
- **Blocked:** nothing
- **Watch out:** nothing known
