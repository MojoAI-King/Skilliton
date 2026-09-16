# Meter fixtures

Kind: Living.

Synthetic transcripts with hand-computed expected totals, so the meter's correctness is checkable by anyone, independent of the investigation that produced it. Every expected value in `scripts/token-cost.test.mjs` was computed by hand from these files, with the arithmetic written beside it in the test, not by running the meter.

## `transcripts/proj-a` (the original dedup cases)
- r1 appears 3 times with identical cumulative usage; r4 (in `subagents/`) appears twice. The naive sum that was wrong by 3.28x counts every copy; the meter must count each (requestId, message.id) once.
- r1 and r4 carry only `cache_creation_input_tokens` (no TTL breakdown), so they are priced at the 5m rate and reported as `ttl_unknown_tokens`.
- r3 carries the per-TTL breakdown (400 at 5m, 600 at 1h).
- A user record with no usage is ignored.

## `transcripts/proj-b` (everything that must be counted and reported, never silently dropped)
- r5: a second model (`claude-opus-5`), duplicated, with a 1h cache write. Proves per-record model pricing.
- A record with no requestId and no message id: counted as `no_ids`, never summed.
- r6: ids but no timestamp: counted as `no_timestamp`, never summed.
- r7: a model with no price: tokens counted, cost omitted, the run is flagged `incomplete`.
- r8: a truncated JSON line: counted as `unparseable_lines`.

## Proving the test can fail
Removing the dedup line, or pricing every record at one model, turns the test red (checked 2026-09-16 on a scratch copy). A test that cannot fail on the bug it names is not a test.

## Field names
They mirror the Claude Code JSONL shape as measured on real transcripts on 2026-09-16: top-level `requestId`, `timestamp`, `isSidechain`; `message.id`, `message.model`, `message.usage` with `cache_creation.ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens`. `usage.iterations` is a per-message breakdown and is not summed separately.

`hook/` holds the original and repaired awk forms plus sample lessons files, so the before-and-after of the SessionStart fix is reproducible.
