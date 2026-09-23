# The measured comparison, second run: with and without Skilliton

Kind: Evidence. Run 2026-09-23 from 09:59 to 10:04 EDT on the owner's Mac, under the second run fixed in docs/COMPARISON_PROTOCOL.md at 02:52 EDT before it ran. Runner: `scripts/rehearsals/comparison.mjs --out evidence/comparison/2026-09-23 --reps 3 --only D,F --ceiling 4000000`, model `claude-sonnet-5`, `claude -p` with `--max-turns 30`; the "with" setup adds the four plugins from this checkout at commit 1f9f041 (release 1.1.0: the instruction block cut to 4,499 bytes and the Project state block collapsed to one line when every check is ok). Every row is in `results.jsonl` and each session's raw result is in its folder (the dashes the model typed in its answers were replaced with hyphens, for this repository's dash rule; nothing else was edited); every session exited 0 and none reported an error. Input tokens across the 12 sessions: 2,273,185, under the 4,000,000 ceiling.

## Results

| Task | What is counted | Without Skilliton | With Skilliton |
|---|---|---|---|
| D again. "Tell me what's in data.json" (2.6 MB) | input tokens for the session, cache included | 239553, 241475, 192924 | 263952, 370422, 426445 |
| F. Orientation: "Where does this project stand, and what should I do next? Answer in five lines or fewer." | the answer names the next step from the handoff, the open task, and the uncommitted file | **0 of 3** named all three (each missed the open task) | **2 of 3** named all three (one missed the open task) |
| F, cost | input tokens for the session, cache included | 144574, 93741, 144560 | 52035, 51472, 52032 |
| F, turns and wall time | turns the client reported; seconds | 3, 2, 3 turns; 6.7, 5.3, 10.5 s | 1, 1, 1 turn; 4.1, 2.5, 4.4 s |

## What each result means

- **F is what the session-start hook is for.** With Skilliton, the handoff's resume marker and the Project state block (the open task, the uncommitted file) are in the first turn's context, so every session answered in one turn on about 52,000 input tokens. Without it, the model spent two or three turns reading the repository, used 94,000 to 145,000 input tokens, and never noticed the open task record. One "with" session also missed the open task in its five lines, so the count is 2 of 3, not 3 of 3.
- **D still shows a context cost, and a larger one than the first run.** With Skilliton the sessions used about 24,000, 129,000 and 234,000 more input tokens than their counterparts. The read guard refuses the whole 2.6 MB read and names a range read instead; in two of the three "with" sessions the model then read several ranges, each a turn of context, where the sessions without the guard took one truncated read. The first run's gap on this task was about 20,000 to 30,000 per session; the smaller instruction block did not change task D's cost, because that cost is the range reads, not the block.
- **Nothing here is a saving.** Task F's counts are lower with Skilliton and task D's are higher; which matters for a team depends on how often each kind of session happens, which this run does not measure. Any money figure needs `scripts/token-cost.mjs` over the same window cross-checked against the Usage screen, which is the owner's reading (docs/areas/10-proof/batch-02-measured-comparison.md, item 2).

## What this does not show

- Anything about a person's interactive session.
- Whether the smaller instruction block changed the cost of an ordinary session: task D's cost is dominated by the range reads, and task F's "without" arm has no block to compare with. Measuring the block's own cost needs a task whose "with" and "without" sessions read the same files.
- More than one model, and more than three repetitions per task.
