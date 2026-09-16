# Autopilot: start here

Kind: Living. Navigation and current boundaries, not a second roadmap. Updated 2026-09-16 after the M1-M4 integration.

Everything needed to continue the build is in this repository: the direction, the contracts, the integrated runtime, its tests, the rehearsals and their evidence. No earlier chat, sibling worktree or prototype branch is needed.

## Read and continue

1. [PLAN.md](../PLAN.md): the product, scope, and section 7's milestone table with what is proved.
2. [HANDOFF.md](HANDOFF.md): current state and next actions.
3. [CONTRACTS.md](CONTRACTS.md): every shared format, command and exit code as implemented.
4. [DECISIONS.md](../DECISIONS.md) and [LESSONS.md](LESSONS.md): choices, open items and failures to avoid.
5. [CLIENTS.md](CLIENTS.md): what Claude Code and Codex actually do, measured or documented.
6. [AUTOPILOT_INTEGRATION.md](AUTOPILOT_INTEGRATION.md): the integration steps and which acceptance gates remain open.
7. [BUILD_GOAL.md](BUILD_GOAL.md) and [GOAL_COMMAND.md](GOAL_COMMAND.md): the owner's goal instructions.

## Where the material is

| Material | Location |
|---|---|
| The command line and its engines | [packs/base/plugins/workflow/runtime/](../packs/base/plugins/workflow/runtime/) (`skillgate.mjs`, `lib/`, `commands/`); run through [scripts/skillgate.mjs](../scripts/skillgate.mjs) or the plugin's `bin/skillgate` |
| Workflow skills, hooks, instruction template, catalogs | [packs/base/plugins/workflow/](../packs/base/plugins/workflow/) |
| Guardrails | [packs/base/plugins/guardrails/](../packs/base/plugins/guardrails/) |
| Tests | `scripts/*.test.mjs` and `scripts/*.test.sh`; the full list is [MAINTAIN.md](MAINTAIN.md) step 2 |
| Demo | [scripts/autopilot-demo.mjs](../scripts/autopilot-demo.mjs) |
| Rehearsals | [scripts/rehearsals/](../scripts/rehearsals/) (projects, company release, live clients) with results in [evidence/rehearsals/](../evidence/rehearsals/) |
| Client probes | `scripts/live-capability-probe.sh`, `scripts/codex-offline-probe.sh`, `scripts/live-guardrails-probe.sh`, results in [evidence/live/](../evidence/live/) |
| Guides | [ONBOARDING.md](ONBOARDING.md), [RELEASING.md](RELEASING.md), [DELIVERY.md](DELIVERY.md), [rehearsals/NEW_BUILDER.md](rehearsals/NEW_BUILDER.md) |
| What has and has not been exercised (platforms, versions, scale, signing setups, security-review cases) | [COVERAGE.md](COVERAGE.md) |
| Prototype history | [docs/history/autopilot-foundation/](history/autopilot-foundation/), [evidence/autopilot-foundation/](../evidence/autopilot-foundation/), and the byte-for-byte prototype copies in `scripts/fixtures/prototype-v1/` used to test the layout-1 migration |

## Boundaries that still hold

Local presence, publication, installation and verification are separate states; HANDOFF.md names each. Security evidence is not certification. Local guardrails are not merge enforcement. Codex lifecycle hooks, the hosted GitHub delivery adapter, a model session in a clean configuration and a real new builder remain unproved (DECISIONS.md O8, O9, O15, O16).
