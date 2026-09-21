# A gate reads the shape of a call, not what it means

Kind: Living. Lesson entry.

- **ID:** 2026-09-21-a-gate-reads-the-shape-of-a-call-not-wha-dcd7
- **Status:** accepted
- **Date:** 2026-09-21

## What broke

Wave 7's own suite went red twice on code that behaved correctly. `node --test scripts/git-config.test.mjs` reported
ten findings in `runtime/lib/audit-run.mjs`, a file written minutes earlier, and `node scripts/footprint.test.mjs`
refused two `spawnSync` calls in `runtime/lib/collectors.mjs`. Nothing misbehaved at runtime. Both files did exactly
what they were written to do, and every test of their behavior passed.

## The mechanism

Both gates read source text, so what they check is the shape a call is written in.

`scripts/git-config.test.mjs` finds every call to a function named `runGit`, reads its **third argument**, and
requires it to be an object literal or absent: that is where the environment-scrubbing options live, and an argument
the gate cannot parse is an argument it cannot check. The audit's wrapper had been written
`git(root, args, "the repository could not be read")`, putting a failure sentence in that position, so all ten of its
call sites read as unreadable at once.

`scripts/footprint.test.mjs` reads the options object of a `spawnSync` call to prove nothing is left running: it looks
for a `timeout` and for a `stdio` that is not inherited, in the literal. The first version of the reshaped
`collectors.runGit` built one call whose options carried a spread and a variable. That is the same options object
wearing a shape the gate cannot read, and the gate says so in those words: a spread at the top of an options object is
the same thing wearing a literal's clothes.

Neither gate's exemption list was the answer. `OWN_WRAPPER_FILES` in git-config exempts only the two files that define
a wrapper, and carries a comment saying why a third may not join them: a four line wrapper around another module's
`runGit`, in a new file, would otherwise exempt itself.

## The fix

`runGit` in [collectors.mjs](../../packs/base/plugins/workflow/runtime/lib/collectors.mjs) now takes
`(root, args, { maxBuffer, input })`, the same third argument shape as the runtime's other two git wrappers in
`lib/journal.mjs` and `lib/trust.mjs`. The audit's own wrapper in
[audit-run.mjs](../../packs/base/plugins/workflow/runtime/lib/audit-run.mjs) carries its failure sentence inside that
object as `what`, and its ten call sites and `gitFor` pass one object each. The two spawn calls are written out in
full, one per branch, with their options in the call and a comment naming the gate that reads them.

## The rule

When a gate refuses code that works, change the shape of the code, not the gate's exemption list. A wrapper's third
argument is part of its contract with the checks that read it, so a wrapper takes one options object and every caller
hands it one.

## What now enforces it

The two gates, on every run of the suite and of CI. The uniform third argument across the three git wrappers is what
keeps them readable. One defect in the gate itself came out of the same diagnosis and is not fixed: the message at
`scripts/git-config.test.mjs:224` offers `WRAPPER_EXCEPTIONS` as the remedy on a branch that never consults it
(docs/BACKLOG.md B44). See also [[2026-09-20-a-command-held-in-a-variable-is-one-word-5d82]], which is the same
mechanism in a shell check.
