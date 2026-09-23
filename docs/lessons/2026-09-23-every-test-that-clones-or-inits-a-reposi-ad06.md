# Every test that clones or inits a repository turns off git's background maintenance

Kind: Living. Lesson entry.

- **ID:** 2026-09-23-every-test-that-clones-or-inits-a-reposi-ad06
- **Status:** accepted
- **Date:** 2026-09-23

## What broke

CI failed twice in one day on ENOTEMPTY during a test's cleanup: first `scripts/join.test.mjs` (fixed the night before), then `scripts/release.test.mjs` on a README-only push (the pin test's clone cleanup). Both were flakes; neither push changed the code the test covers.

## The mechanism

A `git clone` or `git init` can start git's background maintenance (`gc --auto`, `maintenance run`), which keeps writing under `.git` for a moment after the command returns. `rmSync(dir, { recursive: true })` then races that writer and fails with ENOTEMPTY on Linux runners, where the timing differs from a laptop.

## The fix

`scripts/release.test.mjs`: the sandbox cleanup passes `maxRetries: 5, retryDelay: 200` to `rmSync`, and the test's git helper prepends `-c gc.auto=0 -c maintenance.auto=false` to every call, the same two lines `scripts/join.test.mjs` already carries.

## The rule

Every test that clones or initializes a repository turns off git's background maintenance on its git calls and retries its cleanup. Do it when the test is written, not after CI flakes.

## What now enforces it

Nothing yet beyond the two tests that carry it. A grep in `scripts/lint.test.mjs` for test files that spawn `git` without `gc.auto=0` would; not built.
