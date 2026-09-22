# Task: Build-complete checkpoint: install update, tag, security and behavior walkthrough, stats and the full document

Kind: Living. Task record.

- **ID:** 2026-09-21-build-complete-checkpoint-install-update-81ba
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-22T03:39:22.402Z

## Request

Mark this as a checkpoint in the development of the tool. Update the installed plugins, tag the checkpoint, run a security walkthrough and a behavior review of every hook and command, polish, then a stats page and a full document explaining the tool. Deadline Wednesday 2026-09-23 11:00 EDT.

## Acceptance criteria

- [ ] The installed plugins on this machine match the repo versions, read from the cache after the update
- [ ] A tag marks the checkpoint, labeled unsigned if no signing key was used
- [ ] Each of the six security surfaces is tested and its result recorded, fixed or documented as a limit
- [ ] Every hook and command is checked for what it blocks, what it says, and that it never reports success falsely
- [ ] A private stats page with every figure labeled by source, the meter figure marked unverified
- [ ] A full document for the owner describing the tool as it stands, with its source in docs/

## Decisions

not yet written

## Checkpoints

### 2026-09-21T21:22:52.325Z

- **State:** Installed plugins updated to the repo versions: workflow 0.8.0 to 0.15.0, guardrails 0.4.0 to 0.5.1, context-hygiene already 0.3.0, code-quality 0.2.0 installed; marketplace clone at 84ded53
- **Evidence:** installed_plugins.json names the four new cache paths; diff -rq of each against packs/base/plugins exits 0; old cache copies 0.8.0 and 0.4.0 still carry .in_use but the registry does not point at them; takes effect on restart
- **Next:** Tag the checkpoint, then the meter before/after, then the security walkthrough
- **Git:** main @ 84ded53, 1 uncommitted

### 2026-09-21T21:32:06.876Z

- **State:** Release 0.9.0 signed, pushed and approved; verify's false TAMPERED on in-use plugins fixed in workflow 0.15.1 and pushed; meter run over September kept in the scratchpad, unverified
- **Evidence:** release list: 1 approved; verify after the fix: 7 of 7 VERIFIED; release.test 27 pass; lint, docs, scrub exit 0; gate suite before the manifest commit 19 pass with the harness proof red
- **Next:** Watch CI for the fix commit; security walkthrough surfaces 1 to 6
- **Git:** main @ 3e89927, 0 uncommitted

### 2026-09-21T21:43:57.542Z

- **State:** Security walkthrough surfaces 1, 2 and 4 tested. Findings: a repo config lowering a guardrail is announced at session start but the allowed command itself is silent; a stranger's handoff text is shown verbatim at session start with no line saying it is a record and not an instruction, though it is size-bounded; bash -c, sh -c and eval wrapping a force-push are allowed silently, a limit the guardrails skill documents; every direct force-push form, env prefix, comment, newline and 300KB command was denied; malformed input naming git asks; the secrets collector never printed or stored a planted value. main has no branch protection and no rulesets; 2FA state not readable from this token. Two fixes shipped: verify's false TAMPERED, and join's refusal order after the first signed release.
- **Evidence:** hook runs recorded in the scratchpad; rename, join, release and lint tests exit 0 after the join fix; CI for b0dc663 and 3e89927 red at step 49 for the join order, fix pushed
- **Next:** Watch CI; surfaces 3, 5, 6; decide fixes for the per-command silence and the nested-shell ask; then the behavior review
- **Git:** main @ 4f4be07, 0 uncommitted

### 2026-09-21T21:47:17.759Z

- **State:** Surface 5 done: everything under HOME that the tool wrote (trust, joined, launcher, backups, read-guard log) is on the declared list in docs/IT-ALLOWLIST.md; one pre-rename backups folder under the earlier name also exists; preflight 40 ok, 1 not checked. Surface 3: every commit since the rename is SSH-signed; main has no protection, recorded as B52 for the owner. Handoff header framing shipped as workflow 0.15.3 (71f9da2). B50 and B51 hold the two guardrail designs with the live probe each needs.
- **Evidence:** ls of the declared folders; skilliton preflight; git log --format=%G? shows G on the last four commits; handoff-hook test 104 checks, hook-fixture, lint, docs, backlog, records tests all exit 0; CI for 4f4be07 and 71f9da2 pending
- **Next:** Read both CI runs step by step; then the behavior review of every hook and command (Tuesday), then polish, then the stats page and the full document
- **Git:** main @ 71f9da2, 0 uncommitted

### 2026-09-21T21:52:04.702Z

- **State:** Owner test finding fixed: join names every missing flag at once, names existing joins, suggests prepare, warns before a second company; README opens with the two roles; B53 for the signers file; workflow 0.15.4
- **Evidence:** join.test 41 pass; rename, lint, docs, backlog exit 0; scrub 0; CI for 4f4be07 and 71f9da2 each 63 of 63
- **Next:** Watch CI for this commit; then the behavior review of every hook and command
- **Git:** main @ ba73ec8, 0 uncommitted

