# A gate list typed by hand from prose has no gate of its own

Kind: Living. Lesson entry.

- **ID:** 2026-09-20-a-gate-list-typed-by-hand-from-prose-has-ce6a
- **Status:** accepted
- **Date:** 2026-09-20

## What broke

Running the document gates one at a time during the wave 6 maintenance pass, one line of the batch read
`handoff exit: 1`. Nothing was wrong with the handoff writer. The command was `node scripts/handoff.test.mjs`, and
that file does not exist: the script is `scripts/handoff-write.test.mjs`. Node exits 1 on a module it cannot
resolve, which is the same exit status a failing test gives, so the line in the batch output was indistinguishable
from a real failure until the log was opened.

## The mechanism

The list of offline checks lives in two hand-maintained places and in no runnable one.
[docs/MAINTAIN.md](../MAINTAIN.md) step 2 holds it as prose grouped by area, and
[.github/workflows/checks.yml](../../.github/workflows/checks.yml) holds it as steps. Measured on 2026-09-20 by
extracting every `scripts/*.mjs` and `scripts/*.sh` path from both files, the two lists name the same 42 scripts, so
they agree today. Nothing holds them in agreement: no test compares them, and a check added to one and forgotten in
the other would be found by a person reading two files, or not at all.

There is no committed runner either. This repository has no root `package.json` on purpose (the zero dependency
claim in docs/IT-ALLOWLIST.md), no Makefile, no `scripts/verify` of any kind, and no `.skilliton/delivery.json`, so
`skilliton gate` here has no check list of its own and has to be given `--cmd`. Every session that runs the whole
suite locally retypes it into a scratchpad script from the prose. A name typed wrong is loud, as it was here. A name
left out is silent, and it reads as a suite that passed.

## The fix

None yet, on purpose. The finding is recorded as docs/BACKLOG.md **B43** with the shape of the fix in it: one
committed list that both the local runner and CI read, and a test that fails when the two disagree. The
measurement that found it is the four line comparison in that row, not an impression.

## The rule

A list of checks is a shared name, so it obeys the same rule as every other shared name here: one home, and a test
over the relationship when there are two. Until that exists, read the log of any gate whose line is not exit 0
rather than reporting the status, because a missing script and a failing check exit alike.

## What now enforces it

Nothing automatic; B43 names the test that would. CI is the partial enforcement that exists today: it runs its own
list on every push, so a check that is in `checks.yml` and missing from a session's typed list is still run before a
merge. The reverse, a check in docs/MAINTAIN.md that CI does not run, has nothing watching it. Related:
[[2026-09-20-a-command-held-in-a-variable-is-one-word-5d82]], which is the same family from the other side: there a loop of checks ran nothing and reported success.
