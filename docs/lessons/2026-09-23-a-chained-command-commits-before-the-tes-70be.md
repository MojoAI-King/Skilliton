# A chained command commits before the test verdict is read

Kind: Living. Lesson entry.

- **ID:** 2026-09-23-a-chained-command-commits-before-the-tes-70be
- **Status:** accepted
- **Date:** 2026-09-23

## What broke

On 2026-09-23 the integrating session replaced a pre-rewrite commit hash in the runtime's migration message, ran the tests, and committed and pushed in the same shell line. Three tests in scripts/migrate.test.mjs asserted the old text and failed; the push (b90d1e6) carried them red to CI. The fix (fbb4950) followed within minutes, but the rule is never to commit on a failing test.

## The mechanism

The shell line ran `node --test ...; echo exit; ...; git commit && git push`. The test's exit status was printed, not acted on: `;` carries on regardless, and the commit was conditioned only on `git add`. A verdict that is printed and not read is the same as no verdict.

## The fix

scripts/migrate.test.mjs and scripts/prepare.test.mjs now expect the rewritten hash (fbb4950). The session's own rule from here: the test runs in one call, its exit is read, and the commit is a separate call, or the commit is chained on the test's exit with `&&` so a red test cannot reach it.

## The rule

Never chain `git commit` after a test with `;`. Either `test && git commit` or two calls with the verdict read between them. This is the repository's own rule (CLAUDE.md, before committing) and it applies to the assistant's shell lines as much as to a person.

## What now enforces it

Nothing yet. A pre-commit hook that runs the fast checks would; the delivery gate catches it at the shared branch (the CI run on b90d1e6 went red and the fix landed before the release commit).
