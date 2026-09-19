# Live client lifecycle rehearsal (M2)

Kind: Reference. Recorded 2026-09-19 by `scripts/rehearsals/live-clients.mjs`. Disposable folders, synthetic projects and throwaway keys only.

- **Claude Code:** 2.1.276 (Claude Code)
- **Codex:** not found
- **Node:** v25.8.1

| Step | Result | Evidence |
|---|---|---|
| L1 Claude Code: the handoff and the Project state reach the model at session start | PASS | session exit 0; SessionStart hook responses 3, one with the Project state: true; model quoted the nonce: true, the task: true; journal session-start: true |
| L2 Claude Code: after a change, the Stop hook blocks once and the assistant records a checkpoint | PASS | session exit 0; Stop blocks 1; assistant ran skilliton checkpoint: true; task record checkpoints 0 before, 1 after; journal checkpoint event: true; stop-reminded events 1 |
| L3 Claude Code: guardrails asks before discarding uncommitted work; with nobody to answer it is denied; without guardrails the work is lost | PASS | with guardrails: exit 0, permission_denied true, change survived true; control without guardrails: exit 0, change survived false |
| L4 Claude Code: a session killed mid-task is reported as interrupted to the next session | PASS | first session killed: true (draft written: true); journal starts 1, ends 0; next session exit 0, said it was interrupted: true |
| L5 Claude Code: the context-hygiene read guard refuses a whole-file Read of a 60KB file with the reason and logs it once; a ranged read of the same file goes through | PASS | whole read: exit 0, the model attempted a whole Read: true (Read inputs seen: [{"offset":null,"limit":null}]), PreToolUse hook_response carrying the refusal: true, the refusal reached the model as a tool result or a permission_denied event: true, read-guard log lines for the file: 1 (kb 60); ranged read: exit 0, log lines still 1, nonce on line 5 quoted: true |
| L6 Claude Code: a session compacts on its own at the autoCompactWindow the project's settings set; the PreCompact hook fires and the SessionStart compact matcher shows the Project state again | FAIL | session exit 0 (ended by the script once compaction was seen: false; killed by the timeout: false); Read calls 2; peak context on one assistant turn 55239 tokens against a 100000 window; journal pre-compact: no, session-start with source compact after it in the same session: false; stream PreCompact hook_response: false, SessionStart hook_response with the Project state after it: false, a system event naming compaction: false |
| X1 Codex: a project SessionStart hook's Project state reaches the model | NOT RUN | codex not found; pass --codex <path> |
| X2 Codex: guardrails refuses a command that discards uncommitted work (ask becomes deny); without the hook the work is lost | NOT RUN | codex not found; pass --codex <path> |

## Notes

- Claude Code plugins were loaded with --plugin-dir for each session; marketplace installation is shown by the company release rehearsal. The interactive confirmation a person would see for an ask decision was not observed (headless sessions have no one to answer).
- L5 moves the read-guard log into the workspace with SKILLITON_READ_GUARD_LOG, so the machine's own log is not read or written. L6 sets autoCompactWindow in the disposable project's .claude/settings.json only; the person's own settings are not loaded (--setting-sources project) and not changed.
- Codex hooks run from the isolated Codex home's hooks.json with --dangerously-bypass-hook-trust; plugin-bundled hooks (removed in the measured Codex version) and the /hooks trust review a person performs were not exercised.

Result: 5 of 8 steps passed; the rest are listed above with why.
