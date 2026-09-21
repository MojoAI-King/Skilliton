# The code-quality pack's eval evidence, in three passes

Kind: Reference. Written 2026-09-21.

Batch [06-03](../../docs/areas/06-clean-code/batch-03-code-quality-pack.md) asks for eval cases for each
cleanup skill, run with and without the skill, results recorded, and then for the pack to ship only the
skills whose evals show a difference. This folder is that record. The decision it produced is in
[docs/not-shipped.md](../../docs/not-shipped.md).

Three passes rather than one, because two of the four cases were found to be measuring nothing and were
corrected before the result was recorded:

| Pass | What it ran | Result |
| --- | --- | --- |
| [pass-1-three-cases](pass-1-three-cases/SUMMARY.md) | all four cases attempted; three ran | split +0.11, naming -0.07, dead-code +0.05 **superseded** |
| [pass-2-make-a-test-fail](pass-2-make-a-test-fail/SUMMARY.md) | the case that did not load in pass 1, after its YAML was fixed | 1.00 against 1.00, delta 0.00 |
| [pass-3-dead-code-retrapped](pass-3-dead-code-retrapped/SUMMARY.md) | the dead-code case with its trap grader rewritten | 1.00 against 1.00, delta 0.00 |

Each pass's notes say what ran, the exact command, and what in it is not to be believed. Pass 1's
dead-code row is superseded by pass 3 and is kept rather than removed, because a corrected measurement
that hides the first one is not evidence.

**The standing result**, taking pass 3 over pass 1 for dead-code:

| Skill | Case | with | without | Delta | Shipped |
| --- | --- | --- | --- | --- | --- |
| split-a-file | split-keeps-behavior | 1.00 | 0.89 | **+0.11** | yes |
| remove-dead-code | dead-code-with-a-live-caller | 1.00 | 1.00 | 0.00 | no |
| name-things-consistently | one-concept-three-names | 0.93 | 1.00 | -0.07 | no |
| make-a-test-fail | a-test-that-cannot-fail | 1.00 | 1.00 | 0.00 | no |

Nine baseline runs across those three unshipped cases scored 1.00 every time. What that measures is that
the cases have no headroom, not that the skills are useless; docs/not-shipped.md states the difference
and what a next attempt would have to do.

Cost: 15.90 USD across the three passes and three throwaway probe cases, against a ceiling of 20 the
owner authorised on 2026-09-20. These are the eval tool's own list-price estimates for its runs. They are
not plan usage, not a bill, and not a savings figure; PLAN.md sections 6 and 8 govern any number that
leaves this repository.
