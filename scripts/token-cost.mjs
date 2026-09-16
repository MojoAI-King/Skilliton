#!/usr/bin/env node
// token-cost.mjs: corrected usage meter. SKELETON.
//
// STATUS: not yet trusted. Per PLAN.md, a meter that cannot reproduce a known-correct figure is not a meter.
// Acceptance test before any output is used anywhere:
//   re-run over Sep 14-15 and reproduce $407.68 top-level / $70.72 subagents (not $1,568.88).
//
// What it does differently from the version that was wrong by 3.28x:
//   1. dedups by (requestId, message.id): Claude Code writes several JSONL records per response,
//      each carrying the same cumulative usage; summing them all inflates everything
//   2. walks subagents/**/*.jsonl, not just top-level transcripts
//   3. applies both cache-write rates from recorded durations, not an assumed single rate
//   4. uses an explicit timezone for day bucketing
//
// Everything in PRICING is a placeholder copied from the Sep 15 investigation. Verify against the
// current pricing page before trusting a dollar figure. Dollars here are reconstructed API-equivalent
// cost, NOT the subscription's own meter. Tier 1 (real quota) is the number that matters.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ROOT = process.env.SKILLGATE_PROJECTS ?? join(homedir(), ".claude", "projects");
const TZ = process.env.SKILLGATE_TZ ?? "America/New_York";
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const [fromArg, toArg] = argv.filter(a => !a.startsWith("--")); // YYYY-MM-DD YYYY-MM-DD (inclusive), optional

// $/MTok. The four cache figures for fable-5-1 are the ones recorded in the Sep 15 investigation.
// input and output are null on purpose: they were not in that investigation and must be filled from
// the current pricing page before any dollar total is reported. A null price makes the total INCOMPLETE.
const PRICING = {
  "claude-fable-5-1": { input: null, output: null, cache_read: 0.25, cache_write_5m: 12.5, cache_write_1h: 20.0 },
  // add other models here as observed
};
const DEFAULT_PRICE = { input: null, output: null, cache_read: null, cache_write_5m: null, cache_write_1h: null };

function* walk(dir) {
  let ents = [];
  try { ents = readdirSync(dir); } catch { return; }
  for (const e of ents) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) yield* walk(p);
    else if (e.endsWith(".jsonl")) yield p;
  }
}

const dayOf = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD

const seen = new Set();
const totals = {}; // key: `${day}|${scope}` -> usage sums
let records = 0, distinct = 0;

for (const file of walk(ROOT)) {
  const scope = file.includes("/subagents/") ? "subagent" : "top";
  let lines = [];
  try { lines = readFileSync(file, "utf8").split("\n"); } catch { continue; }
  for (const line of lines) {
    if (!line.trim()) continue;
    let rec; try { rec = JSON.parse(line); } catch { continue; }
    const msg = rec.message;
    if (!msg || !msg.usage) continue;
    records++;
    const reqId = rec.requestId ?? rec.request_id ?? "";
    const msgId = msg.id ?? "";
    const key = `${reqId}|${msgId}`;
    if (!reqId && !msgId) continue;          // cannot dedup; skip rather than double count silently
    if (seen.has(key)) continue;             // THE FIX: one count per (requestId, message.id)
    seen.add(key);
    distinct++;

    const ts = rec.timestamp ?? rec.ts;
    if (!ts) continue;
    const day = dayOf(ts);
    if (fromArg && day < fromArg) continue;
    if (toArg && day > toArg) continue;

    const u = msg.usage;
    const model = msg.model ?? "unknown";
    const k = `${day}|${scope}`;
    const t = (totals[k] ??= { input: 0, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, requests: 0, models: {} });
    t.requests++;
    t.models[model] = (t.models[model] ?? 0) + 1;
    t.input      += u.input_tokens ?? 0;
    t.output     += u.output_tokens ?? 0;
    t.cache_read += u.cache_read_input_tokens ?? 0;
    // cache writes: prefer the per-TTL breakdown when the record carries it; otherwise fall back
    const cc = u.cache_creation;
    if (cc && (cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null)) {
      t.cache_write_5m += cc.ephemeral_5m_input_tokens ?? 0;
      t.cache_write_1h += cc.ephemeral_1h_input_tokens ?? 0;
    } else {
      t.cache_write_5m += u.cache_creation_input_tokens ?? 0; // unknown TTL: attribute to 5m; flag below
      t._ttlUnknown = true;
    }
  }
}

let incomplete = false;
const term = (tokens, rate) => { if (rate == null) { if (tokens > 0) incomplete = true; return 0; } return tokens * rate; };
const cost = (t, price) =>
  (term(t.input, price.input) + term(t.output, price.output) + term(t.cache_read, price.cache_read) +
   term(t.cache_write_5m, price.cache_write_5m) + term(t.cache_write_1h, price.cache_write_1h)) / 1e6;

if (JSON_OUT) {
  const byScope = {};
  for (const [k, t] of Object.entries(totals)) {
    const scope = k.split("|")[1];
    const b = (byScope[scope] ??= { requests: 0, input: 0, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0 });
    for (const f of ["requests","input","output","cache_read","cache_write_5m","cache_write_1h"]) b[f] += t[f];
  }
  console.log(JSON.stringify({ records, distinct, byScope }));
  process.exit(0);
}
console.log(`records=${records} distinct_requests=${distinct} dedup_ratio=${(records / Math.max(distinct, 1)).toFixed(2)}x tz=${TZ}`);
console.log("day        scope     requests  input     output    cache_read  cw_5m     cw_1h     est_usd  models");
let grand = 0;
for (const k of Object.keys(totals).sort()) {
  const [day, scope] = k.split("|");
  const t = totals[k];
  // price by dominant model for the bucket; crude but transparent
  const domModel = Object.entries(t.models).sort((a, b) => b[1] - a[1])[0][0];
  const price = PRICING[domModel] ?? DEFAULT_PRICE;
  const usd = cost(t, price);
  grand += usd;
  console.log(`${day} ${scope.padEnd(9)} ${String(t.requests).padStart(8)} ${String(t.input).padStart(9)} ${String(t.output).padStart(9)} ${String(t.cache_read).padStart(11)} ${String(t.cache_write_5m).padStart(9)} ${String(t.cache_write_1h).padStart(9)} ${usd.toFixed(2).padStart(8)}  ${domModel}${t._ttlUnknown ? " (TTL unknown; cw attributed to 5m)" : ""}${price === DEFAULT_PRICE ? " (NO PRICE: add to PRICING)" : ""}`);
}
console.log(`TOTAL est_usd=${grand.toFixed(2)}  (reconstructed API-equivalent, not the subscription meter)${incomplete ? "  INCOMPLETE: one or more prices are null; fill PRICING before quoting this" : ""}`);
