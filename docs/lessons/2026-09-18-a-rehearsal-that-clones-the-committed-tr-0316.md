# A rehearsal that clones the committed tree but runs the working tree's runtime disagrees whenever the two differ

Kind: Living. Lesson entry.

- **ID:** 2026-09-18-a-rehearsal-that-clones-the-committed-tr-0316
- **Status:** accepted
- **Date:** 2026-09-18

## What broke

The projects rehearsal's step A2 (adopt a clone of this repository) failed with `prepare --check` exiting 1 on the same day the harness template gained its Session cost section. The clone's instruction block was current when the template was committed and stale the moment the working tree's template changed; nothing about adoption was wrong.

## The mechanism

`scripts/rehearsals/projects.mjs` clones the committed repository (`git clone` reads HEAD, not the working tree) and runs the runtime from the working tree. The clone's `CLAUDE.md` carries the block rendered from the committed template, while the runtime renders and compares against the edited template, so the check reports a pending instructions migration (`0100-instructions-<hash>`), which is exactly what it should say. The step asserted exit 0 from the check, which holds only while the committed and working-tree templates agree, that is, only on a clean tree.

## The fix

A2 now runs `skilliton migrate --dir <clone> --apply` after adoption and before the check, and asserts both exit 0 (`scripts/rehearsals/projects.mjs`, step A2). Bringing an adopted project's block current is part of adopting it, so the step rehearses more than it did, and it no longer depends on the tree being clean.

## The rule

A rehearsal that mixes two sources of truth (a committed tree and a working-tree tool) must either state that it is only meaningful on a clean tree, or run the step that reconciles the two. When it fails, first ask which of the two moved, and whether the tool's answer is right for that pair; the tool being right and the fixture being stale is the common case.

## What now enforces it

The migrate step inside A2 itself; the rehearsal is in docs/MAINTAIN.md step 2 and CI. Nothing checks the general shape (a rehearsal cloning HEAD while running the working tree); the comment above the step in `scripts/rehearsals/projects.mjs` names it.
