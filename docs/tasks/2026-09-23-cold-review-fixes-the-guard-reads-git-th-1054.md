# Task: Cold review fixes: the guard reads git the way git does, the writers stay inside the repository, the limits are disclosed

Kind: Living. Task record.

- **ID:** 2026-09-23-cold-review-fixes-the-guard-reads-git-th-1054
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-23T15:27:26.361Z

## Request

Fix everything the three cold reviews found, dispatched in parallel: the guard bypasses (option prefixes, --no-force, -c config forms, variables, settings writes, the commit-path size cap, discard verbs, record deletion forms), the symlinked gate log and skills folder, the disclosure in SECURITY.md and the skill, the stale README version, the prerequisites, the allow-list sentence, the template default, a threat model page, the hygiene items; then release

## Acceptance criteria

- [ ] Every command the three reviews listed as a bypass is denied or asked, with a test that runs real git against a bare remote where the review did
- [ ] A write to .claude/settings*.json that touches hooks or plugins, and creating .skilliton-off, ask
- [ ] The commit path caps the content scan the way the add path does, so a 200 MB staged file cannot time the hook out into an allow
- [ ] The gate log and the skill writers refuse a symlinked path, with tests
- [ ] SECURITY.md, the guardrails skill and README say what the guard is and is not, the README version line is current, INSTALL names ssh-keygen and the tested Node version, the allow list agrees with itself
- [ ] The team template defaults autoUpdate to false and INSTALL leads with the signed path, recorded as a decision
- [ ] Full checks green on the merged tree and on the release commit; 1.2.0 signed, pushed, approved in a fresh clone, verified here

## Decisions

not yet written

## Checkpoints

### 2026-09-23T15:27:26.361Z

- **State:** Four lanes dispatched from LANES-6.md at a61a778; docs-review merged (SECURITY.md What the guard is, INSTALL prerequisites and paths, template autoUpdate false with a decision entry) plus the README half on main; writers-review merged (gate log O_NOFOLLOW and link refusal, new-skill and import prove the destination inside the repository); the threat model page and the allow-list sentence are on main; guard-review (N70 done, N71 to N73 in progress) and hygiene-review (N80, N81 done, N82 in progress) still building; main pushed at bd35690
- **Evidence:** Per merge: lint, lint-shape, allowlist, docs, names, scrub, deadcode, footprint each exit 0 on the rebased lane tree; gate.test and skill-writers.test 24 pass 0 fail on merged main; the writers lane ran the full gate PASS in 753 s on its tree; whole-history audit 0 findings in 730 files after each commit; CI on the pushes not yet read
- **Next:** Merge guard-review after its red-team pass and hygiene-review, each with the fast checks then push; bump workflow to 0.23.0 and guardrails to 0.9.0; full checks.mjs on the merged tree; release 1.2.0; read CI
- **Git:** main @ bd35690, 2 uncommitted

## Handoff

- **State:** Four lanes dispatched from LANES-6.md at a61a778; docs-review merged (SECURITY.md What the guard is, INSTALL prerequisites and paths, template autoUpdate false with a decision entry) plus the README half on main; writers-review merged (gate log O_NOFOLLOW and link refusal, new-skill and import prove the destination inside the repository); the threat model page and the allow-list sentence are on main; guard-review (N70 done, N71 to N73 in progress) and hygiene-review (N80, N81 done, N82 in progress) still building; main pushed at bd35690. Evidence: Per merge: lint, lint-shape, allowlist, docs, names, scrub, deadcode, footprint each exit 0 on the rebased lane tree; gate.test and skill-writers.test 24 pass 0 fail on merged main; the writers lane ran the full gate PASS in 753 s on its tree; whole-history audit 0 findings in 730 files after each commit; CI on the pushes not yet read.
- **Next:** Merge guard-review after its red-team pass and hygiene-review, each with the fast checks then push; bump workflow to 0.23.0 and guardrails to 0.9.0; full checks.mjs on the merged tree; release 1.2.0; read CI
- **Blocked:** nothing
- **Watch out:** nothing known