### 2026-09-21T21:59:22.511Z

- **State:** Behavior review done: 11 hooks x 3 inputs x 2 repos, 66 runs, every exit 0, no crash, every silence an allow; 29 commands bare and --help, nothing written without --apply, nothing silent, every --help exits 0. One low note: skilliton hook events swallow malformed input silently where guard-bash asks. Owner's new direction 2026-09-21 evening: joining must be much easier; the document leads with a tech facts block (language, stack, versions) and a flow section: fork to a Desktop folder, make it yours, add skills, roll it out to every company laptop, or use it as-is
- **Evidence:** hook-matrix.out and cmd-matrix.out in the scratchpad; harness first failed with exit 127 on macOS timeout and was fixed before any row was believed
- **Next:** Design the easier join and rollout flow from RELEASING, PHASE-3, IT-ALLOWLIST and company init; implement the cheapest real simplification; then the document
- **Git:** main @ 98564c8, 0 uncommitted

### 2026-09-21T22:06:03.366Z

- **State:** Joining takes one file: company join-file writes skilliton.join/1 outside any working tree, join --from joins with it; the three-flag form stays. Decision entry written. The real mojoai join file exists at ~/handout/mojoai.skilliton-join.json on this Mac, made from the trust file that signed 0.9.0; where the company publishes it is still B53. Workflow plugin 0.15.5 at 441a5e3
- **Evidence:** join.test 42 pass; lint, docs, records, scrub exit 0; company join-file preview then apply on this Mac, then join --from preview reads the file and reports the machine already joined
- **Next:** Read CI for 441a5e3; write tonight's handoff; Tuesday: polish, the stats page and the owner document with the tech facts block first and the flow section (fork to Desktop, make it yours, add skills, roll out with the join file, or use as-is)
- **Git:** main @ 441a5e3, 0 uncommitted

### 2026-09-22T01:42:03.687Z

- **State:** The checkpoint evening is complete: main at 84707da, every CI run 63 of 63 (two reds this evening, both fixed the same hour). Release 0.9.0 is signed, approved and verified from a fresh GitHub clone; installed plugins match the repo; a ruleset protects main. Joining is one file: company join-file writes skilliton.join/1 outside any working tree and join --from joins with it; join names every missing flag and what the machine already joined. Security walkthrough done over six surfaces with four fixes shipped (verify in-use markers 0.15.1, join refusal order 0.15.2, handoff header framing 0.15.3, shell strings naming git ask 0.5.2). Behavior review: 66 hook runs and 29 commands bare, nothing silent, nothing written without --apply. Report card 83 of 123. The owner guide (docs/OWNER_GUIDE.md and a private page) and the scorecard page are published for the owner; the meter figure on the scorecard is unverified until the owner checks the Usage screen
- **Evidence:** CI runs for b0dc663 through 84707da read step by step; guardrails 549 checks; join 42 tests; release 27; rename, lifecycle 55, prepare, migrate 14, docs with self-test, backlog, records, allowlist, lint, scrub all exit 0; hook-matrix.out, cmd-matrix.out and apply-sweep.out kept in the scratchpad; verify --source on a fresh clone reads 7 of 7 VERIFIED
- **Next:** Tuesday: polish (B54 import and new-skill preview; B50 needs a live probe of systemMessage on PreToolUse; B43 folding; B47 as a test), decide on extra skills only after evals, then a 1.0.0 release Wednesday morning before the 11:00 meeting
- **Git:** main @ 84707da, 0 uncommitted

### 2026-09-22T02:02:49.572Z

- **State:** Scorecard push under the owner's approval: nine items ticked with live evidence (this extension session, the hosted gate on a throwaway repository, install and a real update from a throwaway private repository), report card 92 of 123 at 5b330f4; the index engine says once what it cannot list after the owner's own repository showed the defect (workflow 0.15.6). A real two-lane dispatch is running from LANES.md at base 5b330f4: lane/preview-0921 (B54) and lane/sweep-0921 (B47), each as a sonnet agent given the shipped lane definition, because the client offered no lane agent type in this session. The stop hook asked for this checkpoint on the uncommitted LANES.md, which is batch 01-01 item 6 seen live. The two throwaway repositories still exist: the gh token lacks the delete_repo scope
- **Evidence:** records.test 11 pass; lint, docs, backlog exit 0; scrub exit 0 after home paths were replaced in the evidence files; CI for 5b330f4 still running; dispatch --apply created both worktrees and briefs
- **Next:** Read both LANE_REPORT.md files, gate each lane, merge serially, dispatch merge for the records, meter the lanes' peak context, file the dispatch evidence, tick 07-02 and 07-04 where honest, report card, handoff
- **Git:** main @ 5b330f4, 1 uncommitted

### 2026-09-22T02:29:39.837Z

