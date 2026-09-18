# A gate that walks the list it is checking passes when the list gets shorter

Kind: Living. Lesson entry.

- **ID:** 2026-09-18-a-gate-that-walks-the-list-it-is-checkin-7323
- **Status:** accepted
- **Date:** 2026-09-18

## What broke

Five environment variables were removed from the runtime's git calls and the gate that was supposed to hold them
there did not notice when they were taken out again: it iterated over the runtime's own exported list, so a shorter
list simply meant fewer assertions. The same shape appeared twice more in one week: a gate that read two named
folders rather than the runtime, so a git call in the runtime's entry point passed everything; and a gate that
matched a window of text, so a hook could satisfy it with a name written in a comment.

## The mechanism

A check that derives what to check from the thing being checked cannot fail in the direction that matters. It
catches a change that adds something wrong and never a change that removes something right. The three variants are
the same error: reading the subject's own list, reading a hand-written list of places to look, and reading text near
the code rather than the code.

## The fix

`scripts/preflight.test.mjs` names every variable in the test file itself. `scripts/git-config.test.mjs` walks every
`.mjs` file under `runtime/` rather than two named folders, asserts a floor on the number of git calls it found (70,
against 75 at the time), reads calls with the same parser the other checkers use, and strips comments before
matching the guardrails hook's `unset` command.

## The rule

A gate writes down what it expects. If the expectation comes from the code under test, the gate is a mirror. Where
a list must be repeated in two places, repeat it and let the duplication be the test; where a gate walks files, walk
the directory and assert a floor on what it found, so a reader change that quietly stops finding things fails.

## What now enforces it

The floor assertion in `scripts/git-config.test.mjs` (both gates), the written-out lists in
`scripts/preflight.test.mjs`, and the practice of reverting each fix in a copy of the tree to watch a test go red,
which is how all three of these were found.
