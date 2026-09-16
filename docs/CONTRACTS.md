# Contracts

Kind: Living. The names, paths, and formats that more than one component depends on. Change one here first, then change every reader in the same commit. A fork that renames anything here renames it everywhere.

## Packs and plugins

| Pack | Plugin | Ships | Invocation |
|---|---|---|---|
| `base` | `context-hygiene` | skill `context-hygiene`; SessionStart hook `session-start-checklist.sh`; status line `statusline-quota.sh` (applied by `scripts/setup.mjs`) | model-invoked |
| `base` | `workflow` | skills `dispatch`, `maintain`, `handoff`, `review`; SessionStart hook `session-start-handoff.sh` | `/workflow:dispatch`, `/workflow:maintain`, `/workflow:handoff`, `/workflow:review`, or model-invoked from the description |
| `base` | `guardrails` | PreToolUse hook `guard-bash.sh` on the Bash tool; SessionStart hook `session-start-guardrails.sh` (one status line: on, off, or a problem); skill `guardrails` explaining what is blocked and why | hook runs on every Bash call; skill model-invoked |
| `<company>` (in a fork) | anything | the company's own skills | `/<plugin>:<skill>` |

Rules:
- Base plugins live under `packs/base/plugins/`. **A fork treats `packs/base/` as read-only** and adds its own packs beside it (`packs/<company>/plugins/<plugin>/`). That is what keeps pulling upstream improvements into a fork free of merge conflicts.
- Plugin skills are namespaced by Claude Code (`/plugin:skill`), so a company skill and a personal skill in `~/.claude/skills/` never collide.
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
- The block labels every behavior as **enforced** (a hook does it every time) or **instructed** (the model is told to, and usually will). Nothing instructed is described as guaranteed.
- `CLAUDE.md` is read by Claude Code; `AGENTS.md` by Codex. Both get the same block.

## Team settings: `templates/project-settings.json`

The file a company commits as `.claude/settings.json` in its product repos, so anyone who opens and trusts the repo in Claude Code gets the company marketplace added, with auto-update on, and the base plugins enabled. Keys (from the official settings docs, not yet exercised on a clean machine): `extraKnownMarketplaces.<name>.source`, `extraKnownMarketplaces.<name>.autoUpdate`, `enabledPlugins["<plugin>@<marketplace>"]`.

## CLI: `scripts/skillgate.mjs`

| Command | Does | Writes |
|---|---|---|
| `doctor` | reports what is installed, enabled, and at which version; whether auto-update is on; whether the harness block is present and current; whether `.skillgate/config.json` parses | nothing |
| `harness [--apply] [--undo] [--file CLAUDE.md\|AGENTS.md] [--dir <project>] [--template <file>]` | shows, applies, or removes the harness block | the named file, after a backup |
| `project-settings [--apply] [--dir <project>] [--marketplace-repo owner/repo] [--marketplace-name <name>] [--template <file>]` | shows or writes `.claude/settings.json` from the template, merging with an existing file | `.claude/settings.json`, after a backup |
| `new-skill <plugin> <skill> [--pack <pack>] [--repo <dir>] [--description <text>]` | scaffolds `packs/<pack>/plugins/<plugin>/skills/<skill>/SKILL.md` with frontmatter and bumps the plugin version | the new skill, `plugin.json` |
| `import <skill-dir> --into <plugin> [--pack <pack>] [--repo <dir>] [--name <skill>]` | scans the source (scrub check, secret shapes, home paths; refuses when no denylist is configured), then copies it into a company plugin | the copied skill, `plugin.json` |

Every writing command shows its change first, writes only with `--apply` (or its own explicit verb), backs up what it overwrites, and exits non-zero with a plain-English reason when it refuses.
