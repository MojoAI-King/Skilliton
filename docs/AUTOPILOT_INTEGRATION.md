# Autopilot integration brief

Kind: Living. Execution detail for PLAN.md v4, not a second roadmap. Updated 2026-09-16 after the integration.

## How the integration ran

One integrating session (Claude Code) wrote integration contract v1, moved the runtime into the workflow plugin, and ran six lanes with fixed write sets and a verified base: prepare, security, lifecycle, release, delivery, and guardrails under Codex. Lanes merged one at a time; the full suite ran after every merge, and the seams it exposed were fixed on the combined tree (DECISIONS.md; docs/LESSONS.md). The prototype at `23aae41` was adapted in place; neither prototype branch was merged again.

## M1: one prepared repository

| Step | Acceptance | State and evidence |
|---|---|---|
| I1 | Config and result contracts shared by every reader; doctor recognizes preparation; missing evidence is attention; invalid input and failures stay distinct | Done. `runtime/lib/config.mjs`; exit codes 0, 1, 2, 3 everywhere (CONTRACTS section 6); doctor reports layout, required versions and rendered instruction blocks (project rehearsal N2) |
| I2 | Prepare adapted; one explicit target; records and settings preserved; failure and repeat setup exercised | Done. 41 tests including the 16 prototype cases; project rehearsal N1, A1, A2 |
| I3 | One instruction writer; prototype markers migrated; human text preserved | Done. Blocks come only from `planHarnessFile`; migration `0002-integrated-layout` (project rehearsal G1); template changes arrive as `0100-instructions-<hash>` |
| I4 | Runtime in the approved distribution; moving a toolkit clone does not break a project; copied runtime migrated | Done. Runtime inside the workflow plugin; company release rehearsal P2; 0002 removes the copied runtime only when its bytes match |
| I5 | Maintain, Handoff, Review, Dispatch use adopted records and security status; single-task work recorded; workers do not overwrite shared handoffs | Done in skill text and runtime (task records, branch-aware handoff, dispatch base check); lifecycle tests; live Claude Code sessions L1 and L2; workflow evals at 0.3.0, 4 of 4 cases, and the task and security cases at 0.3.3 (1.00 each) |
| I6 | Combined validation and an existing-repo walkthrough | Done. Full suite on the combined tree; project rehearsal including adoption of a clone of this repository |

## M2 to M5

| Milestone | Proved | Still open |
|---|---|---|
| M2 Normal-work continuity | Session start, stop reminder with a checkpoint, and interrupted-session recovery in real Claude Code sessions; two contributors' tasks and decisions merge without conflicts (project rehearsal C1) | Codex lifecycle hooks (O9); an interactive session (O6) |
| M3 Approved company updates | Company release rehearsal, 18 of 18: fork, signed release, clean Claude Code and Codex installs verified, lesson to proposal to improved skill with a behavior eval that fails before and passes after, update received by both clients, template migration with rollback, tamper, unauthorized release, rollback, withdrawal, removal | A model session in the clean configuration and automatic updates at session start (O8); a signed release of this repository (O17) |
| M4 Security and shared delivery | 15-control catalog, applicability, expiry, collectors and deduplicated findings; a shared repository's check rejects a change that breaks only when combined; policy changes need an approver's signature (delivery tests, demo) | The GitHub adapter on a hosted repository (O15) |
| M5 Beginner and team rehearsal | Protocol and observation sheet ready (docs/rehearsals/NEW_BUILDER.md) | A real new builder (O16) |

## Coordinating sessions

The integrating session owns the CLI, config, harness contracts, PLAN.md and final decision and status reconciliation. Another session proposes changes to those in a task record and does not rewrite them independently. Lanes receive explicit files and a base commit, verify the base before writing, and report local, integrated, released and verified states separately. Since 2026-09-20 `skilliton dispatch` writes that arrangement: one worktree per lane under the lane root, each holding a `LANE_BRIEF.md` with the lane's items, its base, the integration branch's own paths and a context ceiling that is prose, not a setting. It refuses rather than reusing an existing branch, folder or registered worktree. No real dispatch has been run yet; what is proved is the refusals.
