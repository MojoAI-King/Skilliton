# The documents, on one screen

Kind: Living. The index of `docs/`: every Markdown file under this folder is reachable from here, and `scripts/docs.test.mjs` fails when one is not. Updated 2026-09-22, after the build.

Every document says its Kind near the top. **Living** is kept current and is safe to rely on. **Reference** is a record that no longer changes. The folders marked *build record* below are this repository's own working notes from building the product; a person using or adopting Skilliton never needs them.

## Read first

| If you want to | Read |
|---|---|
| Know what it is, what it is written in, and how a company takes it to every laptop | [OWNER_GUIDE.md](OWNER_GUIDE.md) |
| See the whole path with diagrams: fork, make it yours, release, install, work, feed lessons back | [HOW-IT-WORKS.md](HOW-IT-WORKS.md) |
| The code map for an engineer opening the code: the four plugins, the runtime's modules by what they own, the path of one session through the hooks, errors and exit codes | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Making Skilliton a company's own: what differs per company, where it lives and how it is changed, and preparing every repository already on a machine, written for the coding assistant doing it | [MAKE_IT_YOURS.md](MAKE_IT_YOURS.md) |
| Join a machine and prepare a repository (you are a developer) | [ONBOARDING.md](ONBOARDING.md) |
| Fork, add skills, sign and publish releases (you are the company) | [RELEASING.md](RELEASING.md), then [DELIVERY.md](DELIVERY.md) for the merge check |
| Know what Claude Code, Codex and Cursor actually do with it, measured or documented | [CLIENTS.md](CLIENTS.md) |
| Answer an IT department: programs started, folders written, network, privileges | [IT-ALLOWLIST.md](IT-ALLOWLIST.md) |
| Know what is protected, against whom, by which mechanism, and where each one stops, with the limits the 2026-09-23 reviews found and the release that fixes each | [THREAT_MODEL.md](THREAT_MODEL.md) |
| The exact formats, commands and exit codes, as implemented | [CONTRACTS.md](CONTRACTS.md) |
| What has and has not been exercised: platforms, versions, signing setups | [COVERAGE.md](COVERAGE.md) |
| Run it on Windows for the first time | [WINDOWS.md](WINDOWS.md) |
| Demonstrate it: what to run, what to say, what not to claim | [DEMO.md](DEMO.md), [POSITIONING.md](POSITIONING.md) |
| Read the technical white paper, or the plain-language guide for someone who signs off but does not code | [WHITE_PAPER.md](WHITE_PAPER.md), [PLAIN_GUIDE.md](PLAIN_GUIDE.md) |
| Something is not working: not seeing it, join refusals, prepare refusals, a denied command, verify reports TAMPERED | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| The company-wide plan beyond this build: device management, routines, more tools | [PHASE-3.md](PHASE-3.md) |

## The product's own records (Living)

| Record | Files |
|---|---|
| Direction and milestones | [PLAN.md](../PLAN.md) |
| Where the work stands, for the next session | [HANDOFF.md](HANDOFF.md) (the RESUME HERE block), earlier entries in [HANDOFF_ARCHIVE.md](HANDOFF_ARCHIVE.md) |
| Status and backlog | [STATUS.md](STATUS.md) with [STATUS_ARCHIVE.md](STATUS_ARCHIVE.md); [BACKLOG.md](BACKLOG.md) (open) with [BACKLOG_ARCHIVE.md](BACKLOG_ARCHIVE.md) (closed, dated, with evidence) |
| Every choice, and every failure with what now prevents it | [DECISIONS.md](../DECISIONS.md) indexing [decisions/](decisions/); [LESSONS.md](LESSONS.md) indexing [lessons/](lessons/); one file per entry |
| Security evidence register | [security/](security/), with the framework sources in [security-catalog-sources.md](security-catalog-sources.md) |
| This repository's own end-of-session steps and full check list | [MAINTAIN.md](MAINTAIN.md) |
| Naming and compatibility with the earlier name | [BRANDING.md](BRANDING.md) |
| Session cost: the meter and the frozen before-picture | `scripts/token-cost.mjs` and [USAGE_BASELINE.md](USAGE_BASELINE.md); PLAN.md sections 6 and 8 govern any number that leaves this repository |

## Build records (this repository's working notes)

| What | Where |
|---|---|
| The report card: 123 acceptance items in ten areas, one batch file each, bars generated from the ticks | [REPORT_CARD.md](REPORT_CARD.md) and [areas/](areas/); what only the owner can do is collected in [OWNER_WALKTHROUGH.md](OWNER_WALKTHROUGH.md) |
| Tonight's owner tests before the 2026-09-23 meeting: each with the command, what you should see and the minutes it takes | [OWNER_TESTS.md](OWNER_TESTS.md), with the longer list in [OWNER_WALKTHROUGH.md](OWNER_WALKTHROUGH.md) |
| The proposed answers to this repository's fifteen security applicability decisions, with the reason for each and the commands that record them once the owner accepts | [SECURITY_PROPOSAL.md](SECURITY_PROPOSAL.md) |
| The proposed protocol for the measured comparison (tasks, the two setups, runs, measure and ceiling), agreed by the owner before any run | [COMPARISON_PROTOCOL.md](COMPARISON_PROTOCOL.md) |
| One task record per piece of work, with acceptance criteria and checkpoints | [tasks/](tasks/) |
| What was built, measured and then not shipped, with the scores | [not-shipped.md](not-shipped.md) |
| Superseded documents (Reference): the goal instructions the build ran under, its integration steps, the first-day prompt, the three unshipped skills' text, the prototype's own plan and handoff, and the first one-pager, superseded by INSTALL.md and PLAIN_GUIDE.md | [archive/](archive/) |
| Rehearsal protocols, including the one for a real new builder | [rehearsals/](rehearsals/) |

## Where the code and the evidence are

| Material | Location |
|---|---|
| The command and its engines | [packs/base/plugins/workflow/runtime/](../packs/base/plugins/workflow/runtime/) (`skilliton.mjs`, `commands/`, `lib/`); run through [scripts/skilliton.mjs](../scripts/skilliton.mjs) or the plugin's `bin/skilliton` |
| The four plugins: hooks, skills, agents, instruction template, catalogs | [packs/base/plugins/](../packs/base/plugins/) |
| Tests and checkers | `scripts/*.test.mjs` and `scripts/*.test.sh`; the full list is [MAINTAIN.md](MAINTAIN.md) step 2, held equal to CI by a test |
| The demo | [scripts/autopilot-demo.mjs](../scripts/autopilot-demo.mjs) |
| Evidence: live sessions, scripted rehearsals, skill evaluations | [evidence/](../evidence/), indexed by its own README |
| Signed release manifests | [releases/](../releases/) |

## Boundaries that still hold

Local presence, publication, installation and verification are separate states; HANDOFF.md names each. Security evidence is not certification. Local guardrails are not merge enforcement. No usage or cost saving is claimed anywhere. Still unproved: Codex lifecycle hooks, a real new builder, Windows, a lane launched through the brief's own `--agent` line (DECISIONS.md and BACKLOG.md name the input each needs).
