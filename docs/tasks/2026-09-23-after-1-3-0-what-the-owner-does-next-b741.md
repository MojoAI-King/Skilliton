# Task: After 1.3.0: what the owner does next

Kind: Living. Task record.

- **ID:** 2026-09-23-after-1-3-0-what-the-owner-does-next-b741
- **State:** done-local
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-24T03:25:24.923Z

## Request

the owner's open items after the day's three releases

## Acceptance criteria

- [ ] The client restarted and skilliton pin --latest run for the project scope
- [ ] The submission note for the take-home written, with the site link on top
- [ ] The second field report sanitized and filed, and its usage batch dispatched, when the owner says go

## Decisions

not yet written

## Checkpoints

### 2026-09-23T22:07:50.200Z

- **State:** Release 1.3.0 is signed (tag skilliton-release/1.3.0 on 6fd624b, manifest sha256 62dec18badc9), pushed, approved in a fresh clone (5 approved) and VERIFIED 8 of 8 here (user scope on 1.3.0; project scope pinned at 1.1.0). The day's three releases carry every fix from four review passes: 1.1.0 at the end of the build week, 1.2.0 for the three cold reviews of 029f159, 1.3.0 for the regrade of 63b0119 and the second cold review. The history was rewritten once to remove 311 AI co-author trailers; GitHub lists one contributor. Open by design: source and . of a file ask (B84); sponge onto a new entry file is allowed. The second field report (usage and savings) is stored outside the repository, unacted, at the owner's word
- **Evidence:** checks.mjs 81 pass 0 fail 2 skipped of 83 on 3930380; CI green on 3930380, 312c212 and 6fd624b; audit 0 findings in 759 files; gate red team second pass 8 of 8; guard red team 45 of 46 caught, 0 regressions, slowest 153 ms; fresh clone release list 5 approved 0 unapproved; skilliton verify all 8 VERIFIED; contributors API lists MojoAI-King alone
- **Next:** Restart the client for the 1.3.0 hooks; skilliton pin --latest for the project scope; delete the local branches lane/gate-review-0923b, lane/guard-review-2-0923b, lane/guard-review-0923 and tmp/guard-merge by hand; write the submission note with the site link on top; when the owner says go, sanitize and file the second field report and dispatch the usage batch (the meter in the plugin, ff-only batches, per-project default, a committed ledger, the savings view, lane cost in reports)
- **Git:** main @ 88de457, 1 uncommitted

## Handoff

- **State:** Release 1.3.0 is signed (tag skilliton-release/1.3.0 on 6fd624b, manifest sha256 62dec18badc9), pushed, approved in a fresh clone (5 approved) and VERIFIED 8 of 8 here (user scope on 1.3.0; project scope pinned at 1.1.0). The day's three releases carry every fix from four review passes: 1.1.0 at the end of the build week, 1.2.0 for the three cold reviews of 029f159, 1.3.0 for the regrade of 63b0119 and the second cold review. The history was rewritten once to remove 311 AI co-author trailers; GitHub lists one contributor. Open by design: source and . of a file ask (B84); sponge onto a new entry file is allowed. The second field report (usage and savings) is stored outside the repository, unacted, at the owner's word. Evidence: checks.mjs 81 pass 0 fail 2 skipped of 83 on 3930380; CI green on 3930380, 312c212 and 6fd624b; audit 0 findings in 759 files; gate red team second pass 8 of 8; guard red team 45 of 46 caught, 0 regressions, slowest 153 ms; fresh clone release list 5 approved 0 unapproved; skilliton verify all 8 VERIFIED; contributors API lists MojoAI-King alone.
- **Next:** Restart the client for the 1.3.0 hooks; skilliton pin --latest for the project scope; delete the local branches lane/gate-review-0923b, lane/guard-review-2-0923b, lane/guard-review-0923 and tmp/guard-merge by hand; write the submission note with the site link on top; when the owner says go, sanitize and file the second field report and dispatch the usage batch (the meter in the plugin, ff-only batches, per-project default, a committed ledger, the savings view, lane cost in reports)
- **Blocked:** Only the owner can do these: read the Usage screen for the token window (turns the meter's reconstruction into a number that may be stated), report the end-of-day maintain minutes before and after, the extension keyboard checks and the other rows of docs/OWNER_TESTS.md, a clean macOS account, a Codex login, a Windows machine with a Claude login, an endpoint security product to test under, and a participant for the new builder rehearsal
- **Watch out:** Restart the client before the new hooks run (workflow 0.22.0, guardrails 0.8.0, context-hygiene 0.3.1 installed at 10:00 EDT). The lane folder ~/Desktop/Skilliton-lanes/instruction-size still has its branch checked out because the guard refused moving its stale receipt; remove that file by hand, detach, delete the branch. Windows stays not supported (B80, no Claude Code session there). Read the clock before typing a time
