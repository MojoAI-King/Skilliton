# Dead code and duplicate scan

Kind: Living. Batch record. Area [06-clean-code](AREA.md).

- **Type:** build
- **Goal:** Exported symbols with no importer and near-duplicate blocks are found by a script, and fixed or recorded.
- **Depends on:** none
- **Advances:** M2
- **Estimated sessions:** 1

## Acceptance

- [x] scripts/deadcode.mjs lists exported symbols with no importer and near-duplicate blocks across the runtime (evidence: it reads 397 exports across 57 runtime modules and every block of 7 meaningful lines, following the router's computed command import, lifecycle's loadOptional and prepare's securityEngine; exit 0 on 2026-09-20 and 30 of 30 self-test cases, each new case proved able to fail against two deliberately broken readers; its coverage line names the 7 dynamic imports it could not resolve and the 8 modules it holds whole, so what it cannot follow is counted rather than passed over)
- [x] its findings are fixed, or recorded in the backlog with a reason each (evidence: 117 exports nothing imported were made module-local across 18 runtime files, and the full offline suite 47 of 47 proved no behavior change, one narrowing at a time after the rename test caught the single wrong one; the duplicate fencedLines in lib/handoff.mjs was deleted in favour of the carriage-return-tolerant copy in lib/tasks.mjs; the one remaining duplicate is B40 with its reason and an ALLOWED_DUPLICATE row naming it, and B41 records the two migration id patterns that disagree on a doubled or trailing hyphen, found on the way)

## Notes

One real finding is already on the record, found by hand on 2026-09-20 while splitting `lib/core.mjs` (batch 02) and removed the same day: `KNOWN_CONFIG_SECTIONS` in the new `lib/doctor.mjs` was a re-export alias for `KNOWN_SECTIONS` that nothing imported, because `commands/doctor.mjs` takes that name from `lib/config.mjs` directly. It names the class this batch's scanner has to catch and the lint cannot: an export that survives a move because the move kept the old surface. `scripts/lint.test.mjs` finds an unused *import* within one file; nothing yet finds an export with no importer across files.
