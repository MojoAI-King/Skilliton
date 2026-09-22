# The team compaction window, read from this checkout's own compactions, 2026-09-22

Kind: Reference (evidence). Measured at 17:00 EDT from the session transcripts of this checkout on the maintainer's machine. A short script read every distinct `compact_boundary` record's trigger and `preTokens` (a boundary repeated in a later transcript counts once), and printed nothing else from the transcripts.

## What was measured

The settings in force: `autoCompactWindow` is 600000 in this repository's `.claude/settings.json` (the team settings template, committed 2026-09-18), and 1000000 in the maintainer's user settings.

| Period | Automatic compactions | preTokens at the boundary |
| --- | --- | --- |
| up to 2026-09-17 | 2 | 967545 and 970968 |
| 2026-09-18 to 2026-09-21 | 55 | 393975 once (2026-09-18 20:16 UTC), then 164741 to 179051 |
| 2026-09-22 | 2 | 568433 and 569293 |

The meter, after `node scripts/token-cost.test.mjs` passed, over 2026-09-22 for this checkout's project key (`node scripts/token-cost.mjs 2026-09-22 2026-09-23 --project <key> --json`): 467 top-level requests with a peak context of 545728, and 54 subagent requests with a peak of 95244. These are reconstructions from the transcripts, and no cost figure is taken from them.

## What it shows

On 2026-09-22 the automatic compactions happened just under 600000, the project's value, and not near the user's 1000000. So a project-level `autoCompactWindow` is read and honored. Decision O25 had expected about 460000 if the setting was honored. That expectation assumed a larger reserve than the one measured here, which is about 31000 tokens below the window.

## Not measured here

Why the sessions from 2026-09-18 to 2026-09-21 compacted near 170000. A 200000 window was in force for them from somewhere that is not recorded, and no cause is asserted. That question stays with B36.
