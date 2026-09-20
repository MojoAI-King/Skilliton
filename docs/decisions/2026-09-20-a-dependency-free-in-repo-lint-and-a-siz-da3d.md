# A dependency-free in-repo lint, and a size ceiling that ratchets

Kind: Living. Decision entry.

- **ID:** 2026-09-20-a-dependency-free-in-repo-lint-and-a-siz-da3d
- **Status:** accepted
- **Date:** 2026-09-20

## Decision

The repository's lint step is `scripts/lint.test.mjs`, written in the shape of `scripts/names.test.mjs`: plain Node, no eslint, no `package.json`, no lockfile, no `node_modules`. It runs identically on a laptop and in CI, as its own step in `.github/workflows/checks.yml` and as a bullet in docs/MAINTAIN.md step 2, with a `--self-test` beside it that proves each rule fails on known-bad input.

It carries five rules, each with a named allowlist of `[pattern, reason]` pairs in the file itself:

- `size`: a file under `packs/*/plugins/*/runtime/` may not exceed `RUNTIME_MAX_LINES`, which is 600. The files already above it on the day the rule shipped are pinned in a table at their exact line count and may not grow by one line. This is the ratchet: an over-size file is frozen, not blessed, and its row is deleted when the file drops under the ceiling.
- `unused-import`: a name in an `import { ... }` list that appears nowhere else in the file.
- `console`: `console.log` under a plugin runtime, where stdout goes through `say()`. `console.error` is untouched, because a refusal writes there on purpose.
- `command-shape`: a file in `runtime/commands/` that does not export both `help` and `run`, and a command in the router's `GROUPS` table with neither a module file nor a `run:` property.
- `no-dependencies`: a tracked `package.json` anywhere outside `scripts/fixtures/`, which is what would make docs/IT-ALLOWLIST.md's dependency sentence false.

Two things deliberately not in it. There is no dash rule, because `scripts/scrub-check.sh` already refuses em and en dashes across the whole tree and in history, and a second implementation is a second thing to drift. There is no formatter: batch 06-01 is titled "lint and format" and only the lint half ships, because a dependency-free formatter is a much larger piece of work than a dependency-free linter and writing one would undo the reason for this decision.

## Why

Three reasons, in the order they decided it.

The first is a claim to a client. docs/IT-ALLOWLIST.md line 81 tells an IT department that Claude Code installs "plugins' package dependencies" from `registry.npmjs.org` and that "Skilliton's plugins declare none". That sentence is the whole reason a locked-down laptop can accept this product without a supply-chain review. Adding eslint, even as a CI-only devDependency, means the repository declares dependencies, and the honest response would be to reword the page. Measured while deciding: the only tracked `package.json` in the repository is `scripts/fixtures/demo-app/package.json`, a fixture, and there is no `node_modules`.

The second is that a CI-only lint is a gate that does not gate. docs/MAINTAIN.md step 2 is run on a laptop before a commit; a step that needs `npm ci` first either does not run there or runs against a different resolved version than CI did, and the two verdicts can disagree. This repository already has a lesson about checks that appear to run and do not.

The third is that the generic value of eslint here is close to zero, and saying so is more useful than implying a cleanup. Measured across every tracked `.mjs` file on 2026-09-20: four unused named imports in the entire repository (`spawnSync` in the workflow runtime's `lib/preflight.mjs`, `execFileSync` in `scripts/packs.test.mjs`, and `statSync` and `appendFileSync` in `scripts/rehearsals/projects.mjs`), and no stray `console.log` at all, the three matches being the definition of `say()` itself and two injected print defaults in `lib/delivery.mjs`. So this step is a ratchet against tomorrow, not a haul today.

A first count said five. The fifth was `request` in `scripts/allowlist.test.mjs`, which is not an import at all but a line inside a fixture string that the first, unanchored version of the rule read as code. The rule now reads only an import that starts a line, and the count is recorded here as four because that is what it is.

What made it worth writing anyway is the two rules eslint would not have given. `command-shape` catches a class of mistake that today becomes a runtime error the first time somebody types the command, because the router resolves a command name to a file by name and nothing checks that the file exports what the contract says. And `no-dependencies` is the first thing in the repository that enforces the sentence on the allowlist page: `scripts/footprint.test.mjs` keeps four other promises made on that page, and the dependency sentence was true by inspection and by nothing else.

The ceiling is 600 with a ratchet rather than a flat limit because a flat limit that eight files already break is not a limit, it is a backlog with a failing build. Pinning each over-size file at its current count says two true things at once: this file is too long, and it may not get longer.

## Alternatives rejected

- **eslint with a flat config, installed in CI only.** Rejected because it makes a client-facing sentence false, or forces it to be reworded, in exchange for finding five unused imports. It also cannot run in the pre-commit checklist on a laptop without a dependency install, so the local and CI verdicts could differ.
- **Both: eslint for the general rules and an in-repo script for the repository-specific ones.** Rejected because two checks over the same tree can disagree about the same line, and because it pays the dependency cost anyway.
- **A flat 600-line limit with no ratchet.** Rejected because it would fail on the day it shipped for eight files, and the only way to green would be to raise the number until it caught nothing.
- **An allowlist of over-size files with no pinned count.** Rejected because an exempt file may then grow without limit, which is the failure the ceiling exists to prevent.
- **Reimplementing the dash rule inside the lint for one-stop shopping.** Rejected: `scripts/scrub-check.sh` owns dashes, including over history, and two implementations of one rule drift.

## Risk

The rules are textual, not a parser, so each can be fooled. `unused-import` matches a bare word, so a name that appears only inside a string or a comment reads as used, and a name shadowed in a nested scope reads as used too: it under-reports rather than over-reports, which is the safe direction for a rule nobody may disable per line. `console` and `command-shape` read source text with regular expressions and would miss an export built dynamically, which the footprint rules already forbid anyway. The pinned table is a hand-maintained fact: if a file is split and the row is not deleted, the row silently protects nothing, so the rule fails when a pinned file is missing rather than skipping it.

The ceiling can also be satisfied dishonestly, by moving lines into a second file that is no easier to read. Nothing here catches that, and nothing pretends to; the ceiling is a prompt to split, not a proof that a split was good.

## Reversibility

Deleting `scripts/lint.test.mjs`, its two CI steps and its docs/MAINTAIN.md bullet removes the step completely, and nothing else imports it. Raising or lowering `RUNTIME_MAX_LINES` is one constant. Adopting eslint later is additive and does not conflict with this file, but it would require rewording docs/IT-ALLOWLIST.md line 81 first, and that rewording is the decision, not the install. What would change this: a contributor base large enough that the repository-specific rules stop being the valuable ones, or a formatting argument that a formatter would settle.

## Evidence

- `scripts/lint.test.mjs` and its `--self-test`; the step pair in `.github/workflows/checks.yml`; the bullet in docs/MAINTAIN.md step 2.
- The three measurements this entry rests on, all taken 2026-09-20 on `abc4492`: four unused named imports across every tracked `.mjs`; three `console.log` in the plugin runtimes, all of them definitions or injected defaults; one tracked `package.json`, a fixture, and no `node_modules`.
- The ceiling's pinned table and the split it is paired with: batch 06-02, `docs/areas/06-clean-code/batch-02-split-core-and-ceilings.md`.
- docs/IT-ALLOWLIST.md line 81, the sentence `no-dependencies` now enforces, and `scripts/footprint.test.mjs`, which keeps the page's four other promises and not this one.
