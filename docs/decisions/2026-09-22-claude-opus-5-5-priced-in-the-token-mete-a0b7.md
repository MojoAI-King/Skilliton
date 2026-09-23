# claude-opus-5-5 priced in the token meter from the published pricing page, not guessed

Kind: Living. Decision entry.

- **ID:** 2026-09-22-claude-opus-5-5-priced-in-the-token-mete-a0b7
- **Status:** proposed
- **Date:** 2026-09-22

## Decision

Added `claude-opus-5-5` to the `PRICING` table in `scripts/token-cost.mjs` (B63), priced at input $4, output $20, cache_read $0.20, cache_write_5m $5, cache_write_1h $8 per MTok, sourced from `https://claude.com/pricing` (`https://www.anthropic.com/pricing` redirects there) and, for the 1h cache-write figure the pricing page states only as a multiplier, from `https://platform.claude.com/docs/en/build-with-claude/prompt-caching`, both retrieved 2026-09-22.

## Why

The local transcripts on the maintainer's machine carry 727 requests under `claude-opus-5-5` with no price, which marked every window touching it `incomplete: true`. Before this fix, a run against the real transcripts with no date filter reported `unpriced_models: {"claude-opus-5-5": 727}`; after it, the same run reports `unpriced_models: {}` and `incomplete: false`.

## Alternatives rejected

- Assuming `claude-opus-5-5` prices the same as the nearest existing entry (`claude-opus-5`, at $5/$25): rejected. Opus 5.5's real published rates ($4/$20 input/output, and a cache-read rate of 0.05x input rather than the usual 0.1x) differ from Opus 5's, so this would have priced every window using it wrong rather than leaving it honestly unpriced. `scripts/token-cost-models.test.mjs` has a negative control asserting this specifically.
- Guessing a price when the page did not state one: not needed here, since the page does list Opus 5.5, but the project rule (never guess a price; leave a model unpriced and say so if the page does not list it) governed the approach throughout.

## Risk

Pricing pages change without notice; this entry and the comment beside the `PRICING` table both carry the retrieval date so a stale figure is traceable and re-verifiable, per the file's own standing instruction to re-verify before quoting a dollar figure publicly.

## Reversibility

Fully reversible: one table entry in `scripts/token-cost.mjs`, with a dedicated, separately-rooted fixture and test (`scripts/fixtures/transcripts-models/`, `scripts/token-cost-models.test.mjs`) that does not disturb `token-cost.test.mjs`'s own shared fixtures or hand-computed totals.

## Evidence

`node scripts/token-cost.test.mjs` (fixture assertions and `--reference` against this machine's real transcripts) and `node scripts/token-cost-models.test.mjs` both pass. A run against the real local transcripts with no date filter changed from `incomplete: true` / `unpriced_models: {"claude-opus-5-5": 727}` to `incomplete: false` / `unpriced_models: {}`.
