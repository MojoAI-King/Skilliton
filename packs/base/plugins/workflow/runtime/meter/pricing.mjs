// pricing.mjs: the meter's price table, in one place, so the meter prices a request and a display prices a stored row
// from the same numbers. A row in the committed ledger stores token counts and never a dollar figure; a cost is worked
// out from this table when it is shown, and the display names PRICING_RETRIEVED beside it.
//
// $/MTok: input, output, cache read, cache write 5m, cache write 1h.
// Source: Claude API reference pricing table (cached 2026-06-24) and prompt-caching economics
// (5m write 1.25x input, 1h write 2x input, read 0.1x input; Fable 5.1 reads are 0.025x, $0.25).
// Re-verify against the live pricing page before quoting any dollar figure.
// Claude Fable 5 read rate assumed 0.1x (the 0.025x exception is documented for 5.1 only): UNVERIFIED.
//
// claude-opus-5-5 added B63 (2026-09-22): the local transcripts carry 727 requests under this model
// with no price, which marked every window that touched it INCOMPLETE. Retrieved 2026-09-22 from
// https://claude.com/pricing (https://www.anthropic.com/pricing redirects there) and, for the 1h
// cache-write figure the pricing page states only as a multiplier, from
// https://platform.claude.com/docs/en/build-with-claude/prompt-caching (docs.claude.com redirects
// there). Opus 5.5's cache read is 0.05x input (a second, lower-than-usual exception, distinct from
// Fable 5.1's 0.025x): $0.20/MTok against a $4 input rate. 5m write $5 (1.25x) and 1h write $8 (2x)
// both match the standard formula.
const PRICING = {
  "claude-fable-5-1":          { input: 10, output: 50, cache_read: 0.25, cache_write_5m: 12.5, cache_write_1h: 20 },
  "claude-fable-5":            { input: 10, output: 50, cache_read: 1.0,  cache_write_5m: 12.5, cache_write_1h: 20 },
  "claude-opus-5-5":           { input: 4,  output: 20, cache_read: 0.2,  cache_write_5m: 5,    cache_write_1h: 8  },
  "claude-opus-5":             { input: 5,  output: 25, cache_read: 0.5,  cache_write_5m: 6.25, cache_write_1h: 10 },
  "claude-opus-4-8":           { input: 5,  output: 25, cache_read: 0.5,  cache_write_5m: 6.25, cache_write_1h: 10 },
  "claude-opus-4-6":           { input: 5,  output: 25, cache_read: 0.5,  cache_write_5m: 6.25, cache_write_1h: 10 },
  "claude-sonnet-5":           { input: 2,  output: 10, cache_read: 0.2,  cache_write_5m: 2.5,  cache_write_1h: 4 },
  "claude-haiku-4-5-20251001": { input: 1,  output: 5,  cache_read: 0.1,  cache_write_5m: 1.25, cache_write_1h: 2 },
};

// The newest retrieval date named in the notes above. A display that prices a row names it, so a reader can see how old
// the table behind an estimate is.
const PRICING_RETRIEVED = "2026-09-22";

// The estimated cost of one set of token counts at one model's rates: { cost, cost5m, rates }, or null for a model the table
// does not price. cost5m prices every cache write at the 5m rate, which is how the reference figures were established.
export function priceTokens(model, t) {
  const price = PRICING[model];
  if (!price) return null;
  const shared = t.input * price.input + t.output * price.output + t.cache_read * price.cache_read;
  return {
    cost: (shared + t.cache_write_5m * price.cache_write_5m + t.cache_write_1h * price.cache_write_1h) / 1e6,
    cost5m: (shared + (t.cache_write_5m + t.cache_write_1h) * price.cache_write_5m) / 1e6,
    rates: price,
  };
}
