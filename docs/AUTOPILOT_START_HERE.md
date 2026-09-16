# Autopilot: start here

Kind: Living. Navigation and current boundaries, not a second roadmap. Updated 2026-09-16.

The aligned direction, preparation/security source, regression tests, demonstration and implementation history are now files in this repository. A session working from local `main` does not need another worktree or the conversation to find them. Their presence does not mean the remaining product integration is complete.

## Read and continue

1. [PLAN.md v4](../PLAN.md) defines the product, scope and M1-M5 acceptance gates.
2. [HANDOFF.md](HANDOFF.md) records current execution state and the next actions.
3. [CONTRACTS.md](CONTRACTS.md) distinguishes existing interfaces from target interfaces.
4. [AUTOPILOT_INTEGRATION.md](AUTOPILOT_INTEGRATION.md) names the remaining integration seams.
5. [DECISIONS.md](../DECISIONS.md) and [LESSONS.md](LESSONS.md) preserve choices, open questions and failures to avoid.
6. [BUILD_GOAL.md](BUILD_GOAL.md) contains the full goal instructions for completing the build; [GOAL_COMMAND.md](GOAL_COMMAND.md) has the paste-ready launcher under the 4,000-character input limit.

Follow the current repository's `AGENTS.md` and `CLAUDE.md`. One integrating session owns shared plans, contracts and final decision reconciliation; parallel lanes need explicit write sets.

## Source and reproducible evidence

| Material | Location | Present scope |
|---|---|---|
| Existing onboarding CLI | [scripts/skillgate.mjs](../scripts/skillgate.mjs) | The product entry point to extend |
| Preparation command | [scripts/prepare.mjs](../scripts/prepare.mjs) | Standalone preview/apply/check with preservation and recovery checks |
| Project documents and starter controls | [scripts/project-files.mjs](../scripts/project-files.mjs) | Initial records, managed instructions and seven related practice summaries |
| Project security observations | [scripts/security-evidence.mjs](../scripts/security-evidence.mjs) | Scoped records and missing/current/stale/invalid status |
| Preparation regression tests | [scripts/prepare.test.mjs](../scripts/prepare.test.mjs) | Adoption, repeat setup, path protection and write-failure behavior |
| Security regression tests | [scripts/security-evidence.test.mjs](../scripts/security-evidence.test.mjs) | Record validation, freshness and safe failure cases |
| Synthetic demonstration | [scripts/autopilot-demo.mjs](../scripts/autopilot-demo.mjs) | Creates a disposable project and proves an observation becomes stale after a source change |
| Original verification | [verification.md](../evidence/autopilot-foundation/verification.md) | Prior foundation results with their original scope |
| Combined-tree import validation | [import-validation.md](../evidence/autopilot-foundation/import-validation.md) | Results and limitations recorded for bringing the material into the current tree |

From the repository root, run:

```sh
node --test scripts/prepare.test.mjs scripts/security-evidence.test.mjs
node scripts/autopilot-demo.mjs
```

The demonstration prints the location of its disposable repository. It deliberately ends with a failing synthetic application test and a stale observation. That proves the freshness behavior; it does not install a shared merge gate. Read the recorded validation before repeating larger suites or paid evaluations.

## What remains to connect

The source is present on local `main`; preparation and project security are still standalone foundation commands. M1 must adapt them into the existing CLI/plugins. It must reconcile config readers and doctor, route instructions through the single harness writer, map result codes deliberately, establish approved package/runtime identity, and connect adopted paths to the workflow skills. Keep the existing and target contracts distinct until those checks pass.

M2-M5 add and demonstrate normal-work continuity, company-approved releases and repository migrations, broader security evidence and shared delivery checks, and beginner/team use. A source import does not close those gates. Local records do not establish compliance, and local assistant guardrails do not enforce all application merges.

## Preserved implementation history

The foundation originated at `23aae41`; the shared direction was aligned at `cd23189`. These are provenance references, not branches that must be checked out or merged again. The foundation already includes the security branch's implementation.

The older [foundation plan](history/autopilot-foundation/PLAN.md), [foundation handoff](history/autopilot-foundation/HANDOFF.md) and [foundation decision](history/autopilot-foundation/DECISION.md) are archived implementation history. They preserve the original design, framework sources, commands and limitations. Where they differ from current direction or file locations, follow PLAN.md v4 and the current integration brief.

Local presence, publication, installed behavior and end-to-end verification are separate states. See HANDOFF.md and the validation records for the observed state; do not infer publication from a local commit.
