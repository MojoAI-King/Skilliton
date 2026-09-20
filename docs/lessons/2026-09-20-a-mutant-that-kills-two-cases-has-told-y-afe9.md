# A mutant that kills two cases has told you something about the tests

Kind: Living. Lesson entry.

- **ID:** 2026-09-20-a-mutant-that-kills-two-cases-has-told-y-afe9
- **Status:** accepted
- **Date:** 2026-09-20

## What broke

Nothing failed. Three fixture tests cover the Stop hook's new after-merge rule, and three mutants were written to
prove them: delete the merge sentence, drop `--merges` from the commit range, and stop reporting the problem when the
range cannot be read. Run as a set, each mutant made the suite red, which is the answer a mutation check is usually
read for. Applying each mutant one at a time and watching which case it killed gave a different answer: dropping
`--merges` kills case 1 and case 2, not case 2 alone.

## The mechanism

Case 1 asserts the exact reason text for a merge that landed in the window, including the count and the short sha.
Case 2 asserts that an ordinary commit in the same window produces no maintain sentence. Without `--merges` the
`git rev-list` range returns every commit, not only the merges, so case 1's count is wrong and its assertion fails
for a reason that has nothing to do with the behavior case 2 names. The mutant is not specific to the rule it was
meant to isolate, so the number of failures it causes does not map onto the number of cases that are pulling weight.

Read only as a count, "3 mutants, 3 red suites" says every case is justified. Read case by case, it says case 2 has
no mutant of its own: it is a regression guard whose worth is that it names the reason directly and does not lean on
case 1's exactness. That is still worth keeping, and it is a different claim from the one the count implies.

## The fix

No code changed. The measurement is written down where the claim is made: the Notes of
[docs/areas/01-autopilot-loop/batch-04-routines.md](../areas/01-autopilot-loop/batch-04-routines.md) records which
mutant kills which case, names case 2 as a regression guard rather than a mutant-justified case, and records that
both sources were restored from their backups and proved byte-identical with `diff` afterwards.

## The rule

Apply each mutant on its own and record which cases it kills, not how many failures the suite reports. A mutant that
kills more than its own case is a finding about the tests, and it goes in the evidence exactly as measured. Rounding
it up to one mutant per case would make the batch file say something that was measured to be false.

## What now enforces it

Nothing automatic. It is the same practice as [[2026-09-20-an-assertion-that-a-value-wins-only-gate-a070]], one step
further: that entry says a new assertion must be watched failing, this one says to watch *which* assertion fails. The
record is the enforcement, in the batch evidence and in the restoration proof beside it.
