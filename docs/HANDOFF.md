# Handoff

Kind: Living.

## RESUME HERE

Written: 2026-09-21 07:26 EDT

- **State:** Wave 8 is shipped and the build phase is over: main at 7779d50 plus this maintain commit, report card 81 of 123, every remaining batch owner-gated. Evidence: CI runs 35590884701, 35591036358 and 35591331918 each 63 of 63 steps read individually; 19 local gates each with its status read from the gate itself after a known-failing command proved the runner reports FAIL; scrub-check over the tree and over history exit 0; the whole-tree audit 0 findings over 544 files with 45 allowed lines.
- **Next:** The owner pass, in the order docs/OWNER_WALKTHROUGH.md sets; no session-doable work is left outside that list except the open backlog rows B37 to B49
- **Blocked:** Nothing on a session. Every open batch needs the owner: a live session filed as evidence, a clean macOS account, a Windows machine, a signing key, a hosted repository, a real participant, or the fifteen applicability decisions
- **Watch out:** Every checkpoint on main rewrites the indexes and, with --handoff, docs/HANDOFF.md; preview first without --apply. A Written or Updated time ahead of the clock is refused, so read date before typing one. prepare --apply in a repository with a test command now writes .skilliton/delivery.draft.json; no gate runs it until delivery confirm. A template edit makes migration 0100 pending here: run migrate --apply and commit the receipt. B49 is an unexplained exit 2 from allowlist.test.mjs seen once and not reproduced; keep every batch gate run's full output in a file, because that one was filtered through grep and its message is gone. Two numbers written on 2026-09-21 were never measured and had to be corrected: the CI step total said 60 and is 63, and three plugin versions were set from memory
- **Git:** main @ 7779d50, 5 uncommitted

## Earlier

### 2026-09-21 07:09 EDT
- **State:** Wave 8 is shipped and the build phase is over: main at 7779d50, report card 81 of 123, every remaining batch owner-gated. Evidence: CI runs 35590884701, 35591036358 and 35591331918 each 63 of 63 steps read individually; 19 local gates each with its status read from the gate itself after a known-failing command proved the runner reports FAIL; scrub-check over the tree and over history exit 0; the whole-tree audit 0 findings over 544 files with 45 allowed lines.
- **Next:** The owner pass, in the order docs/OWNER_WALKTHROUGH.md sets; no session-doable work is left outside that list except the open backlog rows B37 to B48
- **Blocked:** Nothing on a session. Every open batch needs the owner: a live session filed as evidence, a clean macOS account, a Windows machine, a signing key, a hosted repository, a real participant, or the fifteen applicability decisions
- **Watch out:** Every checkpoint on main rewrites the indexes and, with --handoff, docs/HANDOFF.md; preview first without --apply. A Written or Updated time ahead of the clock is refused, so read date before typing one. prepare --apply in a repository with a test command now writes .skilliton/delivery.draft.json; no gate runs it until delivery confirm. A template edit makes migration 0100 pending here: run migrate --apply and commit the receipt. Two numbers written on 2026-09-21 were never measured and had to be corrected in follow-up commits: the CI step total said 60 and is 63, and three plugin versions were set from memory; read a total from the run and a version from its plugin.json
- **Git:** main @ 7779d50, 0 uncommitted

### 2026-09-21 00:20 EDT
- **State:** Wave 7 is on main at 51c38e5 and green: the audit that runs itself in three places, the supported client rule, skilliton usage, and the Codex and Cursor decisions, then this maintenance pass on top of them. Evidence: CI 35559200451 on f1a878a and 35560317702 on 51c38e5, both success, all 61 steps read one by one; the audit over the 47 files the wave changed reports 0 findings with 6 allowed lines, and over all 475 files this repository has ever changed 41 findings, every one a rule's own pattern or a planted fixture (B45); records gates each its own step, backlog, living-docs --check, docs, report-card --check, names all exit 0; scrub-check PASS on the tree and over 138 commits.
- **Next:** Wave 8, the last build wave: 06-03's cleanup skills first, then the authorized eval run, and B45's allow markers. Then the owner pass
- **Blocked:** The owner pass list in docs/REPORT_CARD.md: interactive checklist, maintain minutes, the live unprepared session, the Windows run, B7 decisions, signing key, hosted repository approval, M5 participant, Codex login. Any cost statement (PLAN.md sections 6 and 8)
- **Watch out:** A repository with a delivery policy would now reject a push touching scripts/guardrails.test.sh, guard-bash.sh or scripts/preflight.test.mjs, because the audit reads their own patterns as findings; B45 marks those lines and nothing here is gated meanwhile (B43). The parallel session still owns task/promo-anatomy in ~/Desktop/Skilliton-promo: do not clean that worktree or merge that branch
- **Git:** main @ 51c38e5, 3 uncommitted

