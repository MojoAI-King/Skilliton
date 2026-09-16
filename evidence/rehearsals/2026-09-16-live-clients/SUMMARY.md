# Live client lifecycle rehearsal (M2)

Kind: Reference. Recorded 2026-09-16 by `scripts/rehearsals/live-clients.mjs`. Disposable folders, synthetic projects and throwaway keys only.

- **Claude Code:** 2.1.273 (Claude Code)
- **Codex:** codex-cli 0.154.0-alpha.6.2
- **Node:** v25.8.1

| Step | Result | Evidence |
|---|---|---|
| L1 Claude Code: the handoff and the Project state reach the model at session start | PASS | session exit 0; SessionStart hook responses 3, one with the Project state: true; model quoted the nonce: true, the task: true; journal session-start: true |
| L2 Claude Code: after a change, the Stop hook blocks once and the assistant records a checkpoint | PASS | session exit 0; Stop blocks 1; assistant ran skillgate checkpoint: true; task record checkpoints 0 before, 1 after; journal checkpoint event: true; stop-reminded events 1 |
| L3 Claude Code: guardrails asks before discarding uncommitted work; with nobody to answer it is denied; without guardrails the work is lost | PASS | with guardrails: exit 0, permission_denied true, change survived true; control without guardrails: exit 0, change survived false |
| L4 Claude Code: a session killed mid-task is reported as interrupted to the next session | PASS | first session killed: true (draft written: true); journal starts 1, ends 0; next session exit 0, said it was interrupted: true |
| X1 Codex: a project SessionStart hook's Project state reaches the model | FAIL | codex exec exit 0; journal session-start written by the hook: false; model named the task: false |
| X2 Codex: guardrails refuses a command that discards uncommitted work (ask becomes deny); without the hook the work is lost | FAIL | with the guardrails hook: exit 0, change survived true; control without it: exit 0, change survived true |

## Notes

- Claude Code plugins were loaded with --plugin-dir for each session; marketplace installation is shown by the company release rehearsal. The interactive confirmation a person would see for an ask decision was not observed (headless sessions have no one to answer).
- Codex hooks ran as project hooks trusted for each run; plugin-bundled hooks under Codex and the /hooks trust review a person performs were not exercised.

Result: 4 of 6 steps passed; the rest are listed above with why.

## Diagnosis of X1 and X2 (added after the run by the integrating session)

- **X1:** the project hook never ran. No journal was created, and the same happened in two more `codex exec` runs, one of them with a `.codex/config.toml` present. A `developer_instructions` marker placed in the project's `.codex/config.toml` did not reach `codex debug prompt-input` either, with or without a `-c projects."<path>".trust_level="trusted"` override (tried with and without `/private`). So in this setup the project `.codex/` layer did not load. Whether an interactive trust decision would load it is unverified.
- **Plugin hooks:** `codex features list` on 0.154.0-alpha.6.2 reports `hooks` as stable and enabled, and `plugin_hooks` as "removed". Hooks shipped inside a Codex plugin therefore cannot be relied on.
- **X2 is inconclusive, not a guardrails result:** the control run without any hook also left the change in place, so the command never took effect in either run. The run output was not kept. The likely causes (the `workspace-write` sandbox or the model declining the command) are unverified.
- **What would settle it without touching anyone's main Codex configuration:** log in once inside an isolated Codex home (`CODEX_HOME=<folder> codex login`), then run this rehearsal with `--codex-home <folder>`. The hooks then live in that home's `hooks.json` (the user layer, which loads without project trust). Codex lifecycle hooks stay unverified until then.
