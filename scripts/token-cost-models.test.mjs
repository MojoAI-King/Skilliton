#!/usr/bin/env node
// Proves a window using a newly-priced model is no longer marked incomplete (B63).
//
// Kept separate from the meter's own test and its fixtures (the workflow plugin's fixtures/meter/transcripts) on
// purpose: those fixtures are shared across many hand-computed assertions (see fixtures/meter/README.md there), and
// dropping a new project under the same root would change every "all projects" total there. This
// fixture lives under fixtures/transcripts-models instead, scoped to its own SKILLITON_PROJECTS, so
// it proves one thing without disturbing the other file's arithmetic.
//
// proj-c/session.jsonl: one claude-opus-5-5 request (r10), the model added to PRICING in
// the plugin meter's pricing.mjs on 2026-09-22 (see the comment beside the table for the source and retrieval date).
// Before that addition, this fixture reported incomplete=true and unpriced_models={"claude-opus-5-5":1},
// the same failure the real transcripts showed for 727 requests. Hand-computed at the model's published
// rates (input $4, output $20, cache_read $0.20, cache_write_5m $5, cache_write_1h $8 per MTok):
//   input:  1000 * 4  = 4000
//   output:  500 * 20 = 10000
//   cache_read: 2000 * 0.20 = 400
//   cache_write_5m: 300 * 5 = 1500
//   cache_write_1h: 100 * 8 = 800
//   total = 16700 micro-usd = $0.0167
// cost_all_5m_usd prices every cache write at the 5m rate instead: (300 + 100) * 5 = 2000, so
//   4000 + 10000 + 400 + 2000 = 16400 micro-usd = $0.0164
// peak_context = input + cache_read + cache_write_5m + cache_write_1h = 1000 + 2000 + 300 + 100 = 3400
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const METER = join(here, "..", "packs", "base", "plugins", "workflow", "runtime", "meter", "token-cost.mjs");
const run = (...args) => JSON.parse(execFileSync("node", [METER, "--json", ...args], {
  env: { ...process.env, SKILLITON_PROJECTS: join(here, "fixtures", "transcripts-models"), SKILLITON_TZ: "America/New_York" },
}).toString().trim().split("\n").pop());

let fail = 0;
const check = (name, got, want) => {
  const same = typeof want === "number" ? Math.abs((got ?? NaN) - want) < 1e-9 : JSON.stringify(got) === JSON.stringify(want);
  if (!same) { console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); fail++; } else console.log(`ok   ${name} = ${JSON.stringify(got)}`);
};

const r = run();
check("records", r.records, 1);
check("distinct", r.distinct, 1);
check("unpriced_models", r.unpriced_models, {});
check("incomplete", r.incomplete, false); // the whole point: this model used to leave every window it touched incomplete
const top = r.byScope.top;
check("requests", top?.requests, 1);
check("input", top?.input, 1000);
check("output", top?.output, 500);
check("cache_read", top?.cache_read, 2000);
check("cache_write_5m", top?.cache_write_5m, 300);
check("cache_write_1h", top?.cache_write_1h, 100);
check("peak_context", top?.peak_context, 3400);
check("cost_usd", top?.cost_usd, 0.0167);
check("cost_all_5m_usd", top?.cost_all_5m_usd, 0.0164);

// Negative control: pricing this record at claude-opus-5's rates (the nearest priced model, and the
// mistake of assuming a new model is "close enough" to an existing one) gives a different total, so
// this test would catch that class of error too.
const opus5Cost = (1000 * 5 + 500 * 25 + 2000 * 0.5 + 300 * 6.25 + 100 * 10) / 1e6;
check("negative control: opus-5-5 is priced differently from opus-5", top?.cost_usd !== opus5Cost, true);

console.log(fail ? `\n${fail} FAILURES: claude-opus-5-5 pricing is not trustworthy yet` : "\nmodel-pricing fixture test passed");
process.exit(fail ? 1 : 0);
