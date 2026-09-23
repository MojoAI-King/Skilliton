# A real Codex session in a prepared repository

Kind: Evidence. Run 2026-09-22 at 21:12 EDT on the owner's Mac. It answers area 01 batch 05 item 1: one real Codex session in a prepared repository, and which lifecycle hooks fired.

## What ran

| Fact | Value |
|---|---|
| Client | Codex CLI 0.156.0 (`@openai/codex`, installed into a scratch folder for this run), signed in with the owner's ChatGPT login |
| Features | `codex features list`: `hooks` stable and on; `plugin_hooks` removed and off; `plugins` stable and on |
| Skilliton in Codex | the workflow plugin 0.21.0 installed in this machine's Codex home (`~/.codex/plugins/cache/skilliton/workflow/0.21.0/`) |
| Repository | a new scratch repository, prepared with `skilliton prepare --apply` and committed |
| Command | `codex exec --json -s read-only "<three questions>" < /dev/null` (stdin closed: without it, `codex exec` waits for more input) |

The prompt asked three things and nothing about hooks: quote the first heading of the Skilliton block in AGENTS.md, do what that block says to do at the start of a session, and list the skills whose names start with `workflow`.

## What happened

1. **The instruction file reached the model.** It quoted `## How we work here (Skilliton)` from AGENTS.md.
2. **The start-of-session steps ran, because the block asks for them, not because a hook ran.** Codex read the handoff, ran `git status`, found `skilliton` on the PATH, and ran `skilliton status` (exit 1: all 15 security controls lack evidence, the correct answer for a new repository). Its summary said the branch was clean, with no pending migration and no open task.
3. **The plugin skills reached the model.** It listed `workflow:dispatch`, `workflow:handoff`, `workflow:maintain`, `workflow:release`, `workflow:review`, `workflow:security`, `workflow:task`.

## Which hooks fired

**None of Skilliton's.** The session record (`~/.codex/sessions/.../rollout-2026-09-22T21-12-48-<thread>.jsonl`) holds no hook output: the words "Project state" and "RESUME HERE" appear only inside the AGENTS.md text Codex was given and in the output of the `skilliton status` command the model ran itself. The machine's own user-level SessionStart hook in `~/.codex/hooks.json` did not inject its text either, consistent with Codex asking a person to trust each hook before it runs.

Codex did read the plugin's hook file: its event stream carried the warning `clamping SessionEnd hook timeout to 3s in ~/.codex/plugins/cache/skilliton/workflow/0.21.0/hooks/hooks.json`. So 0.156.0 parses a plugin's `hooks/hooks.json` while reporting `plugin_hooks` as removed. Whether a trusted plugin hook would then run is **not verified**; nothing in this session ran one.

## What this settles

- In Codex, Skilliton works through its **instructed** path: the managed block in AGENTS.md, the skills and the `skilliton` command. Every "enforced" line of the block is instructed there, as the block itself says and the 2026-09-20 decision recorded.
- The guardrails do not guard a Codex session unless a team configures and trusts its own Codex hook.
