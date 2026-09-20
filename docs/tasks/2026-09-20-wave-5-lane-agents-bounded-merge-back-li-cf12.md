# Task: Wave 5: lane agents bounded, merge-back, lint, split core.mjs

Kind: Living. Task record.

- **ID:** 2026-09-20-wave-5-lane-agents-bounded-merge-back-li-cf12
- **State:** in-progress
- **Branch:** main
- **Owner:** unassigned
- **Updated:** 2026-09-20T15:33:44.528Z

## Request

continue you work on the next wave as we get closer to completeling all waves and begin the review

## Acceptance criteria

- [x] 06-01: a decision entry picks a dependency-free in-repo lint with the reason, the step runs in CI and in docs/MAINTAIN.md step 2 with a self-test, and the tree passes it with the fixes as their own commit (evidence: decision 2026-09-20-a-dependency-free-in-repo-lint-and-a-siz-da3d; scripts/lint.test.mjs with four rules and a self-test, in CI and docs/MAINTAIN.md step 2; commit 903eabc for the four unused imports it found)
- [x] 06-02: the five commands in lib/core.mjs move into commands/ files with no behavior change, a test fails when any runtime file exceeds the stated line count, and the full offline suite passes after the move (evidence: commit 274138d, core.mjs 1307 to 349 lines; the 600 line ceiling with its ratchet in the lint; the full offline suite 46 of 46 on the final tree)
- [x] 07-03: a guardrails rule refuses writes to the main-only paths inside a lane with a fixture test, skilliton dispatch merge integrates lane task records and proposed entries into main, and a conflict report names what did not merge with a test (evidence: hooks/lane-write-guard.mjs with 15 checks that an always-allow stub turns red; dispatch merge in workflow 0.12.0; the three classes and the two warnings, all exit 1, with mutations proving each assertion gates)
- [x] 07-02: dispatch writes and commits each lane's own task record in the worktree, with the launch line and the meter's peak-context instrument built and the live measurement named in the report card owner pass (evidence: dispatch --apply commits one task record per lane; the brief's launch line reads the agent definition; peak_ctx in the meter with a hand-computed fixture test; items 1 and 3 named in the report card owner pass and as B38)

## Decisions

- 2026-09-20-a-dependency-free-in-repo-lint-and-a-siz-da3d: the lint is in-repo and dependency-free, the ceiling is 600 lines with a ratchet of pinned files, and no dash rule is written because `scripts/scrub-check.sh` already owns dashes.
- 2026-09-20-the-merge-back-half-of-dispatch-the-lane-ef33: dispatch commits each lane's task record, `dispatch merge` collects what a lane committed and writes without committing, a warning is exit 1, and a guardrails hook refuses a lane's writes to the integration branch's paths with its limit stated.
- Four owner answers taken before the plan on 2026-09-20: defer the real dispatch run and build the instruments; a dependency-free in-repo lint; a 600 line ceiling with a ratchet table; dispatch creates and commits the lane record.

## Checkpoints

### 2026-09-20T15:33:44.528Z

- **State:** Wave 5 batches 06-01 and 06-02 are built and committed: a dependency-free lint with four rules and a ratcheting 600 line ceiling, and lib/core.mjs split from 1307 lines to 349 with two engines (harness, doctor), lib/skills-repo.mjs, and five commands turned into modules so the router dispatches modules only
- **Evidence:** The full offline suite ran 46 of 46 green on the split tree, one gate at a time with its exit status on its own line; the allow list caught the split relocating eight inventory rows and was corrected to name lib/doctor.mjs, commands/doctor.mjs and commands/import.mjs; help texts and real output byte-compared against the same commands built from HEAD; lint and lint --self-test exit 0; scrub-check PASS; commits 274138d and 70494ad
- **Next:** Batch 07-03: the lane write guard hook in the guardrails plugin with fixture tests, then skilliton dispatch merge with its three classes and exit 1 on conflicts
- **Git:** main @ 70494ad, 0 uncommitted

## Handoff

- **State:** Wave 5 batches 06-01 and 06-02 are built and committed: a dependency-free lint with four rules and a ratcheting 600 line ceiling, and lib/core.mjs split from 1307 lines to 349 with two engines (harness, doctor), lib/skills-repo.mjs, and five commands turned into modules so the router dispatches modules only. Evidence: The full offline suite ran 46 of 46 green on the split tree, one gate at a time with its exit status on its own line; the allow list caught the split relocating eight inventory rows and was corrected to name lib/doctor.mjs, commands/doctor.mjs and commands/import.mjs; help texts and real output byte-compared against the same commands built from HEAD; lint and lint --self-test exit 0; scrub-check PASS; commits 274138d and 70494ad.
- **Next:** Batch 07-03: the lane write guard hook in the guardrails plugin with fixture tests, then skilliton dispatch merge with its three classes and exit 1 on conflicts
- **Blocked:** nothing
- **Watch out:** nothing known
