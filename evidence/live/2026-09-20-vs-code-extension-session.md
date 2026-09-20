# Live check: what the Claude Code VS Code extension did in one real session

Kind: Reference. One interactive session in the Claude Code extension for VS Code, on 2026-09-20, in this repository. The session is the build session itself, so every line below is observed from inside it rather than staged. Home paths are written as `<home>`.

## The client

| Fact | Value | How it was read |
|---|---|---|
| Extension | `anthropic.claude-code-2.1.276-darwin-arm64` | the folder of `CLAUDE_CODE_EXECPATH` |
| Binary the extension runs | `2.1.276 (Claude Code)` | `"$CLAUDE_CODE_EXECPATH" --version` |
| Binary on the Bash tool's PATH | `2.1.92 (Claude Code)` | `claude --version` |
| Entrypoint | `claude-vscode` | `CLAUDE_CODE_ENTRYPOINT` |
| Session start | 2026-09-16T15:17:44Z | the first record of the session transcript |
| Skilliton plugins installed | 2026-09-19T02:24Z, scope `user`, marketplace commit `f8a935c9b546` | `<home>/.claude/plugins/installed_plugins.json` |

**The confound, stated first.** The three Skilliton plugins were installed about 59 hours after this session began. Claude Code documents that a plugin installed from the command line loads at the next session start or after `/reload-plugins`, and that changes made in the extension's own plugin dialog apply immediately to open sessions in that window. Neither happened here. So every "did not fire" below is measured for a session that predates the install, and is not evidence that the extension fails to run plugin hooks. The settling test is one new extension session in this repository, started after 2026-09-19T02:24Z, repeating the same four checks.

## What was measured

**1. A PreToolUse hook on the Read tool fires in the extension, and its deny reaches the model.** A 66KB file was read whole. The user-level read guard denied it, the refusal reached the model with its reason, and the guard wrote one line:

```
{"t":"2026-09-20T04:14:29.947Z","session":"dcd1732a-...","cwd":"<home>/Desktop/Skilliton",
 "file":".../scratchpad/probe-60kb.txt","kb":66}
```

The hook that fired is this machine's user-level hook, not the one inside the context-hygiene plugin. The plugin's own log (`<home>/.claude/skilliton/read-guard.log`) holds only a line written by running the hook script directly, with session `probe`, and no line from the session. So: **PreToolUse on Read works in the extension** (measured); **the plugin's copy of it did not run** (measured, with the install-time confound above).

**2. SessionStart fires in the extension, with source `compact`.** An automatic compaction during this session ran the SessionStart hooks and their output reached the model. What arrived was one block, the machine's user-level lessons hook. The workflow plugin's "Project state" block was not in it, with the same confound.

**3. `skilliton` is found in the extension's Bash tool, from the join launcher only.**

```
$ which -a skilliton
<home>/.local/bin/skilliton
<home>/.local/bin/skilliton
<home>/.local/bin/skilliton
```

Three identical lines because `<home>/.local/bin` appears three times in `PATH`. No Skilliton plugin `bin/` is on the path, while two other marketplaces' plugin `bin/` folders are (`cloudflare` at position 23, `stripe` at 24), which is the same pattern measured on the command line in `2026-09-19-which-skilliton-in-a-session.md` and fits the install-time cause.

**The gap that is filed, not closed:** this is the extension's **Bash tool**, which is the shell the assistant runs commands in. Whether the editor's integrated terminal panel resolves the same PATH was not measured, because it needs a person to type in it. Area 03 batch 01 item 3 is ticked on the Bash tool and the terminal panel stays with the owner pass.

**4. The status line was not proved.** A status line command is configured on this machine and writes `<home>/.claude/usage-log.jsonl`. That file holds no entry from this session, so nothing here shows the status line rendering in the extension. Unverified.

## 5. The project's compaction window did not produce the window it names

This repository's `.claude/settings.json` sets `autoCompactWindow` to 600000 (committed 2026-09-19T02:54Z, during this session). The session's own transcript records every automatic compaction, and none of them is near 600000. Unique automatic boundaries, by the tokens present before each one:

| When (UTC) | Tokens before the compaction |
|---|---|
| 2026-09-16T21:01 | 967545 |
| 2026-09-17T22:59 | 970968 |
| 2026-09-18T20:16 | 393975 |
| 2026-09-18T21:54 | 167026 |
| 2026-09-19T02:05 to 2026-09-20T04:30, 14 more | 164741 to 179051 |

The session ran on a model with a 1M context, and up to 2026-09-17 it compacted just short of 1M, which fits the behavior measured in live rehearsal L6: the client compacts short of its window rather than at it. From 2026-09-18T21:54 onward it compacts at about a sixth of that, steadily, and it kept doing so after the 600000 setting was committed.

**What is measured:** no automatic compaction in this session happened near 600000, before or after the setting was committed. **What is not known:** why the threshold moved on 2026-09-18, and whether a project's `autoCompactWindow` is read at all by the extension or by this model. The session began on 2026-09-16, before the setting existed, so a value read once at session start would explain the setting having no effect, but not the change partway through.

**The test that settles it:** start a new extension session in this repository after the setting was committed, let it reach its first automatic compaction, and read `preTokens` from the `compact_boundary` record in its transcript. About 460000 means the 600000 window is honored the way L6 predicts. About 170000 means it is not, and the template's number is a claim the client does not implement.

Until then, no statement in this repository may treat 600000 as a measured window. Area 04 batch 01 item 5 stays open and now names this test.

## What this settles and what it does not

Settled: hooks do fire in the VS Code extension (PreToolUse on Read, SessionStart on compact), the deny reaches the model, and a command on the user's PATH is found by the Bash tool.

Not settled, all with the same next test (one new extension session started after the install): whether a plugin's hooks fire, whether the workflow plugin's session-start block appears, whether the plugin skills are offered, and whether the plugin `bin/` reaches the Bash tool's PATH. Not measured at all: the integrated terminal panel, and the status line.
