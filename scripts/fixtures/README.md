# Meter fixtures

Synthetic transcripts with hand-computed expected totals, so the meter's correctness is checkable by anyone, independent of the investigation that produced it.

Expected (see token-cost.test.mjs):
- records with usage: 7 (3 dup + 1 + 1 top-level, 2 dup subagent). The user record with no usage is ignored.
- distinct requests: 4 (r1, r2, r3, r4). The naive sum that was wrong by 3.28x would count 7.
- top-level: input 115, output 75, cache_read 4000, cache_write_5m 600 (200 + 400), cache_write_1h 600
- subagent:  input 7,   output 9,  cache_read 500,  cache_write_5m 100, cache_write_1h 0

Field names here mirror the Claude Code JSONL shape as understood on Sep 15, 2026. If your real transcripts differ, fix the meter's field mapping first, then re-run the real-window reproduction ($407.68 / $70.72 for Sep 14 to 15).

`hook/` holds the original and repaired awk forms plus a sample lessons file, so the before-and-after of the SessionStart fix is reproducible.
