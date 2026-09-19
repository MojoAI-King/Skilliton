# The team compaction window is 600000, owner-chosen

Kind: Living. Decision entry.

- **ID:** 2026-09-18-the-team-compaction-window-is-600000-own-e7ee
- **Status:** accepted
- **Date:** 2026-09-18

## Decision

The team settings template (`templates/project-settings.json`, docs/CONTRACTS.md section 5) sets `autoCompactWindow` to 600000 tokens. The value is the owner's choice on 2026-09-18, not a measurement. The same template now carries `bashOutputMaxChars: 30000` and `taskOutputMaxChars: 32000`, the documented defaults for the shell and background-task output caps (settings reference, Claude Code 2.1.261 or later, both clamped to 4000 to 128000), so the caps a team relies on are written down rather than assumed. `scripts/skilliton.test.mjs` pins all three keys, the documented range of the window (100000 to 1000000) and the caps' clamp range, so a drift is loud.

Two other numbers are on record with this one. The owner set their own user-level window to 1000000 on 2026-09-18 while the `/autocompact` question was open; a project's `.claude/settings.json` overrides the user file (settings reference, precedence), so a prepared project gets 600000 on that machine too. And there is no per-subagent window: the official agent frontmatter offers `model`, `effort` and `maxTurns` only, so a subagent's context is bounded by its model and its turns, not by a window of its own. That leaves the model and effort choice per lane as the available lever for area 04 batch 03, and the dispatch skill's lane ceilings stay free text until something measures them.

## Why

The template's earlier 200000 was the value of the owner's personal `/autocompact 200k` habit, carried over without a measurement. On 2026-09-18 the owner reported from use that 200000 is too tight on the larger models with heavy subagent use (backlog B36): the window is consumed before a piece of work finishes, and the session compacts in the middle of it. A larger window costs more per request (every turn re-reads more context) but keeps a lane of work whole. 600000 is the owner's judgement of a usable middle between the reported-too-tight 200000 and the documented maximum, chosen so the measurement in batch 04-01 has one value to measure against instead of a guess in every project.

## Alternatives rejected

- Keep 200000 until measured: rejected by the owner, because the measurement needs sessions that get work done, and 200000 was stopping them.
- Set the documented maximum, 1000000, as the team default: rejected, because the cost per turn grows with the window and nothing here has measured what a team session needs; the owner keeps 1000000 on their own machine while the skill is worked out.
- Leave the key out of the template and let each client's user setting decide: rejected, because then the number differs per person and the meter cannot compare sessions.
- Leave the task output cap to the client's default: rejected once the settings reference was read directly on 2026-09-18 and `taskOutputMaxChars` was found there (an earlier reading through the documentation agent had missed it); a subagent's reply has no cap key, and none is invented.

## Risk

The number is unmeasured, so it may be wrong in either direction: too large costs cache reads on every turn; too small compacts mid-work, the thing it was raised to stop. A project on a Claude Code older than 2.1.221 ignores the key and compacts at the client's own threshold, silently; docs/CLIENTS.md carries the version. The two cap keys are ignored below 2.1.261 in the same way. A finding from the live rehearsal (L6, 2.1.276, 2026-09-18) sharpens the too-small case: the client ends a session that hits the window again within 3 turns of a compaction, 3 times in a row, with its own message about a file or tool output being too large. So a window that is small against the outputs a session takes does not only compact mid-work, it ends the session. The mechanism was measured at 100000 in a disposable project; 600000 itself is still unmeasured.

## Reversibility

One value in the template, one pin in the test, and this entry; a project receives the new value the next time `skilliton project-settings --apply` runs there (the file is committed in the product repo, so the change is reviewed like code). What would change the number: two or three sessions of ordinary work measured through the meter (`node scripts/token-cost.mjs <from> <to> --project <key>` on the machine that holds the transcripts) with the peak context per session and whether compaction was reached, compared against the client's usage screen (PLAN.md sections 6 and 8, DECISIONS.md O2 and O3). Until then no cost or savings figure is attached to this value.

## Evidence

- `templates/project-settings.json` (600000 and 30000); `scripts/skilliton.test.mjs` section "team settings template: the keys a team relies on are pinned" (188 checks pass, 2026-09-18).
- The settings reference for `autoCompactWindow` (range and precedence), `bashOutputMaxChars` and `taskOutputMaxChars` (defaults, clamp range, version), read directly on 2026-09-18 22:29 EDT; the subagents reference for the agent frontmatter keys, read through the documentation agent the same day.
- docs/BACKLOG.md B36 (the owner's report), docs/areas/04-token-efficiency/batch-01-bound-context.md and batch-05-output-caps.md.
- `evidence/rehearsals/2026-09-19-live-clients-run-4` (L6: compaction observed at a project-set window of 100000; the three earlier folders of the same UTC date hold the failed attempts and the give-up finding).
- What this entry does not carry: a measured session at 600000 (docs/CLIENTS.md row for the compaction window says how it is known).
