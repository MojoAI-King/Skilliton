# A cold review gates the release, and one check list is read by a local runner

Kind: Living. Decision entry.

- **ID:** 2026-09-22-a-cold-review-gates-the-release-and-one-6ef8
- **Status:** accepted
- **Date:** 2026-09-22

## Decision

Before a release the repository is reviewed cold: a fresh subagent with no session context, briefed as the outside reviewer an organisation would use (README, organisation, coding habits, tests, documentation), returns letter grades and a ranked list of what costs a grade, with file and line. Each item is then either shipped or written into docs/BACKLOG.md with the reason it waits; none is left unanswered. The review is run again on the result, so the second reading is the evidence that the first was acted on.

Two readings ran on 2026-09-22 before 1.0.0. The first (README C+, organisation B-, habits B+, tests A-, docs B-) produced twelve items; the second on the changed tree (README B+, organisation B, habits B+, tests B, docs B-) produced ten. Shipped from the two: README rewritten in a cold reader's order with a tech-facts table first; docs/README.md as a one-screen index that names which folders are build records; BUILD_GOAL, GOAL_COMMAND, AUTOPILOT_INTEGRATION, DAY-1-KICKOFF and the three unshipped skills archived under docs/archive/; LANES.md removed after its dispatch merged; evidence/README.md; the context-hygiene marketplace description made true; lib/security.mjs split along its file-layer seam into lib/security-io.mjs (731 to 498 lines, its pin deleted, the move byte-identical against the committed file); B55 fixed with a test; scripts/checks.mjs; CONTRIBUTING.md, SECURITY.md, CHANGELOG.md; the numbers in README and the owner guide corrected to what the tree says (58 check steps, about 40,000 lines); the use-as-is path made honest about where a join file comes from (B53); the dead-code summary saying which modules it could follow; code-quality enabled at project scope and in the template. Deferred with reasons as B57 (legacy modules and the catalog's earlier name, which needs a migration), B58 (one test convention, which changes every CI step for no behaviour change), B59 (a size ceiling over scripts/), B60 (the handoff trimmed to its RESUME HERE block), and B50 (an allow with a reason on a turned-off guardrail, a change to the hook's allow path the night before a release).

The second decision is about the check list. There were two hand-kept copies (docs/MAINTAIN.md step 2 and .github/workflows/checks.yml) held equal by a test (B43). Rather than a third copy in a runner, scripts/checks.mjs reads checks.yml and runs its steps one at a time with a verdict per step and the full output in a log under .git/skilliton/checks/; CI runs the runner's --list as a step, so the runner and the list cannot drift apart. The MAINTAIN copy stays, with its equality test, because it carries what each check holds; folding it is still B43. Two steps are skipped on a laptop and say so: the CI tool check and the security collectors, which write records into the working tree. The runner starts a plain shell, not a login shell, because the profile files of a login shell change the environment the preflight tests control; that cost one false failure on its first run and is a lesson entry.

## Why

A judge reading the repository cold sees what an author no longer can. The first reading's top item was that the README's first sentence was a rename notice; nobody in the build had read it as a stranger for a week. Running the review twice, and writing down the reason for every item not shipped, is what makes the grade a measurement instead of an opinion: the second reading either moved or it did not, and the backlog says why the rest waits.

One list for the checks is the same rule as everywhere else in this repository: a second copy of a fact is a second thing to drift, and B43 had already measured that the two copies agree only because a test holds them.

## What it does not decide

The letter grades in docs/REPORT_CARD.md are the owner's and were not changed. The reviews' grades are two subagents' readings of one tree on one night, useful for ranking work, not a grade of record. The prompt-rewrite skill the owner asked about was declined for a reason recorded in the task record: it duplicates `task` and would not pass the repository's own eval bar. Two candidate skills, `release` and `commit`, are proposed and wait on the owner's choice.

## Evidence

Commits 1ea056f, 28ad475, 0cada16, bf94373, d35a9a8 on main; CI success on each (the job view shows 63 or 64 steps, the run lines are 58); the full suite through scripts/checks.mjs 56 pass, 0 fail, 2 skipped by design; docs/tasks/2026-09-22-a-quality-pass-before-the-wednesday-revi-0d34.md.
