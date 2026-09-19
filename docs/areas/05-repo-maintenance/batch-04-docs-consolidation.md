# Docs consolidation

Kind: Living. Batch record. Area [05-repo-maintenance](AREA.md).

- **Type:** build
- **Goal:** One index reaches every document; superseded ones move to an archive folder.
- **Depends on:** none
- **Advances:** M2
- **Estimated sessions:** 1

## Acceptance

- [ ] docs/AUTOPILOT_START_HERE.md is the one index and every document under docs/ is reachable from it or from a file it links
- [ ] superseded documents live under docs/archive/ with a Kind: Reference label
- [ ] scripts/docs.test.mjs fails when a document is unreachable from the index, with a self-test case

## Notes

None yet.
