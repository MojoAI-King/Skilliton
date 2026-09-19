# Backlog and archive relationship test

Kind: Living. Batch record. Area [05-repo-maintenance](AREA.md).

- **Type:** build
- **Goal:** The relationship between docs/BACKLOG.md and docs/BACKLOG_ARCHIVE.md is held by a test, not by eye.
- **Depends on:** none
- **Advances:** M2
- **Estimated sessions:** 1

## Acceptance

- [x] scripts/backlog.test.mjs fails on: an item in both files, a row for an archived item, an archived entry with no closure date, a detail section with no row (evidence: scripts/backlog.test.mjs, five checks plus the findings-marker pairing; passes on the repository 2026-09-19 with 27 open and 15 archived items)
- [x] its self-test proves each case can fail (evidence: node scripts/backlog.test.mjs --self-test, 7 cases including a findings block that still passes)
- [x] docs/MAINTAIN.md step 2 and CI carry the two steps (evidence: docs/MAINTAIN.md step 2 records bullet; .github/workflows/checks.yml "Backlog and its archive agree" and "Backlog check can fail")

## Notes

Do not shadow the security findings markers in BACKLOG.md.
