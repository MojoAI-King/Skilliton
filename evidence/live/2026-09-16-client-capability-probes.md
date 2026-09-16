# Client capability probes

Kind: Reference. Recorded 2026-09-16 by the integrating session. Reproduce with the scripts named below; results are tied to the client versions shown.

## Claude Code: `scripts/live-capability-probe.sh`

Client: Claude Code 2.1.273 (the build bundled with the VS Code extension). One headless session (`claude -p`), with a disposable probe plugin loaded through `--plugin-dir`, settings limited to the project (`--setting-sources project`), `--permission-prompts none`, `--include-hook-events`. Costs one short session of real usage.

| Check | Result | What was observed |
|---|---|---|
| C1 SessionStart output reaches the model | PASS | The model quoted a random nonce that only the hook printed |
| C2 plugin `bin/` on the Bash tool PATH | PASS | A probe executable ran by bare name inside the session |
| C3 PreToolUse `ask` with nobody to answer | PASS | A `permission_denied` event; the command did not run; the model was told it was denied |
| C4 Stop hook `block` continues once | PASS | The first Stop input had `stop_hook_active: false`; the model continued as instructed; the second Stop input had `stop_hook_active: true` |
| C5 SKILL.md path variables | PASS | `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` arrived as absolute paths; the skill body was also prefixed with "Base directory for this skill" |
| C6 hook events in stream-json | PASS | `hook_started` and `hook_response` events for SessionStart, PreToolUse and Stop |

Also observed: the SessionStart input carries `source: startup`; the Stop input carries `stop_hook_active`, `last_assistant_message`, `permission_mode`; a Stop block is surfaced to the user interface as a "Stop hook error occurred" notification even though the block worked; SessionEnd input carried `reason: other` in headless mode.

Not proved by this probe: an interactive session (the confirmation prompt a person sees for `ask`), a plugin installed from a marketplace rather than `--plugin-dir`, a clean configuration directory (a fresh `CLAUDE_CONFIG_DIR` reports `loggedIn: false`, measured with `claude auth status`), and any other client version.

## Codex: `scripts/codex-offline-probe.sh`

Client: Codex CLI 0.154.0-alpha.6.2 (bundled with the ChatGPT VS Code extension). Temporary `HOME` and `CODEX_HOME`; no model call (`codex debug prompt-input` renders the model-visible prompt locally); no login used or changed.

| Check | Result | What was observed |
|---|---|---|
| X1 repository accepted as a marketplace | PASS | `codex plugin marketplace add <skills repo>` named it `skillgate`, reading `.claude-plugin/marketplace.json` |
| X2 workflow plugin installs at its manifest version | PASS | Installed to `$CODEX_HOME/plugins/cache/skillgate/workflow/0.2.4/` and enabled in that home's `config.toml` |
| X3 installed copy equals the committed plugin files | FAIL, then PASS | First run: 5 extra files, raw `claude plugin eval` results that are git-ignored inside the plugin folder. A local-path install copies ignored files. After moving those raw results out of the repository, 46 of 46 committed files and nothing else |
| X4 plugin skills in the model-visible prompt | PASS | `workflow:dispatch`, `workflow:handoff`, `workflow:maintain`, `workflow:review`, each with its SKILL.md path |
| X5 AGENTS.md in the model-visible prompt | PASS | A nonce written to a project's AGENTS.md appeared in the rendered prompt |

Not proved by this probe: whether Codex runs the plugin's hooks (each hook must first be trusted, or a run must pass `--dangerously-bypass-hook-trust`), whether the model follows the instructions, the IDE extension (Codex documents that it does not support plugins), and installs from a Git marketplace.

## Consequences recorded for the build

- The lifecycle design may rely, on Claude Code 2.1.273, on SessionStart context, Stop continuation with `stop_hook_active`, the `bin/skillgate` launcher on PATH, and plugin-root substitution in skills (DECISIONS.md, client capabilities).
- Release verification must compare installed files with the committed, approved file list and report extra files, because a local-path install carries ignored files.
- Codex guardrails cannot rely on `ask` (documented as not supported yet: the tool call continues), so the Codex adapter must deny instead of asking. Unverified until a Codex session runs the hook.
