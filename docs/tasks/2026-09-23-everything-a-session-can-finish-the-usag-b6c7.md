# Task: Everything a session can finish: the usage batch, the open backlog rows and the security records

Kind: Living. Task record.

- **ID:** 2026-09-23-everything-a-session-can-finish-the-usag-b6c7
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-25T19:21:19.964Z

## Request

I'd love to get them all resolved, except the ones that I have to do. So if you can just crush all the remaining stuff, that'd be great.

## Acceptance criteria

- [ ] skilliton usage shows rows in a repository that merges fast-forward: the meter ships in the workflow plugin with its tests, batches come from maintain events and task closes, the project is the default scope, a committed ledger keeps token counts, and the savings view says saved only when the meter and the Usage screen agree
- [ ] Lane reports and the batch close carry each lane's cost and peak context, and closing a batch marks merged lane tasks merged
- [ ] The guard reads a sourced or executed script through its own rules, and the tokenizer moves to Node behind a Bash shim only if every guard suite passes unchanged
- [ ] Security: a CI step fails on a missing collector-backed record, existing CI evidence can be ingested as artifacts, the findings live in their own file, and every applicable control has a recorded assessment with evidence or a needs-human note
- [ ] Hooks and tasks: drift against criteria at the stop hook, a skill copy drift note at session start, a gate verdict that separates the change from the machine, and preflight passing on a loaded machine
- [ ] The legacy migrations leave the runtime, the instruction block is smaller with its migration, and an eval case puts a model in front of an audit finding
- [ ] One test convention in scripts/ and the longest functions split under the shape lint
- [ ] B18 and B75 answered from the official documentation and recorded, the comparison rerun for tasks B and D filed, the second field report sanitized into evidence, backlog rows closed into the archive, release 1.4.0 signed

## Decisions

not yet written

## Checkpoints

### 2026-09-24T15:31:03.243Z

- **State:** Batch LANES-8 in progress at 00:15 EDT 2026-09-24: security-records merged (e4717f8; findings in docs/SECURITY_FINDINGS.md, require-collected in CI, twelve assessments recorded: 6 observed, 5 gaps, secrets needs-human); on main also the README claims pass, B18 measured (marketplace pinned at a tag), B75 documented, the second field report filed, the comparison runner's instructions setup. Lanes usage, guard, hooks-and-tasks (plus N33 first-stop hold), legacy-and-template and pin-at-tag still running; the newcomer walkthrough running
- **Evidence:** security-records rebased on main: fast checks 10 of 10 exit 0, its eight suites exit 0; maintain --apply exit 0 (findings 12 to 6 open); docs, backlog, scrub checks exit 0; pushes to origin main exit 0
- **Next:** Merge each lane as it reports (rebase, fast checks and its suites, ff-only, push); after legacy-and-template merges make migrate list migration 0004 as pending and validate security.findingsFile in config; then CI steps and CONTRACTS for every lane, CHANGELOG 1.4.0, the backlog rows to the archive, workflow 0.25.0, migrate --apply, the full check run, release 1.4.0; then the security retest, the three-setup comparison and the walkthrough repeat on 1.4.0
- **Git:** main @ f3bf948, 7 uncommitted

### 2026-09-24T16:05:35.998Z

