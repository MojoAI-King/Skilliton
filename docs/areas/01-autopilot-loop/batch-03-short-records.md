# Short records

Kind: Living. Batch record. Area [01-autopilot-loop](AREA.md).

- **Type:** build
- **Goal:** A fresh session pays for a bounded resume block and a small status table, not for a screen of prose.
- **Depends on:** none
- **Advances:** M2; B35
- **Estimated sessions:** 1

## Acceptance

- [x] the RESUME HERE block is limited to a stated number of lines and a test fails when it exceeds them (scripts/lifecycle.test.mjs or a new records test, with a self-test) (evidence: scripts/living-docs.mjs --check, 24 lines and 4500 bytes and five Earlier entries, the owner's choice 2026-09-18; --self-test 8 of 8 cases fail as intended; CI step "Living records stay short and generated")
- [x] the current-state paragraph of docs/STATUS.md is a small generated table from the State column of PLAN.md section 7, with a check that fails when stale (evidence: docs/STATUS.md living-docs:milestones block written by node scripts/living-docs.mjs --apply; the self-test case "a stale milestone table is caught"; the paragraph bounded to 1000 bytes)
- [x] docs/MAINTAIN.md has a status archive step and docs/STATUS_ARCHIVE.md (Kind: Reference) holds the superseded resume markers (evidence: docs/MAINTAIN.md step 6; docs/STATUS_ARCHIVE.md with the 2026-09-18 paragraph; the self-test case "a missing status archive is caught")

## Notes

Overlaps area 05 batch 02; one implementation, ticked in both.
