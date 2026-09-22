# Task: The evening goal: everything that does not need the owner, built, verified and on main, and one test list

Kind: Living. Task record.

- **ID:** 2026-09-22-the-evening-goal-everything-that-does-no-36a4
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-22T21:49:06.256Z

## Request

by tonight, everything in Skilliton that does not need the owner is built, verified and on main, and I get one test list for tonight

## Acceptance criteria

- [ ] dispatch runs without a person, proved live
- [ ] the step 2 backlog items closed with evidence or a reason
- [ ] O25 to O28 reconciled and no finished task left open
- [ ] the meeting documents, PDFs and both pages refreshed; the report card recomputed without touching a letter
- [ ] 1.0.0 prepared up to signing, then the owner is asked
- [ ] docs/OWNER_TESTS.md lists every item only the owner can do

## Decisions

not yet written

## Checkpoints

### 2026-09-22T21:48:56.629Z

- **State:** The evening goal is done except the owner's steps. Dispatch runs without a person (workflow 0.20.0 and 0.20.1): the prompt hook now reads the field Claude Code sends (prompt, not user_prompt; the note had never fired before) and directs /workflow:dispatch, and the stop hook asks once more when no LANES.md was written; proven live, the assistant ran dispatch from the note. Fifteen backlog items closed today, eleven in one pass (workflow 0.21.0, guardrails 0.7.0: B50 notice for a turned-off guardrail, B56 case-insensitive root, B60 handoff.keepEarlier with 0 here, B59 the size ceiling over scripts, B43 one check list, B11 Node 22, B49 mechanism reproduced, B35, B39, B40, B57 by evidence or decision); B58 stays open after 1.0.0; B63 new, the meter has no price for claude-opus-5-5. O25 closed by measurement (the 600000 window is honored), O26 by decision, O27 and O28 by measurement. Report card 99 of 123, no letter changed. README, OWNER_GUIDE, PLAIN_GUIDE, WHITE_PAPER, TROUBLESHOOTING and the walkthrough refreshed, the three handout PDFs rebuilt, the owner guide page (version 2) and scorecard page (version 3) republished. docs/OWNER_TESTS.md is tonight's list. 1.0.0: every precondition checked and the manifest previewed at 9ff92ef, nothing written; the manifest, the signature and the push wait for the owner's go.
- **Evidence:** scripts/checks.mjs 56 pass, 0 fail, 2 skipped of 58 on each step; lifecycle 59 of 59; guardrails 676 checks; gh runs for cf97905, 88ef6e3, 6d0d24b, 5f9593b and 9ff92ef: 64 steps each, 0 not success; live runs in evidence/live/2026-09-22-dispatch-automation-live.md; release create 1.0.0 preview exit 0; scrub exit 0 before every commit
- **Next:** The owner works through docs/OWNER_TESTS.md tonight and pastes the notes into the next session, which files them as evidence and ticks the boxes. On the owner's go: /workflow:release from step 2 for 1.0.0 (release create --apply with the seven evidence files, changelog moved, commit, release sign, push the commit and the tag together, fresh-clone proof, plugin updates, verify). Then B63 from the published pricing page. Meeting Wednesday 11:00.
- **Git:** main @ 9ff92ef, 2 uncommitted

## Handoff

- **State:** The evening goal is done except the owner's steps. Dispatch runs without a person (workflow 0.20.0 and 0.20.1): the prompt hook now reads the field Claude Code sends (prompt, not user_prompt; the note had never fired before) and directs /workflow:dispatch, and the stop hook asks once more when no LANES.md was written; proven live, the assistant ran dispatch from the note. Fifteen backlog items closed today, eleven in one pass (workflow 0.21.0, guardrails 0.7.0: B50 notice for a turned-off guardrail, B56 case-insensitive root, B60 handoff.keepEarlier with 0 here, B59 the size ceiling over scripts, B43 one check list, B11 Node 22, B49 mechanism reproduced, B35, B39, B40, B57 by evidence or decision); B58 stays open after 1.0.0; B63 new, the meter has no price for claude-opus-5-5. O25 closed by measurement (the 600000 window is honored), O26 by decision, O27 and O28 by measurement. Report card 99 of 123, no letter changed. README, OWNER_GUIDE, PLAIN_GUIDE, WHITE_PAPER, TROUBLESHOOTING and the walkthrough refreshed, the three handout PDFs rebuilt, the owner guide page (version 2) and scorecard page (version 3) republished. docs/OWNER_TESTS.md is tonight's list. 1.0.0: every precondition checked and the manifest previewed at 9ff92ef, nothing written; the manifest, the signature and the push wait for the owner's go. Evidence: scripts/checks.mjs 56 pass, 0 fail, 2 skipped of 58 on each step; lifecycle 59 of 59; guardrails 676 checks; gh runs for cf97905, 88ef6e3, 6d0d24b, 5f9593b and 9ff92ef: 64 steps each, 0 not success; live runs in evidence/live/2026-09-22-dispatch-automation-live.md; release create 1.0.0 preview exit 0; scrub exit 0 before every commit.
- **Next:** The owner works through docs/OWNER_TESTS.md tonight and pastes the notes into the next session, which files them as evidence and ticks the boxes. On the owner's go: /workflow:release from step 2 for 1.0.0 (release create --apply with the seven evidence files, changelog moved, commit, release sign, push the commit and the tag together, fresh-clone proof, plugin updates, verify). Then B63 from the published pricing page. Meeting Wednesday 11:00.
- **Blocked:** The owner's items in docs/OWNER_TESTS.md: the extension keyboard checks, the 15 applicability decisions, the Usage screen comparison, the maintain minutes, B53, the go for 1.0.0; and every step that needs another person, machine or account
- **Watch out:** Plugins went to workflow 0.21.0 and guardrails 0.7.0 at 17:06 EDT: restart the client before testing. This repository keeps no Earlier entries in the handoff (handoff.keepEarlier 0); older notes are in docs/HANDOFF_ARCHIVE.md. The size ceiling now covers scripts/, so a test file cannot grow past its pin; put new tests in a new file. The meter marks 2026-09-21 and later INCOMPLETE until B63 is done; request counts and peak context are still exact. Read the clock before typing a time.