### 2026-09-20 17:14 EDT
- **State:** Wave 6 is on main at c8bd045 and green; this maintenance pass added the gate list finding as a lesson and B43. Evidence: Every index current before the pass; docs, living-docs --check and backlog all exit 0 after it; the 42 scripts named in docs/MAINTAIN.md step 2 and in checks.yml were extracted and compared, and they match.
- **Next:** Wave 7 from docs/REPORT_CARD.md, planned in plan mode with the batch files under docs/areas read first
- **Blocked:** nothing
- **Watch out:** A parallel session owns task/promo-anatomy in the sibling worktree ~/Desktop/Skilliton-promo, five commits ahead of main with uncommitted work and a site/ tree that is not on main: do not clean those worktrees or merge that branch
- **Git:** main @ c8bd045, 4 uncommitted

### 2026-09-20 15:47 EDT
- **State:** Wave 6 is on main at 634da8e and green: the four headless batches built and pushed, then the maintenance pass on top of them. Evidence: Full offline suite 48 of 48 steps exit 0; scrub-check tree and history both PASS; report-card --check exit 0 at 65 of 123; CI 35532803307 (6e072b7) and 35533207494 (634da8e) both success, all 58 steps read.
- **Next:** Wave 7 from docs/REPORT_CARD.md, planned in plan mode with the batch files under docs/areas read first
- **Blocked:** nothing
- **Watch out:** The dispatch suggestion ships on UserPromptSubmit, which has never been seen delivered to a plugin hook (DECISIONS.md O27); one live prompt settles it or the registration comes out
- **Git:** main @ 634da8e, 1 uncommitted

### 2026-09-20 13:39 EDT
- **State:** Wave 5 is published as e8dde88 and this session's maintenance is closed: two lesson entries (a070 an assertion that could not fail because the fixture made both sources agree, 3b76 a test killed by its own timeout under contention), the wave task record closed as merged, and the stale claims reconciled (the README's dispatch row and its CI list, the integration brief's coordinating paragraph, the dispatch CI step name, and a new open item O26 for the one path the lane write guard cannot see). Evidence: Nine gates, each its own step with its exit status read on its own line, all PASS after the edits: scrub-check, docs, names, packs, allowlist, lint, living-docs --check, report-card --check, backlog; node --test scripts/dispatch.test.mjs 22 of 22, which is the number the README now states instead of 14; skilliton index reports every index current after the task close rewrote the open-task list.
- **Next:** Wave 6 from docs/REPORT_CARD.md. Carried: B38 the first real dispatch measured (owner pass), B39 a formatter or a decision that there is none, B37 the two OperationFailed classes, 04-01 item 5 measuring a 600000 window through the meter, and O26 decided after the first real dispatch
- **Blocked:** Owner pass at the end (docs/REPORT_CARD.md): interactive checklist, maintain minutes (01-02 item 5, 05-05), the live unprepared session (02-01 item 5), Windows run including skilliton.cmd, B7 decisions, signing key, hosted repository approval, M5 participant, Codex login. Any cost statement (PLAN.md sections 6 and 8)
- **Watch out:** Every checkpoint on main rewrites the indexes and, with --handoff, docs/HANDOFF.md; preview first without --apply. A Written or Updated time ahead of the clock is refused, so read date before typing one. prepare --apply in a repository with a test command now writes .skilliton/delivery.draft.json; no gate runs it until delivery confirm. A template edit makes migration 0100 pending here: run migrate --apply and commit the receipt
- **Git:** main @ e8dde88, 11 uncommitted
