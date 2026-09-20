# Dead code and duplicate scan

Kind: Living. Batch record. Area [06-clean-code](AREA.md).

- **Type:** build
- **Goal:** Exported symbols with no importer and near-duplicate blocks are found by a script, and fixed or recorded.
- **Depends on:** none
- **Advances:** M2
- **Estimated sessions:** 1

## Acceptance

- [ ] scripts/deadcode.mjs lists exported symbols with no importer and near-duplicate blocks across the runtime
- [ ] its findings are fixed, or recorded in the backlog with a reason each

## Notes

One real finding is already on the record, found by hand on 2026-09-20 while splitting `lib/core.mjs` (batch 02) and removed the same day: `KNOWN_CONFIG_SECTIONS` in the new `lib/doctor.mjs` was a re-export alias for `KNOWN_SECTIONS` that nothing imported, because `commands/doctor.mjs` takes that name from `lib/config.mjs` directly. It names the class this batch's scanner has to catch and the lint cannot: an export that survives a move because the move kept the old surface. `scripts/lint.test.mjs` finds an unused *import* within one file; nothing yet finds an export with no importer across files.
