# Task: Lane hooks-and-tasks

Kind: Living. Task record.

- **ID:** 2026-09-23-lane-hooks-and-tasks-a9e1
- **State:** in-progress
- **Branch:** lane/hooks-and-tasks-0924
- **Owner:** unassigned
- **Updated:** 2026-09-24T15:26:53.154Z

## Request

LANES.md, dispatched 2026-09-23: the items below are this lane's whole scope, and work that is not among them belongs to another lane.

## Acceptance criteria

- [x] N14. [FEATURE] B74: drift against the criteria is noticed at the stop hook: lib/session-hooks.mjs evaluateStop (the growth note from 9c81b57 lives in commands/checkpoint.mjs): when the current task has criteria, compare the paths its checkpoints and the working tree touched (git diff --name-only since the task's first checkpoint, else since its Updated) and the checkpoint text against the criteria's words (a plain overlap: criteria whose distinctive words appear in no checkpoint and no touched path, and touched top-level folders no criterion names); when at least two criteria have no trace and the task has five or more checkpoints, the stop reason gains one sentence naming them and offering a split (skilliton task start for the untraced part); it never blocks and is said once per working-tree fingerprint like the audit sentence; the comparison lives in a new function under 80 lines or in a new module; cases in scripts/task-drift.test.mjs (a drifted task gets the sentence, a task on track does not) and one in scripts/hook-fixture.test.sh.
- [x] N15. [TOUCH] B76: a skill copy a repository keeps is noticed at session start: the Project state block (lib/session-hooks.mjs, hook session-start) lists each skill folder under the project's .claude/skills/ whose name matches a skill of an installed plugin (resolve the installed plugins' skills the way doctor already does) and whose SKILL.md differs by content hash, as "skill copy differs from the installed one: <name>", with no write and nothing printed when none differs; scripts/lifecycle.test.mjs is pinned at 2098, so the cases (differs, same, no copies) go in a new scripts/skill-drift.test.mjs with a fixture.
- [x] N16. [TOUCH] B77: the gate's verdict separates the change from the machine: lib/gate.mjs (42381bf names the files untracked or changed at the start and the one-minute load with the CPU count): a failing verdict also lists, under "failing files outside your change", the file paths the failing check's output names that exist in the tree and are not in the change (git diff --name-only against the merge base with the integration branch, else the working-tree change), and under "competing processes" the other node processes running at the start (ps -axo pid,etime,command, node only, the count and the first three commands cut to 80 characters); scripts/gate-context.test.mjs gains both cases.
- [x] N17. [TOUCH] B83: the preflight check passes on a loaded machine: scripts/preflight.test.mjs's probe fixture (the 20 s node --version probe that failed under load average 12 and passes alone in 31 s) gets a limit that follows the one-minute load the way scripts/guardrails-timing.test.sh does (NOT RUN with the reason when the load is above twice the CPU count, else 20 s scaled by the load factor and capped at 120 s); the product's own probe limit in lib/preflight.mjs stays; report the file's run time alone in LANE_REPORT.md.
- [x] N18. [TOUCH] B73: one maintenance for every path: packs/base/plugins/workflow/skills/maintain/SKILL.md gains as its first step "run skilliton maintain --apply and read its output" in those words when it does not already say so, so the journal sees every maintenance; check that the stop hook's maintenance-due sentence (lib/maintain.mjs, 9ed0785) names the same command; the personal maintain skill outside this repository is the main window's.
- [x] N33. [TOUCH] Added by the main window after dispatch: the first stop of a session that changed files and recorded no checkpoint is held once, whatever its age (lib/session-hooks.mjs evaluateStop), with checkpoints.holdFirstStop in lib/config.mjs (default true; false restores the minutes rule exactly); cases in scripts/stop-first.test.mjs; hook-fixture and lifecycle run, and each lifecycle expectation that assumed the old rule for a short session is named in LANE_REPORT.md.

## Decisions

not yet written

## Checkpoints

### 2026-09-24T03:48:05.826Z

- **State:** N18, N17 and N16 committed (103aee6, ee9a122, 44e64cc); N15 and N14 not started
- **Evidence:** node scripts/skill-drift.test.mjs exit 0 (1 pass); node scripts/preflight.test.mjs exit 0 (24 pass, 32 s alone); node scripts/gate-context.test.mjs exit 0 (7 pass); node scripts/gate.test.mjs exit 0; lint, lint-shape, docs, deadcode, scrub-check exit 0
- **Next:** N15: skill copy drift at session start, then N14: task drift at the stop hook
- **Git:** lane/hooks-and-tasks-0924 @ 44e64cc, 0 uncommitted

### 2026-09-24T04:03:43.854Z

- **State:** N14 and N15 committed (e80c78c, 8a3050a), so all five brief items are done; N33 (added by the main window) not started
- **Evidence:** node scripts/task-drift.test.mjs exit 0 (4 pass; fails with the sentence switched off); bash scripts/hook-fixture.test.sh exit 0 (p4 fails with the sentence switched off); node scripts/skill-drift.test.mjs exit 0 (4 pass); node --test scripts/lifecycle.test.mjs exit 0 (59 pass); lint, lint-shape, deadcode, scrub-check exit 0
- **Next:** N33: hold the first stop of a session that changed files and recorded no checkpoint, with checkpoints.holdFirstStop
- **Git:** lane/hooks-and-tasks-0924 @ e80c78c, 0 uncommitted

### 2026-09-24T15:26:53.154Z

- **State:** All six items committed (N14 e80c78c, N15 8a3050a and 2391577, N16 44e64cc, N17 ee9a122, N18 103aee6, N33 8eb9185); allowlist.test.mjs is red on one line: gate.mjs now starts ps, which docs/IT-ALLOWLIST.md section 1 and the preflight PROGRAMS table do not name (main-only and outside this lane)
- **Evidence:** hook-fixture, checkpoint-growth, gate-context, skill-drift, task-drift, stop-first, lifecycle (59 pass), preflight (24 pass, 32 s alone), lint, lint-shape, docs, names, scrub-check, deadcode, footprint, skilliton.test all exit 0; allowlist exit 1 (ps not named)
- **Next:** Main window: name ps in docs/IT-ALLOWLIST.md section 1 and in lib/preflight.mjs PROGRAMS, add the CI steps for the four new test files, update docs/CONTRACTS.md for holdFirstStop, the drift sentence, the skill copy line and the two gate lines
- **Git:** lane/hooks-and-tasks-0924 @ 2391577, 1 uncommitted

## Handoff

- **State:** All six items committed (N14 e80c78c, N15 8a3050a and 2391577, N16 44e64cc, N17 ee9a122, N18 103aee6, N33 8eb9185); allowlist.test.mjs is red on one line: gate.mjs now starts ps, which docs/IT-ALLOWLIST.md section 1 and the preflight PROGRAMS table do not name (main-only and outside this lane). Evidence: hook-fixture, checkpoint-growth, gate-context, skill-drift, task-drift, stop-first, lifecycle (59 pass), preflight (24 pass, 32 s alone), lint, lint-shape, docs, names, scrub-check, deadcode, footprint, skilliton.test all exit 0; allowlist exit 1 (ps not named).
- **Next:** Main window: name ps in docs/IT-ALLOWLIST.md section 1 and in lib/preflight.mjs PROGRAMS, add the CI steps for the four new test files, update docs/CONTRACTS.md for holdFirstStop, the drift sentence, the skill copy line and the two gate lines
- **Blocked:** nothing
- **Watch out:** nothing known
