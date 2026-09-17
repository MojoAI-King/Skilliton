# A rule that classifies a line must not consume it

Kind: Living. Lesson entry.

- **ID:** 2026-09-17-a-rule-that-classifies-a-line-must-not-c-b692
- **Status:** accepted
- **Date:** 2026-09-17

## What broke

`scripts/footprint.test.mjs` checks that nothing in the plugins needs administrator rights or leaves something running.
A reviewer added `setuid: true, unrefIt: process.setuid(0)` to a line that also said `detached:` and the whole check
stayed green; the identical text on its own line failed two rules.

## The mechanism

The rule that counted a child started in its own process group was written as
`if (/detached\s*:/.test(line)) { seen.set(...); continue; }`. The `continue` moved to the next line, so every other
pattern, including the ones about setuid and about changing the user a process runs as, never saw that line. One
classification silently became an exemption from all the others, and the exempt line was the one most worth reading.

## The fix

The count is taken and the line goes on to every other rule
(`packs/base/plugins/workflow/runtime/lib/preflight.mjs` is the file it was hiding a change in;
`scripts/footprint.test.mjs` holds the rule). Proved by mutation on a copy of the working tree: the same text passed
before the change and fails after it.

## The rule

In any checker, classifying a line and exempting it are different acts. A branch that recognises something may record
it, but must fall through to the remaining checks unless the exemption is the point and is written as one, with its
reason. Whenever a checker has a `continue`, ask what stops being checked after it.

## What now enforces it

`scripts/footprint.test.mjs` self-test cases "a child process started in its own group that nobody listed fails" and
"a listed process group that is gone fails", plus the mutation above, which is the check this lesson came from.
