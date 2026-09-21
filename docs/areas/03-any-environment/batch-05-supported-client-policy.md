# Supported client policy

Kind: Living. Batch record. Area [03-any-environment](AREA.md).

- **Type:** build
- **Goal:** A client is supported only with a measured column, and a test holds the rule.
- **Depends on:** none
- **Advances:** M13
- **Estimated sessions:** 1

## Acceptance

- [x] docs/CLIENTS.md states the rule in one sentence (evidence: docs/CLIENTS.md opening paragraph, in bold: a client is supported only when this matrix carries a column for it with at least one measured row)
- [x] scripts/docs.test.mjs fails when README names a client that the matrix does not carry, with a self-test case (evidence: the supported-client check in scripts/docs.test.mjs reading the matrix header for its columns and README.md for the names in CLIENT_NAMES; node scripts/docs.test.mjs exit 0 reporting 4 columns with 3 having a measured row; node scripts/docs.test.mjs --self-test exit 0, whose case adds a Windsurf claim to README.md and sees it caught)

## Notes

The check reports which columns have a measured row and does not decide it, because "measured" is a judgement about evidence.

Corrected on 2026-09-20 while adding the Cursor column: a cell reading "not measured" was being counted as a measured row, so a column of pure documentation would have been reported as a column with evidence. The negations now come out before the word is looked for.
