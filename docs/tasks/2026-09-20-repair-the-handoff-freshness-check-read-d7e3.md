# Task: Repair: the handoff freshness check read its own write as later work

Kind: Living. Task record.

- **ID:** 2026-09-20-repair-the-handoff-freshness-check-read-d7e3
- **State:** merged
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-20T05:55:12.659Z

## Request

CI run 35491126289 failed on 3896fcb, the wave 4 maintenance commit: the handoff check reported two files the same checkpoint wrote as changes made after the note

## Acceptance criteria

- [x] the mechanism is stated, not guessed: a minute-granularity Written line compared against millisecond file times over a write that straddles a minute boundary (evidence: the lesson entry 2026-09-20-a-minute-granularity-timestamp-compared-32a5 states it, and the failing-first test reproduced it deterministically)
- [x] a failing-first test reproduces the CI assertion and passes after the fix, and pins the window so it cannot be widened silently (evidence: scripts/lifecycle.test.mjs line 1403, fail 1 before the change with the CI assertion, pass 1 fail 0 after; the 30-second case pins the window)
- [x] the window is in the handoff contract and the lesson is recorded with its enforcement (evidence: docs/CONTRACTS.md handoff section, the Freshness bullet naming HANDOFF_WRITE_WINDOW_MS; docs/LESSONS.md lists the entry)
- [x] the offline suite passes and CI is green again on main, every step read (evidence: the offline suite 50 of 50 with no failures; CI run 35492630614 success, 54 of 54 steps read one by one)

## Decisions

- **The tolerance is five seconds and it is a constant with its reasoning attached**, not a number inline: `HANDOFF_WRITE_WINDOW_MS` in `runtime/lib/lifecycle.mjs`. It has to cover one checkpoint's own write, which is under a second, and nothing more; the next real edit in a session is minutes away. The comment says that so the next reader does not widen it.
- **The window applies to the uncommitted-change comparison only.** A commit is never part of a checkpoint's write, and a commit that touched the handoff is already excused by `coveredByHandoffCommit`, so a window there would only weaken the check.
- **No decision entry was opened.** The rule lives where a reimplementation would look for it: the Freshness bullet of the handoff section in docs/CONTRACTS.md, with the lesson entry behind it. It is a defect repair with one parameter, not an architectural choice.

## Checkpoints

### 2026-09-20T05:53:17.125Z

- **State:** The handoff freshness defect CI found on 3896fcb is fixed and published as 2e5aaa3 (workflow 0.11.1): a minute-granularity Written line compared against millisecond file times reported the checkpoint's own index write as later work, so a change within five seconds of the end of the Written minute now counts as part of that write
- **Evidence:** CI run 35492630614 on 2e5aaa3 is success with all 54 steps read one by one, including step 38 Tasks, checkpoints, status and lifecycle hooks, the step that failed on run 35491126289; the new test at scripts/lifecycle.test.mjs reproduced the CI assertion before the fix and passes after; the offline suite 50 of 50 with no failures; scrub-check PASS on the tree and over the history
- **Next:** Wave 5 from docs/REPORT_CARD.md, read the batch files under docs/areas/ first
- **Git:** main @ 2e5aaa3, 0 uncommitted

## Handoff

- **State:** The handoff freshness defect CI found on 3896fcb is fixed and published as 2e5aaa3 (workflow 0.11.1): a minute-granularity Written line compared against millisecond file times reported the checkpoint's own index write as later work, so a change within five seconds of the end of the Written minute now counts as part of that write. Evidence: CI run 35492630614 on 2e5aaa3 is success with all 54 steps read one by one, including step 38 Tasks, checkpoints, status and lifecycle hooks, the step that failed on run 35491126289; the new test at scripts/lifecycle.test.mjs reproduced the CI assertion before the fix and passes after; the offline suite 50 of 50 with no failures; scrub-check PASS on the tree and over the history.
- **Next:** Wave 5 from docs/REPORT_CARD.md, read the batch files under docs/areas/ first
- **Blocked:** Owner pass at the end (docs/REPORT_CARD.md): interactive checklist, maintain minutes (01-02 item 5, 05-05), the live unprepared session (02-01 item 5), Windows run including skilliton.cmd, B7 decisions, signing key, hosted repository approval, M5 participant, Codex login. Any cost statement (PLAN.md sections 6 and 8)
- **Watch out:** Every checkpoint on main rewrites the indexes and, with --handoff, docs/HANDOFF.md; preview first without --apply. A Written or Updated time ahead of the clock is refused, so read date before typing one. prepare --apply in a repository with a test command now writes .skilliton/delivery.draft.json; no gate runs it until delivery confirm. A template edit makes migration 0100 pending here: run migrate --apply and commit the receipt
