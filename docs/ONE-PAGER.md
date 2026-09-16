# Skillgate: how your team works with AI

Kind: Living. Covers the current build and the agreed autopilot direction. The complete company onboarding and update journey still needs a fresh-user rehearsal.

## For your first week

**Skillgate gives your coding assistant a shared way of working.** Your company chooses the skills and rules once. The goal is for you to describe a task normally, without needing to know skill names or how separate coding workspaces operate.

Today, plugins help the assistant organize work, review changes, save a handoff, and maintain project notes. An enabled hook shows an existing handoff at session start. Another checks supported risky git commands issued through Claude's Bash tool; it may block them or ask for confirmation.

**What to expect during work:**

1. Start a session and read the short handoff with the assistant. Correct anything that is missing or out of date.
2. Describe what you want built and what success looks like. The assistant should explain its proposed changes in plain language.
3. Before committing, expect a review that says what changed, what might break, and what was tested. A failing or skipped check must be visible.
4. At a stopping point, expect a saved note covering progress, decisions, and the next step. If that note was not written, the next session cannot display it.

These steps are instructions, not all forced by software today. Have the assistant explain any block and a safe next step. Ask your maintainer about unclear setup or review results.

**What comes next:** preparation of status, backlog, roadmap, decisions, lessons, handoffs, and security records; better interrupted-work recovery; security evidence that shows when supporting information changes; and trusted checks before merging. Preparation and evidence tracking have a locally tested prototype, outside the main install.

**How improvements arrive:** your company approves changes to its shared tools. Plugin updates then reach installed copies through the marketplace. Updating project instructions and structure is separate; automatic migrations remain planned and must preserve project history. Product changes still follow the normal review process.

An optional usage display shows available quota readings. It is not required for the project workflow and promises no particular saving.

## For the person maintaining this

Use the [README](../README.md) for current install commands. [PLAN.md](../PLAN.md) owns the roadmap; [CONTRACTS.md](CONTRACTS.md) owns the implemented and target interfaces; [AUTOPILOT_INTEGRATION.md](AUTOPILOT_INTEGRATION.md) owns the reconciliation work.

| What you manage today | Where it lives or how to inspect it |
|---|---|
| Shared plugins and versions | `packs/base/plugins/` and `.claude-plugin/marketplace.json`; add company plugins beside the base pack |
| Team marketplace settings | `templates/project-settings.json`; `project-settings --dir <project-folder>` previews the target's `.claude/settings.json` |
| Assistant instructions | `templates/harness.md`; `harness --dir <project-folder>` previews its managed block in `CLAUDE.md` and `AGENTS.md` |
| Setup health | `node scripts/skillgate.mjs doctor --dir <project-folder>`; inspect missing and unverified checks |
| Existing handoff display | `workflow` SessionStart hook; default project record is `docs/HANDOFF.md` |
| Skill evaluation evidence | `scripts/evidence.mjs` and `evidence/`; these measure selected skill behavior, not project compliance |
| Local project preparation and security prototype | `codex/autopilot-foundation-0916` at `23aae41`; integrate through the existing CLI rather than installing a second onboarding system |

Run the subcommands through `node scripts/skillgate.mjs` from the company fork. `harness` and `project-settings` preview by default; `--apply` writes with backups. `harness --undo --dir <project-folder>` removes the managed block, preserving surrounding text.

**The improvement loop:** lesson -> proposed change -> regression or behavior test -> company review and approved release -> rollout. Sessions propose improvements; they do not silently change company policy.

**Keep three records separate:** skill evaluation results, project security evidence, and release approval. A security mapping must name its framework version, scope, evidence, and gaps. Unassessed controls stay unassessed.

**Validation:** [CI](../.github/workflows/checks.yml) runs fixture and packaging checks. Live model evaluations are separate and incur usage. The private name scan needs your denylist; CI warns if unavailable. Native plugin updates do not migrate project documents or refresh instruction blocks. Those migrations and release verification remain planned.

**Optional status line:** `node scripts/setup.mjs` previews; `--apply` writes. It runs from the clone and keeps local quota readings. Its `--undo` restores the entire backed-up settings file, so reconcile any subsequent settings changes first. See [setup.mjs](../scripts/setup.mjs) before removal.

**Full acceptance rehearsal:** fresh company fork and contributor; normal work; interrupted-session recovery; stale security evidence; approved update preserving project history; defective change rejected by trusted merge checks; removal. Codex needs its own rehearsal. Current plugin tests do not satisfy this whole gate.
