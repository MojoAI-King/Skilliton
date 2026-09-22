# This repository has no formatter, and the lint is what holds its shape

Kind: Living. Decision entry.

- **ID:** 2026-09-22-this-repository-has-no-formatter-and-the-4991
- **Status:** accepted
- **Date:** 2026-09-22

## Decision

Skilliton ships no code formatter and runs none in CI. The dependency-free lint (`scripts/lint.test.mjs`: size, unused imports, console use, command shape, package files) and the scrub check (dashes, home paths, names) are the shape checks. Closes B39.

## Why

A formatter worth running is either a devDependency, which breaks the zero-dependency footprint the IT allow list and `scripts/footprint.test.mjs` promise, or a formatter written here, which is far larger than the lint and would need its own tests. The code is written by the assistant under the lint and reviewed in diffs, and no bug on record came from formatting.

## Alternatives rejected

Prettier as a devDependency (breaks the footprint claim and adds an install step to CI). An in-repository formatter (large, and every change to it would reformat the tree). An .editorconfig only (it states indentation but checks nothing, so it would read as a gate that is not one).

## Risk

Style drifts between files. The lint's rules catch what matters for review; whitespace and wrapping differences do not change behavior.

## Reversibility

Easy: adding a formatter later is one commit that reformats the tree, plus a CI step.

## Evidence

decision 2026-09-20-a-dependency-free-in-repo-lint-and-a-siz-da3d; `scripts/footprint.test.mjs`; docs/IT-ALLOWLIST.md.
