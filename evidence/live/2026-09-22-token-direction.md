# A measured direction of travel for token use, 2026-09-16 to 2026-09-22

Kind: Reference (evidence). Captured 2026-09-22 19:08 EDT from this checkout's own project transcripts on the maintainer's machine, with `scripts/token-direction.mjs` (new, tested by `scripts/token-direction.test.mjs`). Every number below is a reconstruction from local transcripts, not a bill: the client's own Usage screen is the only real meter, and no dollar or percentage figure appears here (PLAN.md sections 6 and 8, DECISIONS.md O2/O3).

Before running it, `node scripts/token-cost.test.mjs` was run and passed (fixture assertions and the `--reference` check against this machine's real transcripts both green; see the terminal output recorded in this task's checkpoints). `scripts/token-cost.mjs` itself was extended earlier in this same lane (B63, its own commit) to price `claude-opus-5-5`; the 2026-09-22 row below is reported "complete" only because that fix landed first, on this branch, before this script ran against it.

## Order of events, so the table below is read against the right timeline

- **2026-09-18**: the read guard (context-hygiene's PreToolUse hook refusing a whole-file `Read` over 50KB) and `skilliton gate` both shipped, alongside the team `autoCompactWindow` decision of 600000 (DECISIONS.md, decision a3f4 and e7ee). A refusal or a gate run before this date is not possible; the table shows zero for both on 2026-09-16 and 2026-09-17, consistent with that.
- **2026-09-22**: the compaction window was *measured* (not just decided) for the first time, in `evidence/live/2026-09-22-compaction-window-measured.md` (DECISIONS.md O25): the two automatic compactions that day landed at 568433 and 569293 tokens, just under the project's 600000 window.
- This note's own capture is later the same day (19:08 EDT), after both of the above.

## What was measured

For this checkout's own project folder (its key is derived at run time from `git rev-parse --git-common-dir`, never written here; see the file header of `scripts/token-direction.mjs`), per day in `America/New_York` (matching `token-cost.mjs`'s own day bucketing):

| Day | Top-level requests | Peak context | Median ctx | Mean ctx | Compactions (auto/manual) | Read-guard refusals | `gate` runs | Models used | Data complete | Day elapsed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-16 | 1209 | 966266 | 476656 | 462009 | 4 (1/3) | 0 | 0 | haiku-4-5, opus-5 | yes | yes |
| 2026-09-17 | 832 | 962966 | 393304 | 454323 | 3 (1/2) | 0 | 0 | haiku-4-5, opus-5 | yes | yes |
| 2026-09-18 | 431 | 655367 | 150576 | 280859 | 11 (9/2) | 0 | 1 | fable-5-1, haiku-4-5, opus-5 | yes | yes |
| 2026-09-19 | 157 | 167545 | 129368 | 127319 | 5 (5/0) | 0 | 2 | fable-5-1, opus-5 | yes | yes |
| 2026-09-20 | 1436 | 166996 | 121384 | 120857 | 32 (30/2) | 0 | 0 | haiku-4-5, opus-5 | yes | yes |
| 2026-09-21 | 990 | 566309 | 135770 | 169512 | 13 (13/0) | 9 | 4 | fable-5-1, opus-5, sonnet-5 | yes | yes |
| 2026-09-22 | 810 | 565996 | 287391 | 302043 | 4 (3/1) | 22 | 0 | fable-5-1, haiku-4-5, opus-5-5, sonnet-5 | yes | **no, in progress at capture time** |

Model names abbreviated for the table; the script's own output carries the full model strings (e.g. `claude-haiku-4-5-20251001`, `claude-opus-5-5`). "Data complete" is `token-cost.mjs`'s own `incomplete` flag, negated: no unpriced model and no unreadable file in that day's records for this project. "Day elapsed" is a separate, non-data notion: whether the calendar day (America/New_York) has fully passed as of capture time. 2026-09-22 is today, so its row is a partial day: more of it will exist by the time anyone reads this note, including from the very session that produced it.

Scan quality: 82 transcript files walked (top-level and `subagents/`), 0 unreadable files, 0 unreadable directories, 0 unparseable lines.

