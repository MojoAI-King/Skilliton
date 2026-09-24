# Task: Lane hooks-and-tasks

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-hooks-and-tasks-a9e1
- **State:** in-progress
- **Branch:** lane/hooks-and-tasks-0924
- **Owner:** unassigned
- **Updated:** 2026-09-24T03:31:53.025Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [ ] N14. [FEATURE] B74: drift against the criteria is noticed at the stop hook: lib/session-hooks.mjs evaluateStop (the growth note from 9c81b57 lives in commands/checkpoint.mjs): when the current task has criteria, compare the paths its checkpoints and the working tree touched (git diff --name-only since the task's first checkpoint, else since its Updated) and the checkpoint text against the criteria's words (a plain overlap: criteria whose distinctive words appear in no checkpoint and no touched path, and touched top-level folders no criterion names); when at least two criteria have no trace and the task has five or more checkpoints, the stop reason gains one sentence naming them and offering a split (skilliton task start for the untraced part); it never blocks and is said once per working-tree fingerprint like the audit sentence; the comparison lives in a new function under 80 lines or in a new module; cases in scripts/task-drift.test.mjs (a drifted task gets the sentence, a task on track does not) and one in scripts/hook-fixture.test.sh.
- [ ] N15. [TOUCH] B76: a skill copy a repository keeps is noticed at session start: the Project state block (lib/session-hooks.mjs, hook session-start) lists each skill folder under the project's .claude/skills/ whose name matches a skill of an installed plugin (resolve the installed plugins' skills the way doctor already does) and whose SKILL.md differs by content hash, as "skill copy differs from the installed one: <name>", with no write and nothing printed when none differs; scripts/lifecycle.test.mjs is pinned at 2098, so the cases (differs, same, no copies) go in a new scripts/skill-drift.test.mjs with a fixture.
- [ ] N16. [TOUCH] B77: the gate's verdict separates the change from the machine: lib/gate.mjs (42381bf names the files untracked or changed at the start and the one-minute load with the CPU count): a failing verdict also lists, under "failing files outside your change", the file paths the failing check's output names that exist in the tree and are not in the change (git diff --name-only against the merge base with the integration branch, else the working-tree change), and under "competing processes" the other node processes running at the start (ps -axo pid,etime,command, node only, the count and the first three commands cut to 80 characters); scripts/gate-context.test.mjs gains both cases.
- [ ] N17. [TOUCH] B83: the preflight check passes on a loaded machine: scripts/preflight.test.mjs's probe fixture (the 20 s node --version probe that failed under load average 12 and passes alone in 31 s) gets a limit that follows the one-minute load the way scripts/guardrails-timing.test.sh does (NOT RUN with the reason when the load is above twice the CPU count, else 20 s scaled by the load factor and capped at 120 s); the product's own probe limit in lib/preflight.mjs stays; report the file's run time alone in LANE_REPORT.md.
- [ ] N18. [TOUCH] B73: one maintenance for every path: packs/base/plugins/workflow/skills/maintain/SKILL.md gains as its first step "run skilliton maintain --apply and read its output" in those words when it does not already say so, so the journal sees every maintenance; check that the stop hook's maintenance-due sentence (lib/maintain.mjs, 9ed0785) names the same command; the personal maintain skill outside this repository is the main window's.

## Decisions

not yet written

## Checkpoints

## Handoff

- **State:** not yet written
- **Next:** not yet written
- **Blocked:** not yet written
- **Watch out:** not yet written
