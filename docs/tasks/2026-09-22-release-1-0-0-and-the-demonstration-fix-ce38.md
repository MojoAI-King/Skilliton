# Task: Release 1.0.0 and the demonstration fix

Kind: Living. Task record.

- **ID:** 2026-09-22-release-1-0-0-and-the-demonstration-fix-ce38
- **State:** verified
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-22T22:12:47.258Z

## Request

you can sign and push

## Acceptance criteria

- [ ] 1.0.0 signed, pushed, approved in a fresh clone and VERIFIED on this machine
- [ ] CI green on the last commit of main
- [ ] handoff written

## Decisions

not yet written

## Checkpoints

### 2026-09-22T22:12:47.128Z

- **State:** The evening goal is done except the owner's steps. 1.0.0 is released at the owner's go: releases/1.0.0.json with seven evidence files, the changelog moved, commit 095d59c, the SSH-signed tag skilliton-release/1.0.0, main and the tag pushed; a fresh clone lists 1.0.0 approved, and skilliton verify reads VERIFIED for all four plugins at both scopes (evidence/live/2026-09-22-release-1.0.0.md). CI on the release commit failed one step, the demonstration, because scripts/demo-day.mjs cut a fixed 1.0.0 inside its copy of this repository, which now already holds that manifest; it now takes the next minor version above the newest (1.1.0), fixed in cf6e866. docs/RELEASING.md now reruns the checks after the manifest is committed; B64 puts the same step in the release skill for 1.0.1. The owner guide page is at version 3 and the scorecard at version 4. docs/OWNER_TESTS.md is tonight's list, and its test 8 records the release as done.
- **Evidence:** scripts/checks.mjs 56 pass, 0 fail, 2 skipped of 58 on cf6e866's tree; gh run 35790680362 for cf6e866: 64 steps, 0 not success; fresh-clone release list shows 1.0.0 approved; skilliton verify VERIFIED 8 of 8; scrub exit 0 before each commit
- **Next:** The owner works through docs/OWNER_TESTS.md tonight and pastes the notes into the next session, which files them as evidence and ticks the boxes. A fix found tonight ships as 1.0.1 through /workflow:release, with B64 in it. Then B63 from the published pricing page. Meeting Wednesday 2026-09-23 11:00.
- **Git:** main @ cf6e866, 1 uncommitted

## Handoff

- **State:** The evening goal is done except the owner's steps. 1.0.0 is released at the owner's go: releases/1.0.0.json with seven evidence files, the changelog moved, commit 095d59c, the SSH-signed tag skilliton-release/1.0.0, main and the tag pushed; a fresh clone lists 1.0.0 approved, and skilliton verify reads VERIFIED for all four plugins at both scopes (evidence/live/2026-09-22-release-1.0.0.md). CI on the release commit failed one step, the demonstration, because scripts/demo-day.mjs cut a fixed 1.0.0 inside its copy of this repository, which now already holds that manifest; it now takes the next minor version above the newest (1.1.0), fixed in cf6e866. docs/RELEASING.md now reruns the checks after the manifest is committed; B64 puts the same step in the release skill for 1.0.1. The owner guide page is at version 3 and the scorecard at version 4. docs/OWNER_TESTS.md is tonight's list, and its test 8 records the release as done. Evidence: scripts/checks.mjs 56 pass, 0 fail, 2 skipped of 58 on cf6e866's tree; gh run 35790680362 for cf6e866: 64 steps, 0 not success; fresh-clone release list shows 1.0.0 approved; skilliton verify VERIFIED 8 of 8; scrub exit 0 before each commit.
- **Next:** The owner works through docs/OWNER_TESTS.md tonight and pastes the notes into the next session, which files them as evidence and ticks the boxes. A fix found tonight ships as 1.0.1 through /workflow:release, with B64 in it. Then B63 from the published pricing page. Meeting Wednesday 2026-09-23 11:00.
- **Blocked:** The owner's items in docs/OWNER_TESTS.md: the extension keyboard checks, the 15 applicability decisions, the Usage screen comparison, the maintain minutes, B53, the go for 1.0.0; and every step that needs another person, machine or account
- **Watch out:** Plugins went to workflow 0.21.0 and guardrails 0.7.0 at 17:06 EDT: restart the client before testing. This repository keeps no Earlier entries in the handoff (handoff.keepEarlier 0); older notes are in docs/HANDOFF_ARCHIVE.md. The size ceiling now covers scripts/, so a test file cannot grow past its pin; put new tests in a new file. The meter marks 2026-09-21 and later INCOMPLETE until B63 is done; request counts and peak context are still exact. Read the clock before typing a time.
