# Task: A-quality pass before the Wednesday review: cold review, README, docs map, code habits

Kind: Living. Task record.

- **ID:** 2026-09-22-a-quality-pass-before-the-wednesday-revi-0d34
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-22T06:39:47.775Z

## Request

I need this code to be A quality and all the different criterias as close to A- as possible since they will be having a claude tool of theirs reviewing and judging this product. That means a perfect readme, coding habits and organization.

## Acceptance criteria

- [ ] A cold judge-style review by a fresh subagent with no session context grades the repository and lists what costs it a grade; each item is fixed or recorded as declined with a reason; a second cold review reads better than the first
- [ ] README.md reads in a cold reviewer's order: what it is in two sentences, the tech facts, install in three commands, the two paths, enforced versus instructed, proven versus not; every command in it runs as written
- [ ] docs/ has a one-screen map that separates living records from reference and archived material, with archived material moved under docs/archive and every link still resolving (docs.test.mjs passes)
- [ ] The runtime's largest pinned file is smaller than before and lint, dead code and the full suite pass; no savings claim anywhere
- [ ] B50 live probe, B55 and B43 folding done or recorded as deferred with a reason

## Decisions

not yet written

## Checkpoints

### 2026-09-22T04:14:12.017Z

- **State:** Cold review done (README C+, organisation B-, habits B+, tests A-, docs B-, twelve items). Shipped at 1ea056f and 28ad475: README rewritten in a cold reader's order; docs index as a one-screen map with Living, Reference and build-record folders; BUILD_GOAL, GOAL_COMMAND, AUTOPILOT_INTEGRATION and DAY-1-KICKOFF archived; LANES.md removed; the three unshipped skills moved out of the installable plugin (code-quality 0.2.1); evidence/README.md; context-hygiene description made true; lint header states the Bash exemption. Deferred with reasons as B57 to B60: legacy modules and catalog name, one test convention, a scripts/ size ceiling, the handoff trimmed to RESUME HERE. Not yet done: the security.mjs split (review item 7), a second cold review
- **Evidence:** docs, packs, lint, backlog, names, scrub, living-docs, evidence, footprint, deadcode, allowlist, setup all exit 0 on 28ad475; plugin validate --strict passes for the tree and code-quality; my link rewrite had edited files inside six old lane worktrees and every one was reverted and reads clean; CI for 28ad475 running
- **Next:** Split security.mjs by subject with the split-a-file skill, tests before and after; then the second cold review; then B50 probe, B55, B43 folding
- **Git:** main @ 28ad475, 0 uncommitted

### 2026-09-22T04:22:24.958Z

- **State:** Review item 7 done: lib/security.mjs split along the file-layer seam into lib/security-io.mjs (250 lines) and the engine (498 lines, under the ceiling, pin row deleted); workflow 0.15.8; contracts history entry. Items 1 to 6, 11 and 12 shipped earlier tonight; 8, 9, 10 deferred as B57 to B59 with reasons; the second cold review is next
- **Evidence:** Byte-identical move proven against git show HEAD; security-evidence and collectors 52 of 52, lifecycle 55 of 55, prepare and migrate 56 of 56, audit, skilliton, lint and self-test, deadcode, footprint, allowlist, packs, plugin validate, demo all pass; docs, scrub, names exit 0; CI for 28ad475 was 63 of 63
- **Next:** CI for this commit; second cold review by a fresh subagent on the new tree; then B50 live probe, B55, B43 folding, handoff
- **Git:** main @ 0cada16, 0 uncommitted

### 2026-09-22T04:46:14.083Z

- **State:** Second cold review in (README B+, organisation B, habits B+, tests B, docs B-). Uncommitted on the tree, verified piecewise: scripts/checks.mjs runs checks.yml's 58 steps locally (56 run here, verdict per step, logs under .git/skilliton/checks); CONTRIBUTING.md, SECURITY.md, CHANGELOG.md; docs index renamed docs/README.md with 17 references updated; README numbers corrected to 58 steps and the use-as-is path made honest; dead-code summary says what it covered; code-quality enabled at project scope and in the template; B50 row carries the docs finding. Deferred: B50 implementation, B43 folding (the runner reads one list; the MAINTAIN copy stays under its equality test)
- **Evidence:** docs, docs --self-test, lint, names, scrub, backlog, deadcode, setup exit 0; runner steps Preflight, Plugin validation and Scrub self-test pass after three runner fixes (plain shell not login shell, install lines dropped, RUNNER_TEMP provided); the full 58-step run through the runner is in progress
- **Next:** Read the full run; commit and push the batch; CI; handoff; the owner's keyboard checks; 1.0.0 Wednesday morning
- **Git:** main @ bf94373, 26 uncommitted

### 2026-09-22T04:50:09.256Z

