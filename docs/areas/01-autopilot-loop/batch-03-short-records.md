# Short records

Kind: Living. Batch record. Area [01-autopilot-loop](AREA.md).

- **Type:** build
- **Goal:** A fresh session pays for a bounded resume block and a small status table, not for a screen of prose.
- **Depends on:** none
- **Advances:** M2; B35
- **Estimated sessions:** 1

## Acceptance

- [ ] the RESUME HERE block is limited to a stated number of lines and a test fails when it exceeds them (scripts/lifecycle.test.mjs or a new records test, with a self-test)
- [ ] the current-state paragraph of docs/STATUS.md is a small generated table from the State column of PLAN.md section 7, with a check that fails when stale
- [ ] docs/MAINTAIN.md has a status archive step and docs/STATUS_ARCHIVE.md (Kind: Reference) holds the superseded resume markers

## Notes

Overlaps area 05 batch 02; one implementation, ticked in both.
