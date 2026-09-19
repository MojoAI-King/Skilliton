# Task: Wave 2: rolling maintenance, short records, backlog test

Kind: Living. Task record.

- **ID:** 2026-09-18-wave-2-rolling-maintenance-short-records-18d7
- **State:** merged
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-19T04:25:11.113Z

## Request

not yet written

## Acceptance criteria

- [ ] 01-02: skilliton checkpoint writes the task handoff bullets, the RESUME HERE block on an integration branch, and the indexes; refusals write nothing; tests prove it
- [ ] 01-02: the handoff and maintain skills and docs/MAINTAIN.md route the mechanical writes to the command and keep judgment steps as a reconciliation
- [ ] 01-03 and 05-02: scripts/living-docs.mjs bounds the RESUME HERE block (24 lines, 4500 bytes), generates the milestone table in docs/STATUS.md from PLAN.md section 7, and bounds the current-state paragraph with an archive
- [ ] 05-01: scripts/backlog.test.mjs enforces the relationship between docs/BACKLOG.md and docs/BACKLOG_ARCHIVE.md and its self-test proves each check can fail
- [ ] The report card records the owner pass at the end and the six batch files carry ticks with evidence
- [ ] The 47-step suite passes, scrub passes on tree and history, CI is green, the wave is pushed

## Decisions

not yet written

## Checkpoints

### 2026-09-19T04:16:20.925Z

- **State:** Wave 2 built: checkpoint writes the task handoff, the RESUME HERE block and the indexes (workflow 0.9.0); living-docs and backlog checks wired into MAINTAIN.md and CI; batch items ticked with evidence; report card regenerated
- **Evidence:** node scripts/lifecycle.test.mjs 38 of 38; node --test scripts/handoff-write.test.mjs 7 of 7; backlog.test.mjs and living-docs.mjs pass with self-tests; report-card.mjs --check current
- **Next:** Run the 48-step suite, scrub the tree and history, commit and push, read the CI steps, then maintain and hand off with checkpoint --handoff
- **Git:** main @ bf65a37, 35 uncommitted

### 2026-09-19T04:24:59.767Z

- **State:** Wave 2 is published and green as 33921a1 (CI run 35421068624, 52 of 52 steps, every step read): skilliton checkpoint now writes the task Handoff, the RESUME HERE block (--handoff, this note is its first live use) and the indexes (workflow 0.9.0); living-docs and backlog checks run in MAINTAIN.md step 2 and CI; 01-03, 05-01 and 05-02 at 100, 01-02 at 4 of 5. This maintenance note (lesson entry 43c7, status paragraph archived, protocol 2.73.0 outside the repo) is committed after the wave
- **Evidence:** 48-step local suite PASS, scrub tree and history PASS, CI 35421068624 success; node scripts/living-docs.mjs --check and backlog.test.mjs pass on the maintained tree
- **Next:** 1. Wave 3 in plan mode from docs/REPORT_CARD.md: 02-01 M8 second increment, 02-02 path everywhere, 02-04 stack detection; read each batch file first. 2. Next day's first session: compare the installed marketplace commit against f8a935c9b546 (01-01 item 5). 3. 04-01 item 5: measure two or three ordinary sessions at 600000 through the meter (B36). 4. Follow-up from decision 554d: the harness template line about checkpoints is edited in the next wave that changes the template anyway
- **Git:** main @ 33921a1, 4 uncommitted

## Handoff

- **State:** Wave 2 is published and green as 33921a1 (CI run 35421068624, 52 of 52 steps, every step read): skilliton checkpoint now writes the task Handoff, the RESUME HERE block (--handoff, this note is its first live use) and the indexes (workflow 0.9.0); living-docs and backlog checks run in MAINTAIN.md step 2 and CI; 01-03, 05-01 and 05-02 at 100, 01-02 at 4 of 5. This maintenance note (lesson entry 43c7, status paragraph archived, protocol 2.73.0 outside the repo) is committed after the wave. Evidence: 48-step local suite PASS, scrub tree and history PASS, CI 35421068624 success; node scripts/living-docs.mjs --check and backlog.test.mjs pass on the maintained tree.
- **Next:** 1. Wave 3 in plan mode from docs/REPORT_CARD.md: 02-01 M8 second increment, 02-02 path everywhere, 02-04 stack detection; read each batch file first. 2. Next day's first session: compare the installed marketplace commit against f8a935c9b546 (01-01 item 5). 3. 04-01 item 5: measure two or three ordinary sessions at 600000 through the meter (B36). 4. Follow-up from decision 554d: the harness template line about checkpoints is edited in the next wave that changes the template anyway
- **Blocked:** Owner pass at the end (docs/REPORT_CARD.md): interactive checklist, maintain minutes before and after (01-02 item 5, 05-05), Windows run, B7 decisions, signing key, hosted repository approval, M5 participant, Codex login. Any cost statement (PLAN.md sections 6 and 8)
- **Watch out:** Every checkpoint on main now rewrites DECISIONS.md, docs/LESSONS.md and docs/STATUS.md indexes and, with --handoff, docs/HANDOFF.md; preview first without --apply. A Written or Updated time ahead of the clock is refused, so read date before typing one. The read guard is live here; the launcher under <home>/.local/bin is the skilliton on PATH
