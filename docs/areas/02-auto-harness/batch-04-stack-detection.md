# Stack detection for the project config

Kind: Living. Batch record. Area [02-auto-harness](AREA.md).

- **Type:** build
- **Goal:** prepare drafts the dispatch and gate sections of the project config from the repository, previewed, never applied silently.
- **Depends on:** 02-01
- **Advances:** M8
- **Estimated sessions:** 1

## Acceptance

- [x] the test command, lane root and hotspots from git history are proposed into .skilliton/config.json with a preview (evidence: packs/base/plugins/workflow/runtime/lib/stack.mjs and lib/prepare.mjs draftDispatch; scripts/stack.test.mjs 6 of 6 and scripts/prepare.test.mjs pass; the prepare preview prints each drafted key with its source and --apply writes it, seen in evidence/rehearsals/2026-09-19-projects/ steps K1 to K3)
- [x] prepare-migrate-records tests cover a repository with no detectable stack (nothing drafted, said plainly) (evidence: scripts/prepare.test.mjs, the no-stack case on the empty fixture asserts the note that names the key to set by hand and 0 drafted; rehearsal step N1 asserts the same on a README-only repository)
- [x] docs/CONTRACTS.md documents the drafted fields (evidence: docs/CONTRACTS.md section 2 bullet Drafted dispatch fields, section 10 the draft row and the prepare line, section 14 Draft and confirm)

## Notes

None yet.