- **State:** LANES-8 at 12:30 EDT 2026-09-24: merged security-records, hooks-and-tasks (with N33 first-stop hold), guard (N8; N9 measured and not merged by decision), pin-at-tag (marketplace at the release tag); the newcomer walkthrough filed with its documentation fixes; CI green after the demo fix (90da07f). Running: usage, legacy-and-template, friction (the walkthrough's code findings N34 to N41)
- **Evidence:** each merge: rebase exit 0, fast checks 10 of 10, the lane's suites, the demo and the project rehearsal exit 0 (hooks, guard, pin); CI green on 6a1bc4e and bf8650d; maintain --apply exit 0 (10 open findings: four assessments stale after the lanes changed their sources)
- **Next:** Merge usage, legacy-and-template and friction as they report; then migrate lists 0004, B87's brief sentence, the token-efficiency pointer, CHANGELOG 1.4.0, backlog to the archive, workflow 0.25.0, migrate --apply, re-record the stale assessments, the full check run, release 1.4.0; then the security retest and the three-setup comparison
- **Git:** main @ 23d9fca, 4 uncommitted

### 2026-09-24T19:09:56.947Z

- **State:** Merged on main and pushed: security-records, hooks-and-tasks, guard (N8), pin-at-tag, usage (e8e2244). Legacy-and-template rebased with merge fixes (788e473); its agent is adapting rename and migrate tests and making migrate list 0004, with the owner's authorization. Friction rebased, checks running. Uncommitted on main until friction merges: dispatch.contextCeiling in config with a test, the eight-minute sentence in lane briefs (B87), usage docs in CONTRACTS, USAGE_BASELINE, MAINTAIN, the dispatch and maintain skills, the fixture README and the allow-list meter row. The guard's unattended mode is left to another session at the owner's word
- **Evidence:** usage merge: fast checks 10 of 10 and 15 suites exit 0; friction so far: fast checks 10 of 10 and 13 suites exit 0; config-dispatch-ceiling, config-findings-file, dispatch, dispatch-close, lint-shape, allowlist, docs, scrub, names exit 0 on main's working tree
- **Next:** Merge friction when its checks finish, commit the waiting docs and config, merge legacy when its agent reports, then migrate --apply, re-record stale assessments, CHANGELOG 1.4.0, backlog to archive, workflow 0.25.0, the full check run, release 1.4.0
- **Git:** main @ e8e2244, 10 uncommitted

### 2026-09-24T20:06:13.484Z

- **State:** Every LANES-8 lane merged and pushed (usage, security-records, hooks-and-tasks, guard N8, pin-at-tag, friction, legacy-and-template); B86, B87, contextCeiling and workflow 0.25.0 on main; the pre-release review fixed writers that followed a committed link out of the repository, the gate verdict's command lines and a false secret match on entry names; migration 0100-instructions-db85286c7260 applied; security reassessed (0 stale, 6 open); release 1.4.0 is next
- **Evidence:** full check list on 4e3c697: 106 pass, 0 fail, 2 skipped (CI-only) of 108, exit 0; CI green through dd9abb3; each merge: rebase exit 0, fast checks 10 of 10, the lane's suites, the demo and the project rehearsal exit 0
- **Next:** Release 1.4.0 (create, commit with the changelog, full checks on the manifest commit, sign, push, fresh-clone release list, marketplace update, verify, evidence note); then the audit-finding eval run (B48), the three-setup comparison (B66), B88's write lint and the security retest
- **Git:** main @ 1a39434, 0 uncommitted

### 2026-09-24T21:22:08.151Z

- **State:** Release 1.4.0 is signed and published: tag skilliton-release/1.4.0 on 4bc1c2c, manifest-sha256 8b70c752, approved in a fresh clone from GitHub (6 approved); workflow 0.25.0 installed and VERIFIED here; guardrails deliberately not updated here, because another session edited the installed guard in place (quiet mode) and verify reads those two copies TAMPERED
- **Evidence:** full checks on 4bc1c2c: 106 pass, 0 fail, 2 skipped (CI-only) of 108, exit 0; CI green on 4bc1c2c (run 36053099223); git tag -v good; evidence/live/2026-09-24-release-1.4.0.md
- **Next:** The audit-finding eval run (B48, claude plugin eval, ceiling 5), the three-setup comparison on 1.4.0 (B66, docs/COMPARISON_PROTOCOL.md third run), B88 (a lint for plain runtime writes), B89 (lane cost for agent-run lanes), the security retest; when the quiet-guard work merges, release it and install guardrails from that release so verify reads VERIFIED
- **Git:** main @ 8fbbc78, 0 uncommitted

### 2026-09-25T00:11:19.080Z

- **State:** Release 1.4.1 signed on 52b24f8 (manifest a410ec84), pushed, 7 approved in a fresh clone; workflow 0.25.1 installed at user and project scope and VERIFIED; five security reassessments recorded (7 of 13 current, 0 stale); workflow 0.25.2 (B89 lane-agent cost, B91 checks hold the Mac awake, B92 refusal names the entry) committed on lane/lane-cost-0924 and lane/record-refusal-0924, not merged
- **Evidence:** Full checks on 52b24f8: 110 pass 0 fail 2 skipped of 112 (second run; the first failed two steps across two system sleeps, pmset -g log); CI green on 52b24f8 and c82afef; git tag -v good; verify 6 VERIFIED 2 TAMPERED (guardrails, the other session's in-place edit); lane-agent-cost 6/6, awake 6/6, security-path-refusals 5/5, all failing on 1.4.1 where applicable
- **Next:** When the full run on e7df4a8 passes: fast-forward main through lane/lane-cost-0924 and lane/record-refusal-0924, record the sleep lesson, cut release 1.4.2 with a full run on the release commit, reassess the security controls it makes stale, maintain and handoff
- **Git:** main @ c82afef, 1 uncommitted

### 2026-09-25T01:55:44.915Z

- **State:** Releases 1.4.1 (52b24f8, manifest a410ec84) and 1.4.2 (20b410c, manifest d418b32e) signed, pushed and approved in a fresh clone (8 approved); workflow 0.25.2 installed at user and project scope and VERIFIED; B89, B91 and B92 archived; security 7 of 13 current and observed, 0 stale, 0 invalid; guardrails deliberately not updated here
- **Evidence:** Full checks on 20b410c: 113 pass, 0 fail, 2 skipped (CI-only) of 115, the runner holding the Mac awake; on 52b24f8: 110/0/2 of 112 on the second run, the first having failed two steps across two system sleeps; CI green through 599590d; git tag -v good on both tags; verify 6 VERIFIED 2 TAMPERED; evidence/live/2026-09-24-release-1.4.1.md and -1.4.2.md
- **Next:** The owner pass (docs/OWNER_WALKTHROUGH.md); B90 (a comparison task that shows what the guard adds, millions of tokens per run, not started); when the quiet-guard work merges, release it and install guardrails from that release so verify reads VERIFIED
- **Git:** main @ 599590d, 5 uncommitted

### 2026-09-25T03:53:21.496Z

- **State:** Quiet-guard lane merged (guardrails 0.12.0) with its main-only half (contracts, README, INSTALL, SECURITY, template sentence and migration 0100-instructions-3ced7e976ae9, workflow 0.25.3, CI step, entries accepted); release 1.4.3 manifest 27edff7d committed as c964483; not yet signed
- **Evidence:** Six guard suites on the rebased lane: 670, 144, 224, 163, 16, 61 pass; modes 61 under a pseudo-terminal; full checks on c964483: 114 pass, 0 fail, 2 skipped of 116; CI green on c964483; two lane defects fixed at merge (size pin, executable bit)
- **Next:** Sign 1.4.3, push the tag, fresh-clone release list, install workflow and guardrails at both scopes, verify, reassess the six stale security controls, evidence note, handoff
- **Git:** main @ c964483, 1 uncommitted

### 2026-09-25T04:10:01.935Z

- **State:** Release 1.4.3 signed on 6ae2b20 (manifest 27edff7d), pushed, 9 approved in a fresh clone; guardrails 0.12.0 (quiet mode) and workflow 0.25.3 installed at both scopes; all 8 installs VERIFIED; security 7 of 13 current and observed, 0 stale; quiet-guard lane merged and closed
- **Evidence:** Full checks on 6ae2b20 and on c964483: 114 pass, 0 fail, 2 skipped (CI-only) of 116 each; six guard suites on the rebased lane: 670, 144, 224, 163, 16, 61; modes 61 under a pseudo-terminal; CI green; git tag -v good; verify 8 VERIFIED; evidence/live/2026-09-24-release-1.4.3.md
- **Next:** The owner pass (docs/OWNER_WALKTHROUGH.md); backlog B94 (a fast-forward lane merge should trigger maintenance), B95 (the checkpoint reminder should not interrupt a wait on a run), B96 (release sign should name commits after the manifest), B93, B90
- **Git:** main @ 1348ac9, 4 uncommitted

### 2026-09-25T16:58:03.619Z

- **State:** The owner approved every waiting item on 2026-09-25 ("I approve all the things you are waiting on me for"). Done at 58ac0f9: the baseline crosswalk marked reviewed (row check first, one arguable rating in decision 39ef), the verdict column agreed for all eight, the licence check recorded as decision 8c57 (SOC 2 and PCI DSS held back under their publishers' terms, which an approval cannot override), the security report file committed. Not done from here: a named scope on the health repository, because it writes into a client's repository.
- **Evidence:** compliance-sheet, frameworks, compliance-words, docs, lint, lint-shape, records and scrub-check exit 0 on the tree committed as 58ac0f9; PCI SSC terms page last updated 12 August 2020, read 2026-09-25.
- **Next:** Prepare the history rewrite in a scratchpad clone that re-creates only the 23 commits from 815f25f onward, re-signed, so every earlier sha and every release tag stays; verify it; hand the owner one block for the ruleset toggle and the force-push; then reset main and the five lane folders at faca928, read CI, and release 1.5.0.
- **Git:** main @ 58ac0f9, 0 uncommitted

### 2026-09-25T18:20:01.127Z

- **State:** History rewrite done by the owner: main is d5dbaa2 (25 commits re-created and re-signed from the first path-bearing lane record; d9cad87 and all nine tags unchanged; ruleset back on). Local main and the five lane folders moved to it. Records now cite the new shas (77 references in 8 files, reversible), map in lesson 71cd (9ee6d3a). Release 1.5.0 in progress: preview checked (workflow 0.26.0 new tree, the other three identical to 1.4.3), changelog, README and INSTALL edits made, manifest not yet written.
- **Evidence:** Before the push, in the rewritten clone: 0 home-path lines, newest tree identical, d9cad87 unchanged, metadata identical and 25 of 25 good signatures, only the two task records changed, 9 of 9 tags on main, scrub --history exit 0. CI on d5dbaa2 success, 129 steps, 0 failed, 0 skipped; local scrub --history-all exit 0; docs, records, backlog, scrub exit 0 before 9ee6d3a.
- **Next:** When CI on 9ee6d3a is green: release create 1.5.0 --apply with the 23 evidence files, commit as Release 1.5.0, full node scripts/checks.mjs on that exact commit, release sign, tag -v, push both, release list in a fresh clone, plugin updates at both scopes, verify, the evidence note, reassess SG-RECURRING-PATTERNS and SG-SECURITY-LOGGING, handoff.
- **Git:** main @ 9ee6d3a, 5 uncommitted

### 2026-09-25T18:31:23.998Z

- **State:** Release 1.5.0 manifest committed as 71c88fd (manifest-sha256 e0fad8985882, 23 evidence files); not yet signed or pushed.
- **Evidence:** CI green on 8103936 (129 steps, 0 failed, 0 skipped); scrub, docs and release tests exit 0 on the release tree before the commit.
- **Next:** Full node scripts/checks.mjs on the commit after this checkpoint, then release sign 1.5.0 on that same commit with nothing committed between.
- **Git:** main @ 71c88fd, 0 uncommitted

### 2026-09-25T19:11:00.262Z

- **State:** The first 1.5.0 release commit (71c88fd, with checkpoint d2e07e9, never pushed) was taken back with git reset --soft to 8103936 after its full run found a real defect: a failing gate run read pmset -g log (9 s, 201,439 lines), failing two gate timeout tests. Fixed in awake.mjs (kern.sleeptime first, the log only when a sleep began after the failing step did); lesson 12f0. The stale unsigned manifest was deleted; the release restarts from the fix commit.
- **Evidence:** Full checks on d2e07e9: 120 pass, 1 fail (gate.test, 2 of 19), 2 skipped of 123; gate.test rerun at load 4.4 failed the same two, so not load. After the fix: gate.test 19 of 19 in 14.8 s (was 132 s), awake.test 7 of 7, allowlist, lint, lint-shape, preflight, docs exit 0.
- **Next:** Commit and push the fix, CI, then release create 1.5.0 again, commit, checkpoint, full checks on that commit, sign, push, prove.
- **Git:** main @ 8103936, 12 uncommitted

### 2026-09-25T19:21:19.964Z

- **State:** Release 1.5.0 manifest committed as 529f247 (manifest-sha256 1977bef3764a, 24 evidence files, built from c07882c); not yet signed or pushed.
- **Evidence:** CI green on c07882c: 129 steps, 0 failed, 0 skipped; footprint and its self-test, scrub and docs exit 0 locally.
- **Next:** Full node scripts/checks.mjs on the commit after this checkpoint, then release sign 1.5.0 on that same commit with nothing committed between.
- **Git:** main @ 529f247, 0 uncommitted

## Handoff

- **State:** Release 1.5.0 manifest committed as 529f247 (manifest-sha256 1977bef3764a, 24 evidence files, built from c07882c); not yet signed or pushed. Evidence: CI green on c07882c: 129 steps, 0 failed, 0 skipped; footprint and its self-test, scrub and docs exit 0 locally.
- **Next:** Full node scripts/checks.mjs on the commit after this checkpoint, then release sign 1.5.0 on that same commit with nothing committed between.
- **Blocked:** The force-push to main is person-only (the guard and the ruleset); the named scope on the health repository is the owner's to run in that repository.
- **Watch out:** Restart the client to load guardrails 0.12.0 and workflow 0.25.3; the guard is now in quiet mode on this machine from a signed release, so a command it cannot read runs and is noted in .git/skilliton/guardrails.jsonl; a laptop on 1.3.0 or earlier reads this register as all invalid; .skilliton/security/REPORT.md is an untracked generated file; read the clock before typing a time
