# Live client lifecycle rehearsal (M2)

Kind: Reference. Recorded 2026-09-19 by `scripts/rehearsals/live-clients.mjs`. Disposable folders, synthetic projects and throwaway keys only.

- **Claude Code:** 2.1.276 (Claude Code)
- **Codex:** not found
- **Node:** v25.8.1

| Step | Result | Evidence |
|---|---|---|
| L6 Claude Code: a session compacts on its own at the autoCompactWindow the project's settings set; the PreCompact hook fires and the SessionStart compact matcher shows the Project state again | FAIL | session exit 1 (ended by the script once compaction was seen: false; killed by the timeout: false); Read calls 6; peak context on one assistant turn 56343 tokens against a 100000 window; journal pre-compact: yes (trigger auto), session-start with source compact after it in the same session: true; stream PreCompact hook_response: false, SessionStart hook_response with the Project state after it: false, a system event naming compaction: true; journal pre-compact events 3, compact session-starts 3; system subtypes seen: hook_started,hook_response,init,thinking_tokens,status,compact_boundary; hook events seen: hook_started:SessionStart,hook_response:SessionStart; result success, 10 turns, last words: "it within 3 turns of the previous compact, 3 times in a row. A file being read or a tool output is likely too large for the context window. Try reading in smaller chunks, or use /clear to start fresh." |

## Notes

- Claude Code plugins were loaded with --plugin-dir for each session; marketplace installation is shown by the company release rehearsal. The interactive confirmation a person would see for an ask decision was not observed (headless sessions have no one to answer).
- L5 moves the read-guard log into the workspace with SKILLITON_READ_GUARD_LOG, so the machine's own log is not read or written. L6 sets autoCompactWindow in the disposable project's .claude/settings.json only; the person's own settings are not loaded (--setting-sources project) and not changed.
- Codex hooks run from the isolated Codex home's hooks.json with --dangerously-bypass-hook-trust; plugin-bundled hooks (removed in the measured Codex version) and the /hooks trust review a person performs were not exercised.
- Steps L1, L2, L3, L4, L5, X1, X2 were not run in this pass (--only L6); they are not recorded here as anything.

Result: 0 of 1 steps passed; the rest are listed above with why.
