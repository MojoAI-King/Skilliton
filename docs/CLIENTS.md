# Supported clients: what each one actually does

Kind: Living. Each row says how it is known: **measured** (a command or session run here, with the evidence file), **documented** (the client's official documentation or published source, not yet run here), or **unverified**. Versions matter: a row holds for the version named until it is measured again. Updated 2026-09-16.

| Behavior Skillgate relies on | Claude Code 2.1.273 | Codex CLI 0.154.0-alpha.6.2 |
|---|---|---|
| Install plugins from this repository's marketplace | documented; M3 rehearsal pending | **measured**: local-path marketplace add and `plugin add` work in an isolated home (probe X1, X2) |
| Installed copy contents | unverified | **measured**: a local-path install copies the whole plugin folder, including git-ignored files (probe X3) |
| Plugin skills visible to the model | **measured** with `--plugin-dir` (probe C5 skill listed as `sgprobe:probe-paths`) | **measured**: `workflow:<skill>` with its SKILL.md path (probe X4) |
| Instruction file read | `CLAUDE.md` | **measured**: `AGENTS.md` (probe X5); `CLAUDE.md` is not read unless configured as a fallback name (documented) |
| SessionStart hook output reaches the model | **measured** headless (probe C1); interactive unverified | documented (plain stdout becomes developer context); unverified here |
| Plugin `bin/` on the shell PATH | **measured** (probe C2) | not documented; skills are told their SKILL.md path and resolve relative paths from it (documented) |
| PreToolUse `ask` | **measured**: with no one to answer, denied and not run (probe C3); the interactive prompt is unverified | documented as parsed but not supported yet: the tool call continues. Guardrails must deny instead |
| PreToolUse `deny` | **measured** live (`evidence/live/2026-09-16-guardrails-force-push.md`) | documented, same JSON shape; unverified here |
| Stop `block` makes the model continue; `stop_hook_active` | **measured** (probe C4) | documented, same shape; unverified here |
| Skill path variables `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_SKILL_DIR}` | **measured** (probe C5) | none documented; the model is given the SKILL.md path |
| Hooks need approval before they run | plugin hooks run when the plugin is enabled (measured with `--plugin-dir`; marketplace install unverified) | documented: every non-managed hook must be trusted by its hash (`/hooks`), or a run passes `--dangerously-bypass-hook-trust` |
| Plugins in the IDE extension | this build session runs in the VS Code extension; plugin behavior there is unverified | documented: the IDE extension does not support plugins |
| Separate clean configuration on one machine | **measured**: a fresh `CLAUDE_CONFIG_DIR` starts logged out (`claude auth status`) | documented: `CODEX_HOME` isolates config, plugins, hook trust and login; **measured**: plugin install and prompt rendering work in a fresh one |
| Observe hooks without a person | **measured**: `--output-format stream-json --verbose --include-hook-events` | `codex exec --json`; hooks under exec need trust or the bypass flag (documented) |

Evidence: `evidence/live/2026-09-16-client-capability-probes.md`. Reproduce: `bash scripts/live-capability-probe.sh` (one short paid Claude Code session) and `bash scripts/codex-offline-probe.sh` (no model call).

## What this means for a team

- **Claude Code** is the client whose lifecycle hooks Skillgate currently proves: the session-start project state, the stop reminder to record a checkpoint, and the guardrails block.
- **Codex CLI** receives the same skills and instructions, and its hooks use the same shapes, but every hook needs a person to trust it once, and the guardrails confirmation becomes a refusal. Treat Codex lifecycle behavior as unverified until the Codex rehearsal records it.
- **Codex in the IDE** gets `AGENTS.md` and repository skills (`.agents/skills`) but no plugins, so no hooks and no `skillgate` launcher from a plugin.
