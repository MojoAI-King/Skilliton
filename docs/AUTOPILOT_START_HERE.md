# Autopilot: start here

Kind: Living. Navigation and current boundaries, not a second roadmap. Updated 2026-09-16 after the M1-M4 integration.

Everything needed to continue the build is in this repository: the direction, the contracts, the integrated runtime, its tests, the rehearsals and their evidence. No earlier chat, sibling worktree or prototype branch is needed.

## Read and continue

1. [PLAN.md](../PLAN.md): the product, scope, and section 7's milestone table with what is proved.
2. [HANDOFF.md](HANDOFF.md): current state and next actions.
3. [REPORT_CARD.md](REPORT_CARD.md): the ten areas the owner grades against, the bars, the grade history and the waves; each area's batches are under [areas/](areas/).
4. [CONTRACTS.md](CONTRACTS.md): every shared format, command and exit code as implemented.
5. [DECISIONS.md](../DECISIONS.md) and [LESSONS.md](LESSONS.md): choices, open items and failures to avoid.
6. [CLIENTS.md](CLIENTS.md): what Claude Code and Codex actually do, measured or documented.
7. [AUTOPILOT_INTEGRATION.md](AUTOPILOT_INTEGRATION.md): the integration steps and which acceptance gates remain open.
8. [BUILD_GOAL.md](BUILD_GOAL.md) and [GOAL_COMMAND.md](GOAL_COMMAND.md): the owner's goal instructions.

## Where the material is

| Material | Location |
|---|---|
| The command line and its engines | [packs/base/plugins/workflow/runtime/](../packs/base/plugins/workflow/runtime/) (`skilliton.mjs`, `lib/`, `commands/`); run through [scripts/skilliton.mjs](../scripts/skilliton.mjs) or the plugin's `bin/skilliton` |
| Workflow skills, hooks, instruction template, catalogs | [packs/base/plugins/workflow/](../packs/base/plugins/workflow/) |
| Guardrails | [packs/base/plugins/guardrails/](../packs/base/plugins/guardrails/) |
| Tests | `scripts/*.test.mjs` and `scripts/*.test.sh`; the full list is [MAINTAIN.md](MAINTAIN.md) step 2 |
| Demo | [scripts/autopilot-demo.mjs](../scripts/autopilot-demo.mjs) |
| Rehearsals | [scripts/rehearsals/](../scripts/rehearsals/) (projects, company release, fork, machine, live clients) with results in [evidence/rehearsals/](../evidence/rehearsals/) |
| Client probes | `scripts/live-capability-probe.sh`, `scripts/codex-offline-probe.sh`, `scripts/live-guardrails-probe.sh`, results in [evidence/live/](../evidence/live/) |
| Guides | [HOW-IT-WORKS.md](HOW-IT-WORKS.md) (the whole path, with diagrams), [PHASE-3.md](PHASE-3.md) (the company-wide autopilot plan: device-management enrollment, routines, security audit, more tools), [POSITIONING.md](POSITIONING.md) (value claims and their evidence, a skeptical lead's questions, candidate next steps), [IT-ALLOWLIST.md](IT-ALLOWLIST.md) (what IT allows for endpoint security: programs, folders, network, privileges), [WINDOWS.md](WINDOWS.md) (the first Windows run: what to install, what to run, what to send back), [DEMO.md](DEMO.md) (the demonstration: what to run, what to say, what not to claim), [ONBOARDING.md](ONBOARDING.md), [RELEASING.md](RELEASING.md), [DELIVERY.md](DELIVERY.md), [ONE-PAGER.md](ONE-PAGER.md) (what a team gets, in one page), [rehearsals/NEW_BUILDER.md](rehearsals/NEW_BUILDER.md) |
| Project records | [STATUS.md](STATUS.md) with [STATUS_ARCHIVE.md](STATUS_ARCHIVE.md), [BACKLOG.md](BACKLOG.md) with [BACKLOG_ARCHIVE.md](BACKLOG_ARCHIVE.md), [HANDOFF.md](HANDOFF.md) with [HANDOFF_ARCHIVE.md](HANDOFF_ARCHIVE.md), and one file per entry under [tasks/](tasks/), [decisions/](decisions/), [lessons/](lessons/) and [security/](security/), each folder's README describing the shape of its entries |
| Session cost | the meter [scripts/token-cost.mjs](../scripts/token-cost.mjs) and the frozen before-picture [USAGE_BASELINE.md](USAGE_BASELINE.md); PLAN.md sections 6 and 8 govern any number that leaves this repository |
| Security catalog | `packs/base/plugins/workflow/catalogs/`, with the framework sources behind it, how each was verified and the terms they carry, in [security-catalog-sources.md](security-catalog-sources.md) |
| What has and has not been exercised (platforms, versions, scale, signing setups, security-review cases) | [COVERAGE.md](COVERAGE.md) |
| Prototype history | [docs/archive/autopilot-foundation/](archive/autopilot-foundation/), [evidence/autopilot-foundation/](../evidence/autopilot-foundation/), and the byte-for-byte prototype copies in `scripts/fixtures/prototype-v1/` used to test the layout-1 migration |

## Boundaries that still hold

Local presence, publication, installation and verification are separate states; HANDOFF.md names each. Security evidence is not certification. Local guardrails are not merge enforcement. Codex lifecycle hooks, the hosted GitHub delivery adapter, a model session in a clean configuration and a real new builder remain unproved (DECISIONS.md O8, O9, O15, O16).
