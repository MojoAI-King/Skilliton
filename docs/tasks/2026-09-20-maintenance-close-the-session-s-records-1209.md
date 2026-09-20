# Task: Maintenance: close the session's records after the handoff freshness repair

Kind: Living. Task record.

- **ID:** 2026-09-20-maintenance-close-the-session-s-records-1209
- **State:** merged
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-20T06:33:41.335Z

## Request

/maintain

## Acceptance criteria

- [x] Both of the session's lessons are entry files with a mechanism and an enforcement line, and the lessons index names them (evidence: docs/lessons/2026-09-20-a-minute-granularity-timestamp-compared-32a5.md and docs/lessons/2026-09-20-a-command-held-in-a-variable-is-one-word-5d82.md, each with the five parts; 5d82's enforcement section says plainly that nothing automatic catches a hand-written loop; skilliton index reports the lessons index current at 28 entries)
- [x] The stale-claims sweep, the DECISIONS open items and the backlog are reconciled, with every file that needed nothing reported as verified current (evidence: the docs/MAINTAIN.md step 6 grep returned 14 hits outside the archives and every one is a true open claim the repair did not change; O21, O22 and O25 stay open as written; B36 and B37 unchanged; docs/CONTRACTS.md already carries the workflow 0.11.1 freshness bullet; docs/STATUS.md current-state paragraph left unchanged and verified current)
- [x] The cross-project lessons file and the validation protocol outside this repository are sharpened rather than duplicated, and the protocol's version, ledger row and gate move together or not at all (evidence: two existing sections sharpened and no new section added in the portable file; the protocol moved 2.74.0 to 2.75.1 in two steps, each with its ledger row and its gate text; neither file is in this repository and neither is ever committed here)
- [x] docs/HANDOFF.md is current against the last commit and skilliton status reads it as ok (evidence: skilliton status on 9aba45d reads "docs/HANDOFF.md was written 2026-09-20 02:32 EDT; no later commit or uncommitted change (0 uncommitted paths)"; the only item still needing attention is security, which is the standing evidence state, not this pass)

## Decisions

- The maintenance pass was given its own task record rather than reopening the repair's. The repair record is closed as merged, and a checkpoint added to a merged record would say work continued after it was declared finished. A `checkpoint --handoff` needs an open task on the branch, so the honest form is a new record for the pass itself.
- The second lesson was committed separately from the repair's maintenance note, which left the handoff one commit behind and made the freshness check report ATTENTION. That is the check working, not a defect: the fix is one more checkpoint, which is what docs/MAINTAIN.md step 6 prescribes. The lesson to carry is that a session's lessons are better harvested once, before the maintenance commit, than in two passes.
- No decision entry was opened for this pass. It reconciles records and changes no shared name, format or behavior, and DECISIONS.md is for choices a future reader would otherwise have to reconstruct.

## Checkpoints

### 2026-09-20T06:32:36.497Z

- **State:** Wave 4 and the handoff freshness repair are published and green, and this session's maintenance is closed: two lesson entries (32a5 the minute-granularity timestamp compared against file times, 5d82 a loop that ran six checks as one-word commands and reported six PASS with none started), the stale-claims sweep and the open items reconciled with no change needed, and the two cross-project files outside this repository sharpened rather than duplicated
- **Evidence:** CI 35492630614 on 2e5aaa3 and 35492905976 on c668317, both success with all 54 steps read one by one; scrub-check PASS on the tree and over 122 commits of history; skilliton index reports every index current; living-docs --check current; docs.test exit 0; the zsh word-splitting claim in lesson 5d82 was measured on this machine, not recalled
- **Next:** Wave 5 from docs/REPORT_CARD.md, in plan mode, reading the batch files under docs/areas/ first
- **Git:** main @ 8bc9211, 1 uncommitted

## Handoff

- **State:** Wave 4 and the handoff freshness repair are published and green, and this session's maintenance is closed: two lesson entries (32a5 the minute-granularity timestamp compared against file times, 5d82 a loop that ran six checks as one-word commands and reported six PASS with none started), the stale-claims sweep and the open items reconciled with no change needed, and the two cross-project files outside this repository sharpened rather than duplicated. Evidence: CI 35492630614 on 2e5aaa3 and 35492905976 on c668317, both success with all 54 steps read one by one; scrub-check PASS on the tree and over 122 commits of history; skilliton index reports every index current; living-docs --check current; docs.test exit 0; the zsh word-splitting claim in lesson 5d82 was measured on this machine, not recalled.
- **Next:** Wave 5 from docs/REPORT_CARD.md, in plan mode, reading the batch files under docs/areas/ first
- **Blocked:** Owner pass at the end (docs/REPORT_CARD.md): interactive checklist, maintain minutes (01-02 item 5, 05-05), the live unprepared session (02-01 item 5), Windows run including skilliton.cmd, B7 decisions, signing key, hosted repository approval, M5 participant, Codex login. Any cost statement (PLAN.md sections 6 and 8)
- **Watch out:** Every checkpoint on main rewrites the indexes and, with --handoff, docs/HANDOFF.md; preview first without --apply. A Written or Updated time ahead of the clock is refused, so read date before typing one. prepare --apply in a repository with a test command now writes .skilliton/delivery.draft.json; no gate runs it until delivery confirm. A template edit makes migration 0100 pending here: run migrate --apply and commit the receipt
