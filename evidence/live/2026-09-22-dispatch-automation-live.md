# Dispatch directed by the installed prompt hook, measured live, 2026-09-22

Kind: Reference (evidence). Measured between 15:31 and 16:04 EDT on the maintainer's machine, which has joined its company, with Claude Code 2.1.278 and the installed workflow plugin (0.19.0, then 0.20.0, then 0.20.1, updated at user and project scope before each run; every `claude -p` call starts a fresh process, so it loads the hooks installed at that moment).

## What ran

Each run used a fresh Git repository in a temporary folder with one commit. A first `claude -p "Reply with the single word: ready." --max-turns 2` prepared it through the session-start hook, and those files were committed. The second call then sent six numbered chores with no mention of dispatch:

```
claude -p "<one line of preamble, then six numbered chores>" --max-turns 40 --allowedTools "Skill,Read,Write,Edit,Bash,Glob,Grep"
```

## What was measured

1. **With 0.19.0, no dispatch event was recorded at all.** A temporary project hook in the fixture that saved its own UserPromptSubmit input showed the prompt arrives in a field named `prompt` (the other keys: `session_id`, `transcript_path`, `cwd`, `scratchpad_dir`, `prompt_id`, `permission_mode`, `hook_event_name`). The plugin hook read only `user_prompt`, the name the hooks reference gave on 2026-09-20. So the dispatch note had never fired in a real session. Fixed in 0.20.0, which reads `prompt`, then `user_prompt`.
2. **With 0.20.0, the event reached the installed plugin hook.** The journal holds `dispatch-suggested` five seconds after `session-start`. The assistant then did the six chores directly. When it tried to finish, the stop hook held it, and the journal holds `dispatch-reminded`. The assistant answered that the chores "weren't separate pieces of work" and wrote no lane plan. The machinery worked, but the escape clause in the wording was read too widely.
3. **With 0.20.1, the assistant ran dispatch from the note alone.** The wording now says small chores go through dispatch too, and that only a prompt that is not a list of work skips it. The journal holds `session-start`, `dispatch-suggested`, `checkpoint`, `session-end`, with no `dispatch-reminded` because `LANES.md` was written before the stop. `LANES.md` carries the base commit, an outcome of one lane in the main window, and a coverage ledger in which six items are parsed and six are in the lane. The assistant also made a task record and a checkpoint. Its reply says "the hook counted six items, so I ran `/workflow:dispatch`", and that the plan collapsed to one lane.

## Not measured here

The interactive VS Code extension, where the same event is expected but was not run in this measurement. A plan with more than one lane, whose worktrees `skilliton dispatch --apply` creates. That was measured on 2026-09-21 in `evidence/live/2026-09-21-dispatch.md`, from a dispatch a person started. Whether the assistant follows the note on every prompt: these are three runs, one per version.
