# A first-copy-wins dedup keeps the streaming partial and undercounts output by two orders of magnitude

Kind: Living. Lesson entry.

- **ID:** 2026-09-18-a-first-copy-wins-dedup-keeps-the-stream-d6c1
- **Status:** accepted
- **Date:** 2026-09-18

## What broke

`scripts/token-cost.mjs` was fixture-tested and still could not reproduce the known figure for the Sep 14 to 15 window: subagents came out at $47.48 against the reference's $70.72, and DECISIONS.md O2 had guessed at a scope or cutoff difference for two days. The meter was right about every number it summed and wrong about which copy it summed.

## The mechanism

Claude Code writes several JSONL records per model response, all with the same `requestId` and `message.id`. The first copy is written while the response is still streaming, so its `output_tokens` is 1 or 2; the input-side numbers (`input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) are already final. A dedup that keeps the first copy therefore gets every input figure right and almost every output figure wrong, and the error hides inside totals that are dominated by cache reads. Measured on the reference window: 1,794 duplicate groups, input varied in none, output in 369, and the last copy carried the largest output in every one; the kept subagent copies held 2,070 output tokens where the largest held 505,419. A `<synthetic>` message (written locally, no API call) counted as a request explained the one-request difference in the top-level count.

## The fix

`scripts/token-cost.mjs`: the `seen` Set became a `chosen` Map from key to the counted copy, its bucket and its price; a later copy with a larger `output_tokens` adds the difference to the bucket's output and cost (`if (earlier.bucket && output > earlier.output)`). `<synthetic>` is a counter, not a request. `cost_all_5m_usd` prices every cache write at the 5m rate, which is how the reference was established.

## The rule

A dedup rule needs to say which copy it keeps and why, and the fixture needs copies that differ in the field that matters. "Identical copies" in a fixture is a claim about the data, and it was false here. When a meter misses a known figure, list the mechanisms that could produce exactly that gap before guessing at scope: a gap that is only in output tokens, only for subagents (short responses, so partials dominate), points at the copy selection, not at the window.

## What now enforces it

`scripts/token-cost.test.mjs`: r1's copies carry output 1, 2 and 50 and r4's carry 1 then 9, with the hand-computed totals unchanged, so first-copy-wins fails the output checks (checked by reverting the rule); `--reference` asserts the four known figures on the machine that holds the transcripts and reports NOT RUN elsewhere, so CI never claims the reproduction it cannot make.
