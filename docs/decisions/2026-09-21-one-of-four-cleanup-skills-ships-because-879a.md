# One of four cleanup skills ships, because only one beat its own baseline

Kind: Living. Decision entry.

- **ID:** 2026-09-21-one-of-four-cleanup-skills-ships-because-879a
- **Status:** accepted
- **Date:** 2026-09-21

## Decision

The `code-quality` pack ships one skill, `split-a-file`. The other three written for it,
`remove-dead-code`, `name-things-consistently` and `make-a-test-fail`, do not ship. Their text is kept
beside the pack under `docs/archive/not-shipped-skills/`, and the reason is recorded in
docs/not-shipped.md with the scores. All four eval cases stay in the pack, because they are the record of
the measurement.

## Why

Batch 06-03 set the rule before any of this was written: the pack ships in `packs/` only for skills whose
evals show a difference, and the rest are recorded as not shipped and why. Each skill was given an eval
case, and every case was run three times with the plugin and three times without it.

Only `split-a-file` showed a difference: 1.00 against 0.89, a delta of +0.11, and its discriminating
grader is the one that matters. `moved-not-rewritten` passed 3/3 with the skill and 1/3 without it: the
runs without it rewrote the extracted code rather than moving it, which is exactly the failure the skill
names.

The other three cases came back 1.00 against 1.00, 1.00 against 1.00, and 0.93 against 1.00. Nine
baseline runs, every one perfect.

Two of those rows had to be corrected before they could be believed, and the corrections are the reason
this decision took three passes rather than one. `a-test-that-cannot-fail` never ran in the first pass
(an unquoted ": " in its description dropped the whole YAML block), and the dead-code case's trap grader
was asking a `file_exists` check whether a file had survived, which that grader type cannot answer. Both
are fixed in commit 1242dcb, which also adds the packaging-gate checks that refuse each shape.

## Alternatives rejected

**Ship all four anyway, on the argument that the skills are well written.** Rejected because the batch's
rule exists precisely to stop that argument, and a pack whose contents were not measured is the thing
this repository claims not to produce.

**Delete the three skills outright.** Rejected because the measurement does not support the stronger
claim. What was measured is that these three cases have no headroom, not that the skills are useless on a
harder instance. Deleting the text would record a conclusion nobody reached.

**Delete their eval cases too.** Rejected for the same reason: the cases are how anyone checks this
decision, and a decision whose evidence has been removed is an assertion.

**Build harder cases now and re-run.** Rejected for this wave. About 4 USD of the owner's authorised 20
remained, one harder case plus its run would consume most of it, and going looking for a difference after
the measurement came back flat is fishing rather than measuring. It is recorded as the next step instead.

## Risk

The honest risk is that this decision reads as stronger than it is. Three cases at ceiling say the cases
could not tell, and a reader in a hurry will take it as "these skills do not work". docs/not-shipped.md
and the evidence index both state the distinction in those words, and the plugin description says the
other three are recorded rather than discarded.

The second risk is that someone moves a skill back without making its case harder. With the skill out of
the pack both arms are identical, so a re-run would cost money and learn nothing. Both files say so.

## Reversibility

Fully reversible and cheap. Move the SKILL.md from `not-shipped/` back into `skills/`, make its case
harder so the baseline fails some of the time, re-run, and record the new numbers. Nothing was deleted
and the eval cases did not move.

## Evidence

- evidence/1242dcb/README.md, with the three passes and the standing result table.
- evidence/1242dcb/pass-1-three-cases, pass-2-make-a-test-fail, pass-3-dead-code-retrapped: every
  grader's result per run, each with notes naming what in it is not to be believed.
- docs/not-shipped.md: the decision as a record, with what a next attempt would have to do.
- Commit 1242dcb: the two corrections, the three probe cases that measured how the graders behave, and
  the packaging-gate checks that now refuse both shapes.
- Cost 15.90 USD of the 20 the owner authorised on 2026-09-20, as the eval tool's own list-price estimate
  for its runs. Not plan usage, not a bill, not a savings figure.