- **State:** The A-quality pass is shipped on main at d35a9a8: two cold judge-style reviews (README C+ to B+, organisation B- to B in the second reading) and every cheap item from both done: README in a cold reader's order with honest numbers, docs/README.md as a one-screen index, build-era docs and unshipped skills archived, LANES.md removed, evidence/README.md, lib/security.mjs split into security-io.mjs (731 to 498, pin deleted, byte-identical move), B55 fixed with a test, scripts/checks.mjs runs CI's 58-step list locally, CONTRIBUTING.md, SECURITY.md, CHANGELOG.md, code-quality enabled at project scope and in the template, B56 filed, B50 settled by the hooks reference and deferred. Plugin versions workflow 0.15.9, guardrails 0.5.2, context-hygiene 0.3.0, code-quality 0.2.1. Deferred with reasons: B57 to B60, B50 implementation, B43 folding
- **Evidence:** Full suite through scripts/checks.mjs 56 pass, 0 fail, 2 skipped by design; CI 63 of 63 on 28ad475, 0cada16 and bf94373; CI for d35a9a8 running; the move proven byte-identical against git show HEAD; security 52 of 52, lifecycle 55 of 55, dispatch 23 of 23
- **Next:** Read CI for d35a9a8; update the installed plugins to 0.15.9 and 0.2.1 before the meeting; the owner's eight keyboard checks in the second repository (the confirmation prompt is B5); regrade is the owner's; 1.0.0 release Wednesday morning: release create, commit the manifest, release sign, push the tag, verify from a fresh clone, CHANGELOG entry
- **Git:** main @ d35a9a8, 0 uncommitted

### 2026-09-22T05:51:57.810Z

- **State:** Tree unchanged since 22010b9; the reminder fired on the handoff commit. CI for d35a9a8 read as success, 64 steps, 0 failed. Installed plugins now match the repo at user and project scope (workflow 0.15.9, guardrails 0.5.2, context-hygiene 0.3.0, code-quality 0.2.1; restart applies). Agreed in conversation: no prompt-rewrite skill (it duplicates task and would not pass an eval); two candidate skills proposed, release and commit, awaiting the owner's choice
- **Evidence:** gh run view for d35a9a8: conclusion success, 64 steps, 0 failed; installed_plugins.json read after the updates
- **Next:** On the owner's word: build the release skill and run 1.0.0 through it Tuesday evening; commit skill if an eval case fits; the clean-machine README path; the unprepared-repo message at session start
- **Git:** main @ 22010b9, 1 uncommitted

### 2026-09-22T06:39:47.775Z

- **State:** Night's work complete on main at 6b1b97b: the A-quality pass (two cold reviews acted on), maintain done (decision and two lessons recorded, protocol gate promoted outside the repo), and three documents written as repository sources with PDFs built outside the repository under the owner's Desktop handout folder: the technical white paper, the plain-language guide for someone who signs off, and troubleshooting from real cases. Installed plugins match the repo at both scopes; restart applies them. No prompt-rewrite skill; release and commit skills proposed and awaiting the owner's choice
- **Evidence:** docs, scrub, names, living-docs exit 0 on the three new documents; PDFs rendered and read back (title once, tables intact); CI 64 of 64 on d35a9a8; full suite through scripts/checks.mjs 56 pass 0 fail 2 skipped
- **Next:** Owner tonight: test on another device and on already-active repositories (join once per machine, prepare once per repository, restart the session), read docs/TROUBLESHOOTING.md when something is not seen. Tuesday: code polish toward the judge's read (B57 to B59 candidates, the five remaining pins), the release skill with 1.0.0 as its first run Tuesday evening, the clean-machine README path, the unprepared-repo message at session start, the meter cross-checked against the Usage screen for one quantifiable figure; 1.0.0 before Wednesday 11:00
- **Git:** main @ 6b1b97b, 0 uncommitted

## Handoff

- **State:** Night's work complete on main at 6b1b97b: the A-quality pass (two cold reviews acted on), maintain done (decision and two lessons recorded, protocol gate promoted outside the repo), and three documents written as repository sources with PDFs built outside the repository under the owner's Desktop handout folder: the technical white paper, the plain-language guide for someone who signs off, and troubleshooting from real cases. Installed plugins match the repo at both scopes; restart applies them. No prompt-rewrite skill; release and commit skills proposed and awaiting the owner's choice. Evidence: docs, scrub, names, living-docs exit 0 on the three new documents; PDFs rendered and read back (title once, tables intact); CI 64 of 64 on d35a9a8; full suite through scripts/checks.mjs 56 pass 0 fail 2 skipped.
- **Next:** Owner tonight: test on another device and on already-active repositories (join once per machine, prepare once per repository, restart the session), read docs/TROUBLESHOOTING.md when something is not seen. Tuesday: code polish toward the judge's read (B57 to B59 candidates, the five remaining pins), the release skill with 1.0.0 as its first run Tuesday evening, the clean-machine README path, the unprepared-repo message at session start, the meter cross-checked against the Usage screen for one quantifiable figure; 1.0.0 before Wednesday 11:00
- **Blocked:** B53: where the company's join file is published is the owner's call; the fifteen security applicability decisions; every walkthrough step that needs another machine or a real person
- **Watch out:** Every checkpoint on main rewrites the indexes and, with --handoff, docs/HANDOFF.md; preview first without --apply. A Written or Updated time ahead of the clock is refused, so read date before typing one. prepare --apply in a repository with a test command now writes .skilliton/delivery.draft.json; no gate runs it until delivery confirm. A template edit makes migration 0100 pending here: run migrate --apply and commit the receipt. B49 is an unexplained exit 2 from allowlist.test.mjs seen once and not reproduced; keep every batch gate run's full output in a file, because that one was filtered through grep and its message is gone. Two numbers written on 2026-09-21 were never measured and had to be corrected: the CI step total said 60 and is 63, and three plugin versions were set from memory
