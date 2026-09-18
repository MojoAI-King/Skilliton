# Meter fixtures

Kind: Living.

Synthetic transcripts with hand-computed expected totals, so the meter's correctness is checkable by anyone, independent of the investigation that produced it. Every expected value in `scripts/token-cost.test.mjs` was computed by hand from these files, with the arithmetic written beside it in the test, not by running the meter.

## `transcripts/proj-a` (the original dedup cases)
- r1 appears 3 times and r4 (in `subagents/`) twice. The copies of one request differ only in `output_tokens`: the earlier copies are the streaming partials Claude Code writes while the reply is still arriving (r1 carries 1, then 2, then 50; r4 carries 1, then 9), and the input side never varies. The naive sum that was wrong by 3.28x counts every copy; the meter must count each (requestId, message.id) once and keep the copy with the largest output. A first-copy-wins rule would keep the partial and understate output, which is why the test has a negative control that computes what first-copy-wins would report and asserts the meter differs.
- r1 and r4 carry only `cache_creation_input_tokens` (no TTL breakdown), so they are priced at the 5m rate and reported as `ttl_unknown_tokens`.
- r3 carries the per-TTL breakdown (400 at 5m, 600 at 1h).
- A user record with no usage is ignored.

## `transcripts/proj-b` (everything that must be counted and reported, never silently dropped)
- r5: a second model (`claude-opus-5`), duplicated, with a 1h cache write. Proves per-record model pricing.
- A record with no requestId and no message id: counted as `no_ids`, never summed.
- r6: ids but no timestamp: counted as `no_timestamp`, never summed.
- r7: a model with no price: tokens counted, cost omitted, the run is flagged `incomplete`.
- r8: a truncated JSON line: counted as `unparseable_lines`.
- r9: a message whose model is `<synthetic>`. Claude Code writes these locally (a cancelled turn, a client-side notice); no request was made, so it is counted as `synthetic` and never summed or priced.

## Proving the test can fail
Removing the dedup line, pricing every record at one model, or keeping the first copy instead of the largest-output copy turns the test red (checked 2026-09-16 and 2026-09-18 on scratch copies). A test that cannot fail on the bug it names is not a test.

## Field names
They mirror the Claude Code JSONL shape as measured on real transcripts on 2026-09-16: top-level `requestId`, `timestamp`, `isSidechain`; `message.id`, `message.model`, `message.usage` with `cache_creation.ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens`. `usage.iterations` is a per-message breakdown and is not summed separately.

`hook/` holds the original and repaired awk forms plus sample lessons files, so the before-and-after of the SessionStart fix is reproducible.
