# Install and live use on this machine

Kind: Living. Batch record. Area [01-autopilot-loop](AREA.md).

- **Type:** measure
- **Goal:** Stop grading the loop from rehearsals. Install the plugins on the owner's machine with join, work one real session in this repository through them, and file what was seen.
- **Depends on:** none; this is the first batch of the whole plan
- **Advances:** B5, B34; M2, M8
- **Estimated sessions:** 1 (the owner's own session, plus a short one to file the evidence)

## Acceptance

- [x] join has run on this machine and skilliton verify reports the three plugins installed and enabled (evidence: evidence/live/2026-09-18-join-this-machine.md; join with the bundled Claude Code 2.1.276 installed context-hygiene 0.3.0, workflow 0.8.0 and guardrails 0.4.0 from the GitHub marketplace at commit f8a935c, `claude plugin list` shows all three enabled at user scope; verify reads UNKNOWN VERSION for each, not VERIFIED, because this repository has no signed release tag yet, backlog B6)
- [ ] one real session in this repository shows the Project state block and the RESUME HERE note at session start, filed as evidence/live/session-start.md with the date and client version
- [ ] the guardrails confirmation prompt is seen live on a command that throws away uncommitted work (B5), filed with what was typed and what the client showed
- [ ] the read guard refuses a whole-file Read of a file over 50KB in the live session (B34), filed with the refusal text
- [ ] the stop hook asks for a checkpoint when the session ends with changes and no recent checkpoint, filed
- [ ] docs/CLIENTS.md and docs/COVERAGE.md say measured on this client for each row the session covered, with the date

## Notes

Nothing here is a code change unless something fails; a failure is a finding that becomes a fix with a test. The skilliton command was not on the shell path in this session (2026-09-18); note whether it is after join, and pass that to area 02 batch 02.

Join ran on 2026-09-18 22:24 EDT (company `mojoai`, receipt under `<home>/.config/skilliton/joined/`). It wrote the launcher to `<home>/.local/bin/skilliton`; whether that folder is on the owner's shell path is recorded in the task record for this wave. The headless rehearsal (`scripts/rehearsals/live-clients.mjs`) gained steps L5 (the read guard refusing a whole-file Read) and L6 (compaction at the window a project's settings set) in this wave; L5 passed on the first run (`evidence/rehearsals/2026-09-19-live-clients`, the UTC date) and L6 on the fourth (`2026-09-19-live-clients-run-4`); the three failed L6 attempts are kept because they recorded two client behaviors: a session that hits the window again within 3 turns of a compaction, 3 times in a row, is ended by the client, and a corpus of random hashes could not be compacted. The rows in docs/CLIENTS.md and docs/COVERAGE.md say measured only for what a step showed; B34 is closed on those two steps.

Waits for the owner pass at the end (docs/REPORT_CARD.md).

**The owner's interactive session (items 2 to 5).** Open Claude Code in this repository (the installed plugins, not `--plugin-dir`) and note, for each line, seen or not seen, with the exact text where there is any:

1. At session start: the "Project state" block and the latest RESUME HERE from docs/HANDOFF.md appear before the first prompt.
2. Ask the assistant to run `git commit --no-verify -m test` (nothing is staged, so nothing can be committed): the guardrails hook should block it and the assistant should say why.
3. Ask the assistant to run `git checkout -- .` while a file has an uncommitted change (make one on purpose in a scratch file first): the client should show the guardrails confirmation prompt (B5). Answer no. Note what the prompt looked like and what was typed.
4. Type `/` and look for the eight skills: `workflow:task`, `workflow:dispatch`, `workflow:handoff`, `workflow:maintain`, `workflow:review`, `workflow:security`, `guardrails:guardrails`, `context-hygiene:context-hygiene`.
5. Ask the assistant to read `scripts/skilliton.test.mjs` whole (it is over 50KB): the read guard should refuse with its reason, and the assistant should read a range instead (B34).
6. Make a small change to a scratch file and end the session (or ask the assistant to stop) without recording a checkpoint: the stop hook should ask for one.
7. Optional, for area 04 batch 01's last item: work normally under the project's 600000 and, if the client compacts, paste the two journal lines (`pre-compact`, then `session-start` with `source compact`) from `.git/skilliton/journal.jsonl`; the headless step measured the mechanism at 100000, not this value.

File it as `evidence/live/<date>-owner-session.md` in the form of the other files in that folder: the H1 "Live check: ..."; a "Kind: Reference." line with the date, the client version (`claude --version`) and how the session was started; the pasted lines in one fenced block, one numbered item per line above, each marked seen or not seen; then "What this shows" and "What it does not show". No home paths (write `<home>`), no dashes, no names; run `bash scripts/scrub-check.sh evidence/live/<date>-owner-session.md` before it is committed. Then tick items 2 to 5 above with that file as the evidence, and only the ones that were seen.
