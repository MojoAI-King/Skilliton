# Live check: one real session in the Claude Code VS Code extension on the owner's machine, 2026-09-21

Kind: Reference. One interactive session in the Claude Code extension for VS Code (binary 2.1.278, `$CLAUDE_CODE_EXECPATH --version` reads `2.1.278 (Claude Code)`), started from the editor in this repository on 2026-09-21, with the installed plugins (user and project scope, not `--plugin-dir`). The session is the build session itself, so every line below is what the assistant saw from inside it; where the owner's eyes were needed (a confirmation prompt) the line says not seen and why. This file answers items 2 to 6 of docs/areas/01-autopilot-loop/batch-01-install-and-live-use.md, the two live items of docs/areas/04-token-efficiency/batch-02-guard-and-gate-live.md, and the two items of docs/areas/03-any-environment/batch-01-vscode-column.md.

## The client

| Fact | Value | How it was read |
|---|---|---|
| Client | Claude Code VS Code extension | `$CLAUDE_CODE_EXECPATH` resolves to `~/.vscode/extensions/anthropic.claude-code-2.1.278-darwin-arm64/resources/native-binary/claude` |
| Version | 2.1.278 | `--version` |
| Plugins in the session | the versions the session started with: workflow 0.15.0, guardrails 0.5.1, context-hygiene 0.3.0 (updated to 0.15.5 and 0.5.2 during the session; a restart applies them) | `~/.claude/plugins/installed_plugins.json` and the update command's own output "Restart to apply changes" |
| Repository | this one, prepared, `main` | `git status` |

## The numbered items of batch 01-01, seen or not seen

1. **Session start shows the Project state block and the RESUME HERE note before the first prompt: seen.** Four hook outputs arrived at the start (and again after a resume), in this order. Pasted as received, trimmed only where marked:

```
[context-hygiene] SKILLITON_LESSONS not set or file missing; injecting nothing. (Reported, not silent.)
[workflow] Handoff from docs/HANDOFF.md:
## RESUME HERE

Written: 2026-09-21 07:26 EDT

- **State:** Wave 8 is shipped and the build phase is over: main at 7779d50 plus this maintain commit, report card 81 of 123, every remaining batch owner-gated. [...]
- **Next:** The owner pass, in the order docs/OWNER_WALKTHROUGH.md sets; [...]
- **Blocked:** Nothing on a session. [...]
- **Watch out:** Every checkpoint on main rewrites the indexes and, with --handoff, docs/HANDOFF.md; [...]
- **Git:** main @ 7779d50, 5 uncommitted
[guardrails] on: force-push to protected branches, --no-verify, and secret files are blocked.
[workflow] Project state (skilliton hook session-start):
- Branch: main @ 84ded53, 0 uncommitted
- Current task: none (no open task on branch main); to start one: skilliton task start "<title>" --apply
- Previous session: session b2d3e30a-bc86-4d33-8266-c593e1015906 (started 2026-09-21T19:42:07.359Z) ended normally; 1 corrupt journal line(s) ignored
- Shared handoff: docs/HANDOFF.md was written 2026-09-21 07:26 EDT; no later commit or uncommitted change (0 uncommitted path(s))
- Layout: layout 3 (current for this runtime)
- Pending migrations: none pending (layout 3, target 3)
- Versions: workflow runtime 0.8.0 installed; the project requires workflow 0.6.0 or later: met
- Records: all 9 present
- Security (needs attention): 15 control(s) in catalog skillgate-baseline-2, 15 applicable: 0 current, 15 missing, 0 stale, 0 expired, 0 invalid, 0 gap(s), 15 need a human, 15 undecided
```

   Two things in that block are findings rather than errors: the handoff shown was the one written that morning while the git line read `5 uncommitted` at the moment of the resume (the checkpoint's own record writes, committed minutes later), and `Versions: workflow runtime 0.8.0 installed` was true at session start and stale after the update.

2. **`git commit --no-verify` blocked by the guardrails hook: not run in this session.** The deny path was measured live on 2026-09-16 (evidence/live/2026-09-16-guardrails-force-push.md) and the hook was exercised in this session directly, outside the client, over 20 force-push spellings and the config-off case (the security walkthrough of 2026-09-21, recorded in the task record). Not counted as seen here.

3. **The guardrails confirmation prompt on a command that throws away uncommitted work (B5): not seen.** In this session the assistant ran under auto mode; an `ask` from the hook would have surfaced as a permission prompt to the owner, and the assistant did not run one on purpose, because the item asks for what the owner saw and typed. Still open.

4. **The eight skills visible under `/`: seen.** The session's skill list carried `workflow:dispatch`, `workflow:handoff`, `workflow:maintain`, `workflow:review`, `workflow:security`, `workflow:task`, `guardrails:guardrails` and `context-hygiene:context-hygiene` (and `code-quality:split-a-file` after the update).

5. **The read guard refuses a whole-file Read of a file over 50KB (B34): seen.** The assistant asked the client's Read tool for `scripts/release.test.mjs` whole. The client refused before reading, with this text:

```
PreToolUse:Read hook error: read-guard: <home>/Desktop/Skilliton/scripts/release.test.mjs is 66KB. Whole-file reads of non-image files over 50KB are refused (session cost rule). Read a range with offset and limit, grep or head it, or summarize it with a script that prints a bounded result.
```

   The assistant then read the parts it needed by range and by grep, which is the behaviour the rule exists for.

6. **The stop hook asks for a checkpoint when the session ends with changes and none recorded: seen.** Later the same evening (2026-09-22T02:02:33Z), the assistant finished a turn with the working tree changed and no checkpoint for twenty minutes, and the client showed this as the stop hook's feedback, pasted from the session transcript:

```
Skilliton checkpoint reminder: the working tree has changed since the last checkpoint (20 minutes ago). This reminder is given once for this working tree state; if this work should not be recorded, tell the user why and stop. Otherwise record where task 2026-09-21-build-complete-checkpoint-install-update-81ba stands (each value one line) by running: skilliton checkpoint --task 2026-09-21-build-complete-checkpoint-install-update-81ba --state "<what is done and what is not>" --evidence "<checks or tests you ran, with their results>" --next "<the next concrete step>" --apply
```

   The assistant recorded the checkpoint it asked for, and the next stop passed without the reminder, which is the once-per-tree-state rule working.

7. **Compaction under the project's window: not observed.** The session did not compact.

## Batch 04-02: the gate used for one real test run

`skilliton gate --cmd "node scripts/lint.test.mjs"` was run in the session on the clean tree at 02b6faa. Its whole output:

```
skilliton gate (gate): PASS: node scripts/lint.test.mjs exit 0 in 0.2s, from the --cmd option
  tree: 02b6faa on main, clean
  log: <home>/Desktop/Skilliton/.git/skilliton/gate/gate.log
```

The verdict came from the exit status, the tree it ran on is named, and the full output stayed in the log rather than in the conversation.

## Batch 03-01: hooks in the extension

The session start hooks (workflow handoff, workflow project state, guardrails status, context-hygiene checklist) fired in the extension as pasted above; the read guard fired on a Read (item 5), and the stop hook's ask arrived as hook feedback (item 6). The status line the batch names is the personal one, not a plugin's; it is not claimed here.

## Not claimed

Anything a headless run measured is not repeated here as live. The one open item (the confirmation prompt) needs one short owner session: make a scratch change, ask the assistant to run `git checkout -- .`, answer no.
