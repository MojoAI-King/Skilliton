# Maintenance asked for by the installed stop hook, and an instruction migration applied at session start, measured live, 2026-09-22

Kind: Reference (evidence). Measured at 15:04 EDT on the maintainer's machine, which has joined its company, with the installed workflow plugin at 0.19.0 (updated at user and project scope minutes earlier; every `claude -p` call starts a fresh process, so it loaded those hooks).

## What ran

A fresh Git repository in a temporary folder with one commit. Two headless Claude Code calls, with fixed steps between them, from one script (kept outside the repository):

1. `claude -p "Reply with the single word: ready." --max-turns 2`. Exit 0; the reply was `ready`. The repository was prepared by the session-start hook (auto-prepare, workflow 0.18.0); those files were then committed.
2. The managed block in `CLAUDE.md` and `AGENTS.md` was replaced with the rendering an earlier template produced (taken from this checkout's own pre-migration backup), and committed. A feature branch was merged with `--no-ff`. `skilliton migrate` then reported `1 migration(s) pending (0100-instructions-8412cc379963)`.
3. `claude -p "Reply with the single word: done. If a hook then asks you for something, do exactly what it names and nothing else." --max-turns 10 --allowedTools "Bash"`. Exit 0.

## What was measured

After the second call, without any other command having run in that folder:

- `skilliton migrate` reported `layout 3 is current; no migration is pending`; `CLAUDE.md` and `AGENTS.md` were modified and `.skilliton/migrations/` held the new receipt, all uncommitted. The instruction migration was applied by the session-start hook.
- The journal at `<git dir>/skilliton/journal.jsonl`, in order: `session-start` at the merge commit; `maintain-reminded` four seconds later (the stop hook held the session with the maintenance paragraph); `maintain` three seconds after that (the assistant ran `skilliton maintain --apply`, which wrote the security findings block into the backlog); `checkpoint` (it opened a task record and wrote the shared handoff with `checkpoint --handoff`, as the paragraph names); `session-end`.
- The assistant's final reply named each half: the mechanical half run, no decisions or lessons to record from that conversation, the backlog carrying the findings, the handoff written. It noted that an edit to the status record was not permitted (only `Bash` was allowed in the call) and that nothing was committed, since committing was not named.

## Not measured here

The text of the session-start block in the second call (a headless call does not print hook output; the receipt and the changed files are the evidence). The 24-hour rule, the once-per-commit rule and the lane-branch and unprepared-repository refusals are covered by `scripts/lifecycle.test.mjs` (58 of 58 on 12c6ab2), not by a live session. A stop hook in Claude Code can hold a session once; whether the assistant then does the judgment half well is its conduct, and this run shows one instance of it.
