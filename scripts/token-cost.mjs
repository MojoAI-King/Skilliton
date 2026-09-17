#!/usr/bin/env node
// token-cost.mjs: corrected usage meter.
//
// STATUS: fixture-tested; NOT yet reproducing the known real-window figure (see DECISIONS.md, O2).
// Until it does, no number it prints goes on a card, in the README, or in a recording.
//
// What it does differently from the version that was wrong by 3.28x:
//   1. dedups by (requestId, message.id): Claude Code writes several JSONL records per response,
//      each carrying the same cumulative usage; summing them all inflates everything
//   2. walks subagents/**/*.jsonl, not just top-level transcripts (path-based scope; measured
//      2026-09-16 to agree exactly with the records' own isSidechain flag, 672 of 672)
//   3. prices every record at ITS OWN model's rates, both cache-write TTLs separately
//   4. uses an explicit timezone for day bucketing
//   5. streams files line by line: a transcript over ~512MB cannot be read into one string, and an
//      earlier draft skipped such files silently inside a catch
//   6. counts, and reports, every record it could not use (no ids, no timestamp, unparseable line,
//      unreadable file, unpriced model). Nothing is dropped silently.
//
// Dollars here are reconstructed API-equivalent cost, NOT the subscription's own meter.
// Tier 1 (real quota, logged by the status line) is the number that matters.
//
// Usage:
//   node scripts/token-cost.mjs [FROM_DAY TO_DAY] [--project <substring>]... [--until <ISO time>] [--by-project] [--json]
//   FROM_DAY/TO_DAY are YYYY-MM-DD in SKILLITON_TZ, inclusive. --project matches the project
//   directory name, case-insensitive; repeat it for a union. Project names are passed on the
//   command line only and never committed.

import { readdirSync, statSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { homedir } from "node:os";

const ROOT = process.env.SKILLITON_PROJECTS ?? join(homedir(), ".claude", "projects");
const TZ = process.env.SKILLITON_TZ ?? "America/New_York";
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const values = (k) => argv.flatMap((a, i) => (a === k && argv[i + 1] ? [argv[i + 1]] : []));
const JSON_OUT = flag("--json");
const BY_PROJECT = flag("--by-project");
const PROJECTS = values("--project").map((p) => p.toLowerCase());
const UNTIL = values("--until")[0];
const untilMs = UNTIL ? Date.parse(UNTIL) : null;
if (UNTIL && Number.isNaN(untilMs)) { console.error(`--until is not a valid time: ${UNTIL}`); process.exit(2); }
const valueArgs = new Set(argv.flatMap((a, i) => (["--project", "--until"].includes(a) ? [i + 1] : [])));
const [fromArg, toArg] = argv.filter((a, i) => !a.startsWith("--") && !valueArgs.has(i));

// $/MTok: input, output, cache read, cache write 5m, cache write 1h.
// Source: Claude API reference pricing table (cached 2026-06-24) and prompt-caching economics
// (5m write 1.25x input, 1h write 2x input, read 0.1x input; Fable 5.1 reads are 0.025x, $0.25).
// Re-verify against the live pricing page before quoting any dollar figure.
// Claude Fable 5 read rate assumed 0.1x (the 0.025x exception is documented for 5.1 only): UNVERIFIED.
const PRICING = {
  "claude-fable-5-1":          { input: 10, output: 50, cache_read: 0.25, cache_write_5m: 12.5, cache_write_1h: 20 },
  "claude-fable-5":            { input: 10, output: 50, cache_read: 1.0,  cache_write_5m: 12.5, cache_write_1h: 20 },
  "claude-opus-5":             { input: 5,  output: 25, cache_read: 0.5,  cache_write_5m: 6.25, cache_write_1h: 10 },
  "claude-opus-4-8":           { input: 5,  output: 25, cache_read: 0.5,  cache_write_5m: 6.25, cache_write_1h: 10 },
  "claude-opus-4-6":           { input: 5,  output: 25, cache_read: 0.5,  cache_write_5m: 6.25, cache_write_1h: 10 },
  "claude-sonnet-5":           { input: 2,  output: 10, cache_read: 0.2,  cache_write_5m: 2.5,  cache_write_1h: 4 },
  "claude-haiku-4-5-20251001": { input: 1,  output: 5,  cache_read: 0.1,  cache_write_5m: 1.25, cache_write_1h: 2 },
  "<synthetic>":               { input: 0,  output: 0,  cache_read: 0,    cache_write_5m: 0,    cache_write_1h: 0 }, // written locally, no API call
};

function* walk(dir) {
  let ents = [];
  try { ents = readdirSync(dir); } catch (e) { counters.unreadable_dirs++; return; }
  for (const e of ents) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { counters.unreadable_files++; continue; }
    if (st.isDirectory()) yield* walk(p);
    else if (e.endsWith(".jsonl")) yield p;
  }
}

const dayOf = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
const FIELDS = ["requests", "input", "output", "cache_read", "cache_write_5m", "cache_write_1h"];
const blank = () => ({ requests: 0, input: 0, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, cost_usd: 0, ttl_unknown_tokens: 0 });
const counters = { files: 0, unreadable_files: 0, unreadable_dirs: 0, unparseable_lines: 0, records: 0, distinct: 0, duplicates: 0, no_ids: 0, no_timestamp: 0, out_of_window: 0, filtered_project: 0 };
const unpriced = {}; // model -> requests
const seen = new Set();
const buckets = {}; // `${day}|${scope}` or `${project}|${scope}`

