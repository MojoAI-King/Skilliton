# Split core.mjs and size ceilings

Kind: Living. Batch record. Area [06-clean-code](AREA.md).

- **Type:** build
- **Goal:** Commands live in their own files and no runtime file exceeds a stated size.
- **Depends on:** 06-01
- **Advances:** M2
- **Estimated sessions:** 2

## Acceptance

- [x] the commands in lib/core.mjs move into commands/ files following commands/gate.mjs, with no behavior change (evidence: commit 274138d moved doctor, harness, project-settings, new-skill and import into commands/ behind the new lib/harness.mjs and lib/doctor.mjs engines, with each command's --help output compared before and after the move)
- [x] a test fails when any runtime file exceeds the stated line count, with a self-test (evidence: the size rule in scripts/lint.test.mjs, a 600 line ceiling over packs/**/runtime/**/*.mjs with a pinned ratchet table for the files already above it; node scripts/lint.test.mjs --self-test PASS on 2026-09-20)
- [x] the full offline suite passes after the move (evidence: 46 of 46 gates green on 2026-09-20 on the final wave 5 tree, each run as its own step with its exit status read on its own line and nothing piped; the same suite also ran 46 of 46 on the split tree at commit 274138d)

## Notes

core.mjs left the ratchet table, which is the visible result of this batch: the pinned list is now eight files, each at its exact count, and a pin that grows or that drops under the ceiling without its row being deleted fails the lint.
