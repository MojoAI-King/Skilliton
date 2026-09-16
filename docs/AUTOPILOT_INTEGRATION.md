# Autopilot integration brief

Kind: Living. Execution detail for PLAN.md v4, not a second roadmap. Updated 2026-09-16.

## Resume the shared build

The owner has aligned the product around the development autopilot: prepared repositories, routine workflow execution, durable project knowledge, continuous security evidence, and company-approved improvements. PLAN.md v4 supersedes the narrower v3 day ordering. Preserve working main-branch plugins, CLI, tests and evidence.

The foundation at `codex/autopilot-foundation-0916`, commit `23aae41`, contains the work from `codex/security-evidence-0916`. The security script and tests match across both branches. Integrate the foundation once; do not independently merge both. Its older `docs/AUTOPILOT_PLAN.md` and `docs/AUTOPILOT_HANDOFF.md` are historical implementation notes, not new authorities to add beside PLAN.md v4.

The foundation and main changed the same existing path only in DECISIONS.md as of the comparison at main `243afee`. Main subsequently advanced. Recompare against the current base before integration. A clean textual merge would not resolve the behavioral seams below.

## M1: integrate a prepared repository

| Step | Work | Acceptance |
|---|---|---|
| I1 | Extend the shared config/result contracts in docs/CONTRACTS.md and every relevant reader; retain main CLI | Correct preparation is recognized by doctor; missing security evidence is attention; invalid input and operation failures remain distinct |
| I2 | Adapt foundation scripts `prepare.mjs`, `project-files.mjs`, `security-evidence.mjs` and their tests | One explicit target; existing records/settings preserved; failure and repeat setup exercised |
| I3 | Route generated instructions through the existing harness renderer; migrate prototype markers | Exactly one current managed block per file; human text preserved; update and removal affect the intended owned content only |
| I4 | Package executable runtime with the approved distribution; retain project evidence locally | Moving a toolkit clone does not break the project; runtime identity is known; copied prototype runtime has a tested migration |
| I5 | Update Maintain, Handoff and Review to use adopted records/security status; update Dispatch write boundaries | Full initial structure is created by Prepare; one-task work is recorded; workers do not overwrite shared handoffs; relevant plugin versions bumped |
| I6 | Run combined validation and one existing-repo walkthrough | Original CLI/plugin checks plus foundation tests pass; fresh/repeated adoption and stale observation behavior are demonstrated on the integrated tree |

Do not cherry-pick obsolete planning prose over the aligned plan. Preserve the useful prototype code and regression cases, then adapt them to the shared contracts. The 41 prototype tests are prior evidence, not a substitute for integrated validation.

## M2-M5: prove the complete experience

Follow the milestone table in PLAN.md. The company-fork rehearsal must include prepared project records, one actual skill improvement, one preserved project migration, one stale observation, tamper detection and rollback/removal. A separate application delivery rehearsal must show that trusted checks reject a defective combined change. Use a disposable project and synthetic data for destructive-command confirmation and security probes.

Measure actual behavior in each client. A fresh clone passing tests does not prove that a new employee received an update, that a session hook ran, or that Codex has the same behavior as Claude Code. Do not advertise the full loop as automatic before these observations exist.

## Coordinating sessions

The integrating session owns CLI/config/harness contracts and final shared documentation. Implementation lanes receive explicit files and a base commit before writing. Useful independent lanes are preparation/evidence adaptation, release verification, and bounded client rehearsals after their contracts are fixed. Each lane reports local, integrated, released and verified states separately.

Do not have two sessions rewrite PLAN.md or DECISIONS.md independently. Record proposed decisions in the task's permitted record, and reconcile them through the integrating session. Upstream and company-release work may proceed independently only where the declared write sets and interfaces permit it.

## Existing open evidence

DECISIONS.md retains the detailed unresolved items. Live session-start/interactive confirmation, clean-environment updates and Codex behavior still need rehearsal. The usage meter's historical scope/cutoff and manual quota readings block usage claims only. They do not block M1's repository preparation or the approved-update design.