## Methodology notes (nothing here is silent)

- **Top-level requests, peak context, and "data complete"** are read directly from `node scripts/token-cost.mjs <day> <day> --json` run against this project's own transcript folder, the already-tested meter, not a re-derivation of its dedup or pricing logic.
- **Median and mean context** are this script's own addition: token-cost.mjs only ever reports peak_context (a maximum). They are computed over the same (requestId, message.id)-deduped **top-level** requests only (subagent requests are excluded from these two columns, matching the "top-level requests" column they sit beside), taking the first copy's context per duplicate group, since token-cost.mjs's own comment establishes that the input side of a duplicate group never varies between copies, so the first copy's context is as good as the last.
- **Models used** is the broader set: every model seen in a usage record that day, top-level or subagent.
- **Compaction boundaries** are `type:"system", subtype:"compact_boundary"` records, deduped by `uuid` (a boundary can repeat verbatim in a continued transcript: confirmed 84 raw lines / 70 distinct events in one file on this machine), split into `auto` and `manual` by `compactMetadata.trigger`. This is a different count than `evidence/live/2026-09-22-compaction-window-measured.md`, which only counted `auto` triggers in coarser date buckets with an unrecorded ad hoc script: this note's auto-only totals (2 for 2026-09-16 to 09-17, 57 for 09-18 to 09-21, 3 for 09-22) are close to but not identical with that file's (2, 55, 2); both are reconstructions from the same underlying transcripts by two different, independently-written scripts, and the small gap between them is reported rather than reconciled away.
- **Read-guard refusals** are counted on Claude Code's own `"PreToolUse:Read hook error"` wrapper text around a denied `Read` call, not the hook's own reason string: the hook's wording (`packs/base/plugins/context-hygiene/hooks/read-guard.mjs:58-64`) turned up far more often as quoted source, a diff, or a test fixture than as a real denial in these transcripts, and the wrapper is Claude Code's runtime text, not something the hook's source file itself contains. A companion, separate signal exists at `~/.claude/skilliton/read-guard.log` (the hook's own append-only log), which independently holds 4 entries between 2026-09-20 and 2026-09-22, consistent in kind (refusals only appear from 09-20 onward in both sources) though not in count, since the log and the transcript-based count are not scoped identically (the log spans every project on the machine; this table is scoped to one project's transcripts).
- **`skilliton gate` runs** are Bash commands containing a shell segment that starts with `skilliton gate` or `node .../skilliton.mjs gate`, followed only by `--cmd`, a redirect, a pipe, or nothing. Three cheaper approaches were tried and rejected while building this: a bare "gate" substring match overcounted by more than 100x on this project's real transcripts (filenames and headings mentioning gate); an unanchored whole-command regex matched the invocation syntax quoted inside a heredoc that writes `gate.mjs`'s own source; and even a start-anchored, per-segment match without a trailing boundary matched two real sentences of prose that happen to start with "skilliton gate" ("skilliton gate built in workflow 0.8.0 with 13 tests", "skilliton gate in this repository has no checks of its own"). The counting rule here is the one that survived those three failures against the real data; `scripts/token-direction.test.mjs` pins all three failure modes as fixtures so a future change cannot reopen them silently. The rule is still not a shell parser: a quoted separator inside prose could in principle still slip through.

## Not measured here

- Any dollar figure, any percentage, and any comparison to a prior period framed as savings: those belong to PLAN.md sections 6 and 8 and to the owner's own Usage screen, not to this note.
- Why the compactions from 2026-09-18 to 2026-09-21 landed near 150000-170000 tokens rather than nearer the 600000 window: that question is `evidence/live/2026-09-22-compaction-window-measured.md`'s own "Not measured here" and stays with B36.
- Anything about lane worktrees other than the one this checkout is filed under: `--project-root` defaults to the MAIN worktree specifically so a lane run measures the same project the whole repository is filed under, not its own lane-worktree folder (which the earlier investigation for this task confirmed has no separate `~/.claude/projects` entry of its own on this machine).
