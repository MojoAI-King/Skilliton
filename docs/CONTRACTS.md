# Contracts

Kind: Living. PLAN.md is the product authority. The first sections describe the current implementation; the final section records target integration contracts that are not implemented yet. Change a shared format here, then update every reader and its checks together before enabling it.

## Packs and plugins

| Pack | Plugin | Ships | Invocation |
|---|---|---|---|
| `base` | `context-hygiene` | skill `context-hygiene`; SessionStart hook `session-start-checklist.sh`; status line `statusline-quota.sh` (applied by `scripts/setup.mjs`) | model-invoked |
| `base` | `workflow` | skills `dispatch`, `maintain`, `handoff`, `review`; SessionStart hook `session-start-handoff.sh` | `/workflow:dispatch`, `/workflow:maintain`, `/workflow:handoff`, `/workflow:review`, or model-invoked from the description |
| `base` | `guardrails` | PreToolUse hook `guard-bash.sh` on the Bash tool; SessionStart hook `session-start-guardrails.sh` (one status line: on, off, or a problem); skill `guardrails` explaining what is blocked and why | hook runs on every Bash call; skill model-invoked |
| `<company>` (in a fork) | anything | the company's own skills | `/<plugin>:<skill>` |

Rules:
- Base plugins live under `packs/base/plugins/`. **A fork treats `packs/base/` as read-only** and adds its own packs beside it (`packs/<company>/plugins/<plugin>/`). That reduces conflicts when reviewing upstream proposals; it does not remove the need for company review.
- Plugin skills are namespaced by Claude Code (`/plugin:skill`), which separates plugin invocation names from personal skill names. Verify discovery and invocation on each supported client.
- Every plugin skill's `SKILL.md` frontmatter carries `name` (required for plugin skills) and `description`.
- Every plugin's `plugin.json` carries `version`. Installed copies only receive an update when that version changes, so **every change to a plugin bumps its version**.

## Project config: `.skillgate/config.json`

One file at the repo root, one section per component. Every key is optional; defaults below.

```json
{
  "handoff":   { "file": "docs/HANDOFF.md", "maxBytes": 6000 },
  "maintain":  { "teamLessonsFile": null },
  "dispatch":  { "laneRoot": "../<repo-name>-lanes", "hotspots": [], "mainOnlyPaths": ["docs/", "DECISIONS.md"], "laneSetup": [], "laneTestCommand": null, "mainOnlyChecks": [], "maxItemsPerLane": 8, "minItemsForLanes": 6 },
  "guardrails": { "protectedBranches": ["main", "master"], "blockForcePush": true, "blockNoVerify": true, "blockSecretFiles": true }
}
```

Environment overrides: `SKILLGATE_TEAM_LESSONS` (maintain), `SKILLGATE_GUARDRAILS=off` (turns the guardrails hook into a visible no-op for one session; it prints that it is off).

## Handoff file: `docs/HANDOFF.md`

- Starts with `# Handoff`, then `Kind: Living.`, then a section headed exactly `## RESUME HERE`.
- `RESUME HERE` starts with a `Written: <date and time>` line, then four labelled items: **State**, **Next**, **Blocked**, **Watch out**.
- Older blocks go under `## Earlier` as `### <Written date>` (newest first, at most five), older still to `docs/HANDOFF_ARCHIVE.md` (`Kind: Reference.`).
- Writers: `/workflow:handoff` (quick, end of a stretch of work) and `/workflow:maintain` (full reconciliation). Reader: `session-start-handoff.sh`, which prints the `RESUME HERE` section only, bounded by `handoff.maxBytes`, and prints a one-line notice when the file or section is missing.

## Harness block in `CLAUDE.md` and `AGENTS.md`

The instructions that tell the model when to use which skill. Managed by `scripts/skillgate.mjs harness`, rendered from `templates/harness.md`.

```
<!-- skillgate:harness:start v1 -->
... rendered template ...
<!-- skillgate:harness:end -->
```

- Exactly one block per file. Applying replaces the text between the markers and never touches anything outside them.
- The block labels every behavior as **enforced** (the installed, enabled hook handles its supported client event) or **instructed** (the model is asked to do it). Showing an existing handoff does not ensure one was written. Nothing instructed is described as guaranteed.
- `CLAUDE.md` and `AGENTS.md` receive the same block. Hook execution and skill invocation still need client-specific adapters and proof; matching Markdown does not establish Codex parity.
- Template changes reach a project when `harness --apply` runs. No current automatic project migration runs when a plugin updates.

## Team settings: `templates/project-settings.json`

The file a company commits as `.claude/settings.json` in its product repos, to declare the company marketplace, automatic plugin updates, and enabled base plugins for Claude Code. The actual fresh-user trust/install flow remains to be rehearsed. Keys (from the official settings docs, not yet exercised on a clean machine): `extraKnownMarketplaces.<name>.source`, `extraKnownMarketplaces.<name>.autoUpdate`, `enabledPlugins["<plugin>@<marketplace>"]`.

## CLI: `scripts/skillgate.mjs`