- **State:** The first real dispatch is merged: lane/sweep-0921 (B47) and lane/preview-0921 (B54, workflow 0.15.7) rebased and merged serially at 22d98a7 and efb136a, then 3140cbd fixed the four callers of new-skill and import the full suite caught (demo-day and three rehearsals) with the guides and contract rows; B38, B47, B54 closed into the archive, B55 opened (dispatch drops a mis-numbered LANES.md item without a word); batch 07-02 items 1 and 3 and 01-01 item 6 ticked with evidence/live/2026-09-21-dispatch.md and the stop hook's live text; report card 95 of 123; lesson recorded that a lane's test is its own file and the integrating gate is the whole suite
- **Evidence:** Lane one: skilliton.test 197 checks and lint PASS through the gate, 0 dashes, preview by hand wrote nothing. Lane two: prepare.test 42 tests and lint PASS. Full suite on the merged tree 56 of 57 (demo-day red, fixed), then demo-day, docs, skilliton, lint, names, scrub, projects rehearsal, enrollment self-test, backlog, records, report-card check and test, living-docs, evidence all exit 0. Per-lane peak context 107161 and 115485 under 120000 by the meter's definition over each lane transcript. CI 35679609193 for 3140cbd in progress
- **Next:** Read CI 35679609193 step by step; update the installed plugins to 0.15.7; republish the scorecard page with 95 of 123; Tuesday polish: B50 live probe, B55, B43 folding, decide extra skills only after evals; 1.0.0 release Wednesday morning before 11:00
- **Git:** main @ 3140cbd, 0 uncommitted

### 2026-09-22T02:53:54.217Z

- **State:** Dispatch follow-up complete and pushed: main at 8750c8c, CI 63 of 63 on 3140cbd and 8750c8c; installed plugins at 0.15.7 and 0.5.2 at user and project scope (restart applies them); scorecard page republished with 95 of 123; the owner deleted the two throwaway repositories and the two lane worktrees and branches, confirmed by gh repo list, git worktree list and git branch
- **Evidence:** gh repo list MojoAI-King shows no throwaway repository; git worktree list and git branch show no lane entries; CI runs 35679609193 and 35679893771 read as success with 63 steps and 0 failures
- **Next:** Tuesday polish: B50 live probe of systemMessage on PreToolUse, B55 dispatch names a dropped LANES.md item, B43 folding; extra skills only after evals; 1.0.0 release Wednesday morning before 11:00
- **Git:** main @ 8750c8c, 0 uncommitted

### 2026-09-22T03:39:22.402Z

- **State:** Nothing changed in the tree since b4e98ee; the reminder fired because that commit moved HEAD. Tuesday plan agreed in conversation: the owner tests eight things at the keyboard in one of their own repos (first screen, a real task through task start and gate, the confirmation prompt on git checkout -- . which is B5, the read guard, the stop hook, the next-morning where-did-we-leave-off question, /review, /maintain) and reports which they would pay for; the session asks for a go-ahead on a cold judge-style review by a fresh subagent, rewrites the README in the judge's reading order, adds a one-screen docs map with archived material under docs/archive, works the delivery.mjs pin, then B50, B55, B43, then 1.0.0 Wednesday morning
- **Evidence:** git status clean at b4e98ee; CI 35679893771 success 63 of 63; no checks run since
- **Next:** Wait for the owner's go-ahead on the cold review and their keyboard results; start the README reorder and the docs map meanwhile
- **Git:** main @ b4e98ee, 0 uncommitted

## Handoff

- **State:** Nothing changed in the tree since b4e98ee; the reminder fired because that commit moved HEAD. Tuesday plan agreed in conversation: the owner tests eight things at the keyboard in one of their own repos (first screen, a real task through task start and gate, the confirmation prompt on git checkout -- . which is B5, the read guard, the stop hook, the next-morning where-did-we-leave-off question, /review, /maintain) and reports which they would pay for; the session asks for a go-ahead on a cold judge-style review by a fresh subagent, rewrites the README in the judge's reading order, adds a one-screen docs map with archived material under docs/archive, works the delivery.mjs pin, then B50, B55, B43, then 1.0.0 Wednesday morning. Evidence: git status clean at b4e98ee; CI 35679893771 success 63 of 63; no checks run since.
- **Next:** Wait for the owner's go-ahead on the cold review and their keyboard results; start the README reorder and the docs map meanwhile
- **Blocked:** B53: where the company's join file is published is the owner's call; the fifteen security applicability decisions; every walkthrough step that needs another machine or a real person
- **Watch out:** Every checkpoint on main rewrites the indexes and, with --handoff, docs/HANDOFF.md; preview first without --apply. A Written or Updated time ahead of the clock is refused, so read date before typing one. prepare --apply in a repository with a test command now writes .skilliton/delivery.draft.json; no gate runs it until delivery confirm. A template edit makes migration 0100 pending here: run migrate --apply and commit the receipt. B49 is an unexplained exit 2 from allowlist.test.mjs seen once and not reproduced; keep every batch gate run's full output in a file, because that one was filtered through grep and its message is gone. Two numbers written on 2026-09-21 were never measured and had to be corrected: the CI step total said 60 and is 63, and three plugin versions were set from memory
