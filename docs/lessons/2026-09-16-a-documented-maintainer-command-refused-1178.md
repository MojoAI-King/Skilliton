# A documented maintainer command refused on a fresh fork because its test built the fixture by hand

Kind: Living. Lesson entry.

- **ID:** 2026-09-16-a-documented-maintainer-command-refused-1178
- **Status:** accepted
- **Date:** 2026-09-16

## What broke

README.md ("For a company maintainer") and docs/RELEASING.md section 1 told a company to add its skills with `node scripts/skillgate.mjs new-skill <plugin> <skill> --pack <company>`. On a fresh fork that command refuses: `no plugin "<plugin>" under packs/<company>/plugins/`. No command created a company plugin, so the first customization step a maintainer reads could not be followed as written. It was found by reading the code while planning the "how it works" document, not by any check.

## The mechanism

`findPlugin` in `packs/base/plugins/workflow/runtime/lib/core.mjs` requires `packs/<pack>/plugins/<plugin>/` with a `plugin.json` to exist. The new-skill test in `scripts/skillgate.test.mjs` creates `packs/acme/plugins/workflow/.claude-plugin/plugin.json` with `mkdirSync` and `writeFileSync` before it exercises `--pack acme`, so the test passed on a state a person could only reach by hand. The company release rehearsal edited `packs/base` directly and kept the upstream marketplace name, so it never walked the documented path either. Every check was green and no check ran the sequence the guide gives.

## The fix

`skillgate new-plugin` (`runtime/commands/new-plugin.mjs`, engine `runtime/lib/fork.mjs`) creates the plugin, lists it in the catalog and enables it in the team template; `new-skill`'s refusal now names it. `skillgate company init` renames the fork and points the template at it. `scripts/rehearsals/fork.mjs` runs the guide's sequence from a clean clone: `company init`, `new-plugin`, `new-skill`, strict validation, release, and installs verified on both clients (7 of 7). README.md, docs/RELEASING.md and docs/HOW-IT-WORKS.md show that sequence.

## The rule

A command sequence in a guide is proven by running that sequence from the state a reader starts in. A unit test whose setup builds the precondition by hand proves the command, not the guide.

## What now enforces it

`scripts/rehearsals/fork.mjs` runs the maintainer path from a fresh clone (by hand, with client binaries; it is not in CI because it installs through Claude Code and Codex). `scripts/docs.test.mjs`, in CI, fails when a guide names a command or verb the CLI does not have or a link that does not resolve; it cannot tell whether a named command succeeds from the reader's starting state, so the rehearsal remains the check for that.
