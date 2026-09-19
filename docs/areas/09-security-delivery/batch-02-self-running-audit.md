# Self-running audit (M10, B20)

Kind: Living. Batch record. Area [09-security-delivery](AREA.md).

- **Type:** build
- **Goal:** A deterministic offline audit of changed files runs in a routine, a pre-push hook and the merge gate, and its findings become scoped observations.
- **Depends on:** 01-04 (the routine event)
- **Advances:** M10; B20
- **Estimated sessions:** 3

## Acceptance

- [ ] the audit runs on changed files with a deterministic result, tested
- [ ] it runs in a routine, in a pre-push hook and in the merge gate, each with a fixture test
- [ ] findings land as scoped observations in the security register, tested

## Notes

None yet.
