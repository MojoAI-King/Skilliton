# Lint and format in CI

Kind: Living. Batch record. Area [06-clean-code](AREA.md).

- **Type:** research
- **Goal:** A lint step that fits a repository with no package.json by design.
- **Depends on:** none
- **Advances:** M2
- **Estimated sessions:** 1 to decide, 1 to ship

## Acceptance

- [x] a decision entry weighs an eslint flat config installed in CI only against a dependency-free in-repo lint (unused imports, file size, dash and console rules), and picks one with the reason (evidence: docs/decisions/2026-09-20-a-dependency-free-in-repo-lint-and-a-siz-da3d.md, which also records why no dash rule was written)
- [x] the step runs in CI and in docs/MAINTAIN.md step 2, with a self-test (evidence: .github/workflows/checks.yml steps Size ceiling, unused imports, command shape and no dependencies and Lint can fail; docs/MAINTAIN.md step 2 lint bullet; node scripts/lint.test.mjs --self-test PASS on 2026-09-20)
- [x] the tree passes it, with the fixes as their own commit (evidence: commit 903eabc, the four unused imports the lint found and nothing else; node scripts/lint.test.mjs clean on 2026-09-20)

## Notes

A devDependency changes the footprint story in docs/IT-ALLOWLIST.md; the decision says so either way.

A devDependency changes the footprint story in docs/IT-ALLOWLIST.md; the decision says so either way.

The batch is titled lint **and format**, and no formatter shipped. A dependency-free formatter is a much larger thing than a dependency-free lint, none of the three acceptance items names one, and inventing one would be the opposite of the decision just taken. If a formatter is wanted later it is its own batch, not a silent part of this one.
