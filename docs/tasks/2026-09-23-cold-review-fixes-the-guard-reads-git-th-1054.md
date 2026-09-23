# Task: Cold review fixes: the guard reads git the way git does, the writers stay inside the repository, the limits are disclosed

Kind: Living. Task record.

- **ID:** 2026-09-23-cold-review-fixes-the-guard-reads-git-th-1054
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-23T16:41:21.710Z

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

### 2026-09-23T15:50:45.469Z

- **State:** Three of four lanes merged and pushed (docs, writers, hygiene); the README leads with what it saves, measured; the release test's cleanup flake fixed; main at dce7d89. Not done: the guard lane (N70 to N72 committed, N73 in progress, red team pass to follow), the plugin version bumps, the changelog, the full check run on the merged tree, the 1.2.0 release. Open owner decision: rewrite history to strip the 311 co-author trailers before 1.2.0, or leave them
- **Evidence:** Hygiene lane on the rebased tree: fast checks each exit 0, preflight + prepare-interrupt + prepare tests 67 pass 0 fail, allowlist self-test exit 0; release.test 27 pass 0 fail after the fix; audit 0 findings in 732 files; CI green on 786f036, failed on 20683d8 at the release pin test's cleanup (ENOTEMPTY, the flake now fixed), rerun and the run on dce7d89 being watched
- **Next:** Merge guard-review after its red team pass; bump guardrails to 0.9.0 and workflow to 0.23.0; changelog; full checks.mjs; the owner's answer on the history rewrite; release 1.2.0; the local regrade
- **Git:** main @ dce7d89, 0 uncommitted

### 2026-09-23T16:15:34.016Z

- **State:** All four lanes merged and pushed; guardrails 0.9.0 and workflow 0.23.0 bumped with the changelog's Unreleased entries; main at df19d80. Not done: the full check run on the merged tree (running), the red team's second probe of the new guard (running), the history rewrite the owner approved (strip the co-author trailers, re-sign the three release tags, the owner force-pushes), release 1.2.0, the local regrade
- **Evidence:** Guard lane on the rebased tree: lint, lint-shape, allowlist, docs, names, scrub, deadcode, footprint, git-config, guardrails.test (676 ok), guardrails-bypass.test (143 ok, review file 199 ok), hook-fixture each exit 0; the lane's own full checks.mjs 76 pass 0 fail 2 skipped; audit 0 findings in 734 files; CI green through 26ea74d, runs on 25526a0 and df19d80 being watched
- **Next:** Read the full check verdict and the red team result; run the rewrite script; hand the owner the two force-push commands; release 1.2.0 on the rewritten history; regrade
- **Git:** main @ df19d80, 0 uncommitted

### 2026-09-23T16:41:21.710Z

- **State:** All four cold-review lanes merged; guardrails 0.9.0 and workflow 0.23.0 bumped; full checks 78 pass 0 fail 2 skipped of 80 on df19d80; the history rewritten locally to remove the 311 co-author trailers (main 235ddac plus records; trees unchanged; three release tags re-signed and approved); maintenance run. Not done: the owner's force-push of the rewritten main and tags, the guard lane's dry-run fix round (red team: 65 of 65 caught, one over-reach), release 1.2.0, the local regrade
- **Evidence:** checks.mjs 78 pass 0 fail 2 skipped of 80 on df19d80; CI green through e3c76c5; red team 65 caught 0 still allowed slowest 77 ms; rewrite: 374 commits before and after, trailers 311 to 0, tree at HEAD cadd88a0190a unchanged, release list 3 approved; scrub --history exit 0
- **Next:** After the owner's force-push: cherry-pick the guard fix round, SECURITY.md wording, CHANGELOG 1.2.0 heading, release create, checks on the manifest commit, audit, sign, push, fresh clone, verify, then the regrade workflow
- **Git:** main @ 235ddac, 7 uncommitted

## Handoff

- **State:** All four cold-review lanes merged; guardrails 0.9.0 and workflow 0.23.0 bumped; full checks 78 pass 0 fail 2 skipped of 80 on df19d80; the history rewritten locally to remove the 311 co-author trailers (main 235ddac plus records; trees unchanged; three release tags re-signed and approved); maintenance run. Not done: the owner's force-push of the rewritten main and tags, the guard lane's dry-run fix round (red team: 65 of 65 caught, one over-reach), release 1.2.0, the local regrade. Evidence: checks.mjs 78 pass 0 fail 2 skipped of 80 on df19d80; CI green through e3c76c5; red team 65 caught 0 still allowed slowest 77 ms; rewrite: 374 commits before and after, trailers 311 to 0, tree at HEAD cadd88a0190a unchanged, release list 3 approved; scrub --history exit 0.
- **Next:** After the owner's force-push: cherry-pick the guard fix round, SECURITY.md wording, CHANGELOG 1.2.0 heading, release create, checks on the manifest commit, audit, sign, push, fresh clone, verify, then the regrade workflow
- **Blocked:** Only the owner can do these: read the Usage screen for the token window (turns the meter's reconstruction into a number that may be stated), report the end-of-day maintain minutes before and after, the extension keyboard checks and the other rows of docs/OWNER_TESTS.md, a clean macOS account, a Codex login, a Windows machine with a Claude login, an endpoint security product to test under, and a participant for the new builder rehearsal
- **Watch out:** Restart the client before the new hooks run (workflow 0.22.0, guardrails 0.8.0, context-hygiene 0.3.1 installed at 10:00 EDT). The lane folder ~/Desktop/Skilliton-lanes/instruction-size still has its branch checked out because the guard refused moving its stale receipt; remove that file by hand, detach, delete the branch. Windows stays not supported (B80, no Claude Code session there). Read the clock before typing a time