for (const file of walk(ROOT)) {
  const project = file.slice(ROOT.length + 1).split("/")[0];
  const scope = file.includes("/subagents/") ? "subagent" : "top";
  const projectMatch = !PROJECTS.length || PROJECTS.some((p) => project.toLowerCase().includes(p));
  counters.files++;
  let rl;
  try {
    rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.includes('"usage"')) continue; // records without the key cannot carry usage
      let rec; try { rec = JSON.parse(line); } catch { counters.unparseable_lines++; continue; }
      const msg = rec.message;
      if (!msg || !msg.usage) continue;
      counters.records++;
      const reqId = rec.requestId ?? rec.request_id ?? "";
      const msgId = msg.id ?? "";
      if (!reqId && !msgId) { counters.no_ids++; continue; } // cannot dedup; counted and reported, never summed
      const key = `${reqId}|${msgId}`;
      if (seen.has(key)) { counters.duplicates++; continue; } // THE FIX: one count per (requestId, message.id)
      seen.add(key);
      counters.distinct++;

      const ms = Date.parse(rec.timestamp ?? rec.ts ?? "");
      if (Number.isNaN(ms)) { counters.no_timestamp++; continue; }
      const day = dayOf(ms);
      if ((fromArg && day < fromArg) || (toArg && day > toArg) || (untilMs != null && ms > untilMs)) { counters.out_of_window++; continue; }
      if (!projectMatch) { counters.filtered_project++; continue; }

      const u = msg.usage;
      const model = msg.model ?? "unknown";
      const cc = u.cache_creation;
      const hasTtl = cc && (cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null);
      const t = {
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cache_read: u.cache_read_input_tokens ?? 0,
        cache_write_5m: hasTtl ? (cc.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0), // unknown TTL: attributed to 5m, reported
        cache_write_1h: hasTtl ? (cc.ephemeral_1h_input_tokens ?? 0) : 0,
      };
      const price = PRICING[model];
      let cost = 0;
      if (price) cost = (t.input * price.input + t.output * price.output + t.cache_read * price.cache_read + t.cache_write_5m * price.cache_write_5m + t.cache_write_1h * price.cache_write_1h) / 1e6;
      else unpriced[model] = (unpriced[model] ?? 0) + 1;

      const b = (buckets[`${BY_PROJECT ? project : day}|${scope}`] ??= blank());
      b.requests++;
      for (const f of FIELDS.slice(1)) b[f] += t[f];
      b.cost_usd += cost;
      if (!hasTtl) b.ttl_unknown_tokens += t.cache_write_5m;
    }
  } catch (e) {
    counters.unreadable_files++;
    console.error(`UNREADABLE: ${file.slice(ROOT.length + 1)}: ${e.message}`);
  } finally {
    rl?.close();
  }
}

const incomplete = Object.keys(unpriced).length > 0 || counters.unreadable_files > 0 || counters.unreadable_dirs > 0;
const round = (x) => Math.round(x * 1e9) / 1e9;

if (JSON_OUT) {
  const byScope = {};
  for (const [k, b] of Object.entries(buckets)) {
    const s = (byScope[k.split("|")[1]] ??= blank());
    for (const f of [...FIELDS, "cost_usd", "ttl_unknown_tokens"]) s[f] += b[f];
  }
  for (const s of Object.values(byScope)) s.cost_usd = round(s.cost_usd);
  console.log(JSON.stringify({ ...counters, tz: TZ, window: { from: fromArg ?? null, to: toArg ?? null, until: UNTIL ?? null }, projects: PROJECTS, unpriced_models: unpriced, incomplete, byScope }));
  process.exit(0);
}

const c = counters;
console.log(`files=${c.files} records=${c.records} distinct=${c.distinct} duplicates=${c.duplicates} dedup_ratio=${(c.records / Math.max(c.distinct, 1)).toFixed(2)}x tz=${TZ}${UNTIL ? ` until=${UNTIL}` : ""}${PROJECTS.length ? ` projects=${PROJECTS.length} filter(s)` : ""}`);
console.log(`not summed: no_ids=${c.no_ids} no_timestamp=${c.no_timestamp} unparseable_lines=${c.unparseable_lines} unreadable_files=${c.unreadable_files} out_of_window=${c.out_of_window} filtered_project=${c.filtered_project}`);
console.log(`${(BY_PROJECT ? "project" : "day").padEnd(BY_PROJECT ? 40 : 10)} scope     requests     input    output  cache_read     cw_5m     cw_1h   est_usd`);
let grand = 0, ttlUnknown = 0;
for (const k of Object.keys(buckets).sort()) {
  const [label, scope] = k.split("|");
  const b = buckets[k];
  grand += b.cost_usd; ttlUnknown += b.ttl_unknown_tokens;
  console.log(`${label.padEnd(BY_PROJECT ? 40 : 10)} ${scope.padEnd(9)} ${String(b.requests).padStart(8)} ${String(b.input).padStart(9)} ${String(b.output).padStart(9)} ${String(b.cache_read).padStart(11)} ${String(b.cache_write_5m).padStart(9)} ${String(b.cache_write_1h).padStart(9)} ${b.cost_usd.toFixed(2).padStart(9)}`);
}
if (ttlUnknown) console.log(`NOTE: ${ttlUnknown} cache-write tokens had no TTL breakdown and were priced at the 5m rate`);
if (Object.keys(unpriced).length) console.log(`UNPRICED MODELS (requests counted, cost omitted): ${JSON.stringify(unpriced)}`);
console.log(`TOTAL est_usd=${grand.toFixed(2)}  (reconstructed API-equivalent, not the subscription meter)${incomplete ? "  INCOMPLETE: see unpriced models or unreadable files above; do not quote this" : ""}`);
