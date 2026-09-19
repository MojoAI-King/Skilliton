# Backlog and archive relationship test

Kind: Living. Batch record. Area [05-repo-maintenance](AREA.md).

- **Type:** build
- **Goal:** The relationship between docs/BACKLOG.md and docs/BACKLOG_ARCHIVE.md is held by a test, not by eye.
- **Depends on:** none
- **Advances:** M2
- **Estimated sessions:** 1

## Acceptance

- [ ] scripts/backlog.test.mjs fails on: an item in both files, a row for an archived item, an archived entry with no closure date, a detail section with no row
- [ ] its self-test proves each case can fail
- [ ] docs/MAINTAIN.md step 2 and CI carry the two steps

## Notes

Do not shadow the security findings markers in BACKLOG.md.
