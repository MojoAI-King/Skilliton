# Docs consolidation

Kind: Living. Batch record. Area [05-repo-maintenance](AREA.md).

- **Type:** build
- **Goal:** One index reaches every document; superseded ones move to an archive folder.
- **Depends on:** none
- **Advances:** M2
- **Estimated sessions:** 1

## Acceptance

- [x] docs/AUTOPILOT_START_HERE.md is the one index and every document under docs/ is reachable from it or from a file it links (evidence: 160 of 160 on 2026-09-20, up from 126 of 160 before the index gained a project-records row naming the status, backlog and handoff archives and the four record folders, a session-cost row naming the frozen baseline, and a security-catalog row naming the framework sources; the numbered list's two entries numbered 3 were renumbered on the way)
- [x] superseded documents live under docs/archive/ with a Kind: Reference label (evidence: docs/history/ moved to docs/archive/ with git mv, keeping the three prototype-era documents that already carried Kind: Reference, and all seven references were updated so no record points at a path that no longer exists; the three rolling archives stay beside their living file for the reason in decision 2026-09-20-the-rolling-archives-stay-beside-their-l-8264)
- [x] scripts/docs.test.mjs fails when a document is unreachable from the index, with a self-test case (evidence: two rules and two cases, an unreachable document and a living document filed under docs/archive/; each was proved able to fail by a mutant with that rule disabled, and each mutant killed only its own case, so neither case is passing on the other's work)

## Notes

None yet.
