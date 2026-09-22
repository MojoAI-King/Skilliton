# Skills that did not ship, and the measurement that decided it

Kind: Reference. Written 2026-09-21.

Batch [06-03](areas/06-clean-code/batch-03-code-quality-pack.md) sets the rule this file exists to
record: the pack ships in `packs/` only for skills whose evals show a difference; the rest are recorded as
not shipped and why. Four cleanup skills were written and given an eval case each, every case run three
times with the plugin and three times without it. One earned its place; the other three did not.

Their text is kept, beside the pack it did not join, under `docs/archive/not-shipped-skills/`. It is kept rather than deleted so the next attempt starts from a case that is known not to
discriminate rather than from a blank page, and so that anyone who disagrees with the decision can read
what was actually measured instead of taking this file's word for it.

## What was measured

Judge model sonnet, three runs per arm, six runs per case, on the tree at commit `1242dcb`.
Evidence, with every grader's result per run: [`evidence/1242dcb`](../evidence/).

| Skill | Case | with | without | Delta | Shipped |
| --- | --- | --- | --- | --- | --- |
| split-a-file | split-keeps-behavior | 1.00 | 0.89 | **+0.11** | yes |
| remove-dead-code | dead-code-with-a-live-caller | 1.00 | 1.00 | 0.00 | no |
| name-things-consistently | one-concept-three-names | 0.93 | 1.00 | -0.07 | no |
| make-a-test-fail | a-test-that-cannot-fail | 1.00 | 1.00 | 0.00 | no |

Total spend 15.90 USD of the 20 the owner authorised, across three passes and three throwaway probe
cases. This is the eval tool's own cost estimate for its runs, not a bill and not a savings claim; PLAN.md
sections 6 and 8 govern any number that leaves this repository.

## What the numbers mean, and what they do not

**Only `split-a-file` moved the result.** Its discriminating grader is `moved-not-rewritten`, which
passed 3/3 with the skill and 1/3 without it: the runs without it rewrote the extracted code instead of
moving it, which is the exact failure the skill names.

**The other three cases did not discriminate, which is not the same as proving the skills useless.**
Their without-arms scored 1.00, 1.00 and 1.00 across nine baseline runs. A case whose baseline is already
at the ceiling has no room left to show a difference, so what was measured is that these three jobs, as
these cases pose them, are ones the model already does correctly on its own. Whether the skills help on a
harder instance is untested, because no harder instance was built.

Two particulars worth carrying:

- `remove-dead-code` first read +0.05. That was not a result. Its trap grader was broken, and the broken
  grader's noise was the whole of the difference. With the grader fixed the case is 1.00 against 1.00,
  six runs of six, and the baseline found the handler whose only callers are a JSON file and a shell
  script every single time. Commit `1242dcb` has the mechanism.
- `name-things-consistently` reads -0.07, and that is not evidence the skill harms. The without-arm was
  3/3 perfect; the with-arm lost one grader in each of two runs, and they were different graders
  (`old-names-banned` in one, `readme-updated` in the other). That is noise around a ceiling on a
  three-run sample, and it is the honest reason the skill does not ship rather than a reason to avoid it.

## To reconsider one of these

Move its `SKILL.md` from `docs/archive/not-shipped-skills/` back under that plugin's `skills/`, **and first make its case
harder**, because re-running it as it stands measures nothing: with the skill absent from the pack both
arms are now identical. A case earns its keep by having a baseline that fails some of the time. The
recorded command is in [docs/MAINTAIN.md](MAINTAIN.md) step 4, and the eval cases themselves stayed in
the pack under `evals/`.
