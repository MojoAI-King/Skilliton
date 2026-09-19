# Status and handoff generated where possible

Kind: Living. Batch record. Area [05-repo-maintenance](AREA.md).

- **Type:** build
- **Goal:** The status table comes from PLAN.md section 7 and the handoff block is bounded.
- **Depends on:** none (same work as 01-03)
- **Advances:** M2; B35
- **Estimated sessions:** 1

## Acceptance

- [x] the STATUS current-state table is generated from PLAN.md section 7 with a staleness check (evidence: scripts/living-docs.mjs --apply and --check; CI steps "Living records stay short and generated" and "Living records check can fail", 2026-09-19)
- [x] the RESUME HERE size test exists (shared with 01-03) (evidence: scripts/living-docs.mjs, 24 lines and 4500 bytes; docs/CONTRACTS.md section 3)
- [x] the status archive step and file exist (evidence: docs/MAINTAIN.md step 6 and docs/STATUS_ARCHIVE.md)

## Notes

One implementation with area 01 batch 03; tick both when it lands.
