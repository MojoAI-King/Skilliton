# Code-quality pack (B17)

Kind: Living. Batch record. Area [06-clean-code](AREA.md).

- **Type:** build
- **Goal:** Cleanup skills shipped only with evidence from eval cases run with and without them.
- **Depends on:** the owner's eval ceiling
- **Advances:** B17
- **Estimated sessions:** 3

## Acceptance

- [x] eval cases exist for each cleanup skill, run with and without the skill, results recorded (evidence: four cases under packs/base/plugins/code-quality/evals/, each with a fixture.sh, a prompt.md and 7 to 10 graders; every case run three times with the plugin and three times without it, judge model sonnet; evidence/1242dcb/README.md indexes three passes with every grader's result per run, and the two corrected measurements are superseded in place rather than removed)
- [x] the pack ships in packs/ only for skills whose evals show a difference; the rest are recorded as not shipped and why (evidence: split-a-file ships on 1.00 against 0.89, delta +0.11, its discriminating grader moved-not-rewritten passing 3/3 with and 1/3 without; the other three do not ship on 1.00 against 1.00, 1.00 against 1.00 and 0.93 against 1.00; docs/not-shipped.md records each one with its numbers, where its text is kept and what a next attempt must do, and decision 2026-09-21-one-of-four-cleanup-skills-ships-because-879a states why a flat case is not proof a skill is useless)

## Notes

Paid evals; the owner sets the ceiling. He authorised 20 USD on 2026-09-20 and 15.90 was spent, as the
eval tool's own list-price estimate for its runs rather than a bill.

Three passes were needed, not one, and the reason is worth keeping. Two of the four cases were measuring
nothing and both were found only by reading results that did not make sense. `a-test-that-cannot-fail`
never ran at all: an unquoted ": " in its description made YAML read the value as a nested mapping and
the whole frontmatter block was dropped. The tool said so on the run's second line and again in its last
line; the results table was read and those were not. The dead-code case's trap grader asked a
`file_exists` check whether a file had survived, which it cannot answer, and so failed identically in
both arms while the file was present in all six kept scaffold trees. Commit 1242dcb carries both fixes,
the three throwaway probe cases that measured how the graders actually behave, and the packaging-gate
checks that now refuse each shape.

Nine baseline runs across the three unshipped cases scored 1.00 every time. That measures the cases, not
the skills: a case whose baseline is at the ceiling has no room to show a difference. Building harder
cases is the next step and is not claimed here.
