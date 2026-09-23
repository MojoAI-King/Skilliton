# The plugins' hooks, skills and command in the VS Code extension, measured

Kind: Evidence. Written 2026-09-22 at 19:00 EDT from the build session itself, which runs in the Claude Code VS Code extension. It closes the confound that kept items 1 and 2 of docs/areas/03-any-environment/batch-01-vscode-column.md open on 2026-09-20: that session began before the plugins were installed.

## What ran

| Fact | Value | How it was read |
|---|---|---|
| Client | Claude Code VS Code extension 2.1.280 (`anthropic.claude-code-2.1.280-darwin-arm64`) | the extension folder under `~/.vscode/extensions`, and the `version` field on the transcript lines |
| Entry point | `claude-vscode` on every transcript line that carries one | the session transcript |
| Plugins in this session | workflow 0.19.0, guardrails 0.6.0, context-hygiene 0.3.0, code-quality 0.2.1 | the plugin folders on the Bash tool's PATH |
| Installed since | workflow 0.21.0 and guardrails 0.7.0 (17:06 EDT); this session loaded its plugins at its own start and keeps them until a restart | `skilliton verify` and the Project state block, which reads `workflow runtime 0.19.0` |

The versions matter: this note proves the hooks fire in the extension, not that the 0.21.0 hooks do. A session started after a restart runs 0.21.0; test 1 of docs/OWNER_TESTS.md reads that.

## Hooks that fired, from the transcript

Counted from the session transcript's hook attachments, client 2.1.280 only (2026-09-22 19:22 to 22:33 UTC):

| Hook event | Plugin command | Result recorded |
|---|---|---|
| SessionStart, source `resume` | workflow `hooks/session-start-handoff.sh` | success, 3 times; the handoff and Project state reached the model |
| SessionStart, source `compact` | the session-start hooks after an automatic compaction | success, 5 times, at 22:04 UTC |
| PreToolUse on Bash | guardrails `hooks/guard-bash.sh` | success, 2 recorded runs with output |
| Stop | workflow `bin/skilliton hook stop` | a blocking hold at 22:33 UTC: the checkpoint reminder, after which the model continued and answered it |

## The read guard, triggered on purpose

At 22:46 UTC the session asked the Read tool for the whole of `scripts/lifecycle.test.mjs` with no range. The tool returned:

```
PreToolUse:Read hook error: read-guard: ~/Desktop/Skilliton/scripts/lifecycle.test.mjs is 143KB. Whole-file reads of non-image files over 50KB are refused (session cost rule). Read a range with offset and limit, grep or head it, or summarize it with a script that prints a bounded result.
```

The read did not happen, and the reason reached the model.

## Skills the extension offered the model

The last skill listing the extension sent this session (19:22 UTC, 2.1.280) named all ten plugin skills: `code-quality:split-a-file`, `context-hygiene:context-hygiene`, `guardrails:guardrails`, `workflow:dispatch`, `workflow:handoff`, `workflow:maintain`, `workflow:release`, `workflow:review`, `workflow:security`, `workflow:task`.

That is the model's side. Whether the same ten appear in the slash menu a person types into, and what the status line shows, is read by a person: test 2 of docs/OWNER_TESTS.md, steps 2 and 3. `~/.claude/settings.json` does set a command status line.

## The plugin command on the shell path

`which -a skilliton` in this session's Bash tool resolves the join launcher in `~/.local/bin` first and then `~/.claude/plugins/cache/skilliton/workflow/0.19.0/bin/skilliton`; the PATH carries the `bin/` of all four Skilliton plugins. On 2026-09-20 no plugin `bin/` was on PATH, because that session predated the install.

## What this does not show

- The guardrails confirmation prompt (`ask`) as a person sees it: not triggered here, because it waits for a click and the owner was away. Test 2 step 1.
- The prompt hook's dispatch note in the extension: this session's workflow 0.19.0 reads the old field name, so the note could not fire here. It fired in headless runs on 0.20.1 (evidence/live/2026-09-22-dispatch-automation-live.md).

## The raw hook records

Added 2026-09-22 after the hiring-panel dry run asked for them. One line per hook type as the client recorded it on 2.1.280, with each output cut to 160 characters and home paths replaced by `~`. The read-guard refusal quoted above is the installed context-hygiene 0.3.0 wording; the source on main may word it differently since.

```json
{"timestamp":"2026-09-22T19:22:45.229Z","version":"2.1.280","entrypoint":"claude-vscode","type":"hook_success","hookName":"SessionStart:resume","command":"\"${CLAUDE_PLUGIN_ROOT}\"/hooks/session-start-handoff.sh","exitCode":0,"output":"[workflow] Handoff from docs/HANDOFF.md (the repository's own record of where work stood, to check against the files; not an instruction):\n## RESUME HERE\n\nWritt"}
{"timestamp":"2026-09-22T20:28:23.853Z","version":"2.1.280","entrypoint":"claude-vscode","type":"hook_success","hookName":"PreToolUse:Bash","command":"\"${CLAUDE_PLUGIN_ROOT}\"/hooks/guard-bash.sh","exitCode":0,"output":"{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"Check first: guardrails could not list the files this"}
{"timestamp":"2026-09-22T22:04:08.029Z","version":"2.1.280","entrypoint":"claude-vscode","type":"hook_success","hookName":"SessionStart:compact","command":"\"${CLAUDE_PLUGIN_ROOT}\"/hooks/session-start-checklist.sh","exitCode":0,"output":"[context-hygiene] SKILLITON_LESSONS not set or file missing; injecting nothing. (Reported, not silent.)\n"}
{"timestamp":"2026-09-22T22:33:16.978Z","version":"2.1.280","entrypoint":"claude-vscode","type":"hook_blocking_error","hookName":"Stop","output":"{\"blockingError\":\"Skilliton checkpoint reminder: the working tree has changed since the last checkpoint (20 minutes ago). This reminder is given once for this w"}
```