| Command | Does | Writes |
|---|---|---|
| `doctor [--dir <project>]` | inspects installation/configuration records, declared auto-update, managed instructions and project config; it does not prove a hook executed | no project files |
| `harness [--apply] [--undo] [--file CLAUDE.md\|AGENTS.md] [--dir <project>] [--template <file>]` | shows, applies, or removes the harness block | the named file, after a backup |
| `project-settings [--apply] [--dir <project>] [--marketplace-repo owner/repo] [--marketplace-name <name>] [--template <file>]` | shows or writes `.claude/settings.json` from the template, merging with an existing file | `.claude/settings.json`, after a backup |
| `new-skill <plugin> <skill> [--pack <pack>] [--repo <dir>] [--description <text>]` | scaffolds `packs/<pack>/plugins/<plugin>/skills/<skill>/SKILL.md` with frontmatter and bumps the plugin version | the new skill, `plugin.json` |
| `import <skill-dir> --into <plugin> [--pack <pack>] [--repo <dir>] [--name <skill>]` | scans the source (scrub check, secret shapes, home paths; refuses when no denylist is configured), then copies it into a company plugin | the copied skill, `plugin.json` |

Every writing command shows its change first, writes only with `--apply` (or its own explicit verb), backs up what it overwrites, and exits non-zero with a plain-English reason when it refuses.


Current CLI exit contract: `0` completed, `1` required doctor checks unresolved, `2` refused/invalid invocation, `3` internal error. The prototype security runtime has different exits; do not forward them as if they already matched this CLI.

## Target integration contracts (M1-M4, not yet implemented)

These decisions align the two workstreams. They are implementation requirements, not a claim that current commands accept new fields or provide the described automation.

| Boundary | Agreed target | Current integration needed |
|---|---|---|
| Entry point | Extend `scripts/skillgate.mjs`; one onboarding workflow composes environment join and repository preparation | Prepare/security/release commands are not available in the current CLI |
| Instruction ownership | `harness` is the sole writer/renderer of one managed block in each client instruction file | Make Prepare use it; reconcile prototype `skillgate:project` blocks without touching human text |
| Artifact paths | One validated project artifact map, adopted before scaffolding; existing `handoff.file` remains compatible and disagreement is refused | Prototype `prepare.artifacts`/`prepare.version` are not recognized by current doctor; update config readers, Maintain and tests together |
| Preparation | Explicit repository root; preview by default; authorized apply; repeat setup preserves records; versioned recovery/migration | Adapt prototype rather than adding a second instruction writer |
| Runtime | Executable helpers belong to the approved versioned distribution; project observations/configuration stay in the repo | Migrate copied `.skillgate/bin/security-evidence.mjs`; adapters must identify actual package version |
| Project versions | Report installed package, required project version and applied migration state separately | Doctor currently cannot make this assessment |
| Operation result | Human summary plus structured `complete`, `attention`, `invalid` or `operation-failed`; retain main CLI refusal/internal-error meanings | Classify engine results before mapping to CLI; a missing observation is attention, not a rejected command or security failure |
| Parallel records | Worker-owned unique task checkpoints and proposed decision/lesson files; integrator-owned shared status/backlog/indexes | Dispatch currently reserves all docs; narrow this with explicit write sets and keep the existing rule until implemented |
| Durable handoff | Committed task state supports recovery from another machine; shared RESUME HERE summarizes integration | Ignored LANES.md and uncommitted LANE_REPORT.md remain local execution aids, not the only durable record |
| Evidence types | Skill evaluation evidence and project security observations have separate schemas, storage and meanings | Preserve `evidence/<commit>/` for evaluations and `.skillgate/security/` for project records |
| Review authority | Declared contributors/reviewers are labels; existing repository review mechanisms provide authenticated approval | Do not infer identities from code history or call a handwritten reviewer field authenticated |
| Lifecycle | Checkpoint and status refresh through verified client events or explicit tested orchestration; surface missing capabilities | No universal event/hook parity is assumed; single-task tracking does not wait for Dispatch's six-item threshold |

Prepare's selected base records are status, backlog/archive, roadmap, decisions, lessons, handoff/archive and maintenance instructions, plus individual task/decision/lesson records. Maintain reconciles them in their own format. Its current empty-repo fallback is superseded only when the integrated Prepare workflow actually exists; until then, the current skill does not provision the full set.

Target public assessment commands should use exit `1` for an evaluated attention state, `2` for refused/invalid requests or data, and `3` for operational/internal failure. Success at recording an unresolved assessment can still be exit `0`: the recording operation succeeded, not the control. Final field names and adapters must be frozen with implementation tests before clients consume machine output. Neither a zero exit nor current observation freshness is a compliance verdict.

## Improvement and update authority

Upstream proposal -> company review and tested release -> installed package update -> separate versioned project reconciliation. Application changes continue through normal application review and delivery. Plugin updates do not silently alter historical decisions, completed work, human edits or the application's code.

A lesson can propose a changed skill, check or template. It needs a reproducible scenario and review before becoming a released company default. Company extensions remain beside the base; upstream changes are reviewed rather than automatically granted company authority. A downstream repository owns its actual records and approved applicability choices.

The release schema remains a draft in `releases/SCHEMA.md`. Changes to validation policy need review by the authority configured for that repository; the proposed change cannot certify its own weakening of checks. These policies require working hosted checks, not just this document.
