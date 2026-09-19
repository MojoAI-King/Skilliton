# Lint and format in CI

Kind: Living. Batch record. Area [06-clean-code](AREA.md).

- **Type:** research
- **Goal:** A lint step that fits a repository with no package.json by design.
- **Depends on:** none
- **Advances:** M2
- **Estimated sessions:** 1 to decide, 1 to ship

## Acceptance

- [ ] a decision entry weighs an eslint flat config installed in CI only against a dependency-free in-repo lint (unused imports, file size, dash and console rules), and picks one with the reason
- [ ] the step runs in CI and in docs/MAINTAIN.md step 2, with a self-test
- [ ] the tree passes it, with the fixes as their own commit

## Notes

A devDependency changes the footprint story in docs/IT-ALLOWLIST.md; the decision says so either way.
