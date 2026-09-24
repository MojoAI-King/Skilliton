#!/usr/bin/env node
// token-cost.mjs: corrected usage meter. It ships inside the workflow plugin, so every prepared project has it;
// scripts/token-cost.mjs in the Skilliton repository is a shim that runs this file with the same arguments.
//
// STATUS: fixture-tested, and it reproduces the known real-window figure on the machine that holds those
// transcripts (`node scripts/token-cost.test.mjs --reference`; DECISIONS.md O2). A number it prints is still a
// reconstruction: it goes nowhere public until it is cross-checked against the client's own usage screen (PLAN.md
// sections 6 and 8).
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
//   7. inside a duplicate group it keeps the copy with the LARGEST output count, not the first. Claude Code
//      writes the first copy while the response is still streaming, with output_tokens of 1 or 2, and the
//      input-side numbers never differ between copies (measured 2026-09-18 over 1,794 groups: input varied in
//      none, output in 369, and the last copy carried the largest count in every one). First-copy-wins kept
//      2,070 output tokens for the subagents of a two-day window whose largest copies carried 505,419, which
//      was the whole of the subagent gap in O2.
//   8. a record whose model is "<synthetic>" is a message Claude Code wrote locally with no API call. It is
//      counted (synthetic) and never a request.
//
// Dollars here are reconstructed API-equivalent cost, NOT the subscription's own meter.
// Tier 1 (real quota, logged by the status line) is the number that matters.
//
// Usage:
//   node token-cost.mjs [FROM_DAY TO_DAY] [--project <substring>]... [--project-dir <path>]... [--since <ISO time>]
//                       [--until <ISO time>] [--by-project] [--json]
//   FROM_DAY/TO_DAY are YYYY-MM-DD in SKILLITON_TZ, inclusive. --since is exclusive and --until inclusive, so two
//   windows that share an end count no record twice; the day form and the instant form compose. --project matches the
//   project directory name, case-insensitive, as a substring; repeat it for a union. --project-dir takes a project's
//   path, turns it into the folder name Claude Code files it under (projects.mjs says how, and what was verified), and
//   matches that name exactly, never as a substring; repeat it for a union. With --project-dir alone only those folders
//   are read, and one that does not exist is counted (absent_project_dirs), which is not a failure: a project nobody has
//   opened a session in has no transcripts. Project names are passed on the command line only and never committed.
//
// The transcripts are read from SKILLITON_PROJECTS, else the projects folder inside Claude Code's own folder
// (lib/verify.mjs's claudeConfigDir: CLAUDE_CONFIG_DIR, else ~/.claude).

import { existsSync, readdirSync, statSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { priceTokens } from "./pricing.mjs";
import { folderNameFor, projectsRoot } from "./projects.mjs";

const FIELDS = ["requests", "input", "output", "cache_read", "cache_write_5m", "cache_write_1h"];
const out = (line = "") => process.stdout.write(`${line}\n`);

// A time given with --since or --until, or exit 2 naming it.
function timeArg(name, value) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) { process.stderr.write(`${name} is not a valid time: ${value}\n`); process.exit(2); }
  return ms;
}

function parseMeterArgs(argv) {
  const flag = (k) => argv.includes(k);
  const values = (k) => argv.flatMap((a, i) => (a === k && argv[i + 1] ? [argv[i + 1]] : []));
  const since = values("--since")[0];
  const until = values("--until")[0];
  const valueArgs = new Set(argv.flatMap((a, i) => (["--project", "--project-dir", "--since", "--until"].includes(a) ? [i + 1] : [])));
  const [from, to] = argv.filter((a, i) => !a.startsWith("--") && !valueArgs.has(i));
  return {
    json: flag("--json"), byProject: flag("--by-project"), projects: values("--project").map((p) => p.toLowerCase()),
    folders: [...new Set(values("--project-dir").map(folderNameFor))],
    since, sinceMs: timeArg("--since", since), until, untilMs: timeArg("--until", until), from, to,
  };
}

// cost_all_5m_usd prices every cache write at the 5m rate; the reference figures were established that way.
// peak_context is the one field that is a maximum and never a sum: the largest context a single request carried, which
// is the closest this meter gets to the window a session reached. Output is not in it, because output is what came back
// rather than what went in, and that is also why a later copy of a request (which can only correct the output count)
// never changes it.
const blank = () => ({
  requests: 0, input: 0, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, peak_context: 0, cost_usd: 0, cost_all_5m_usd: 0,
  ttl_unknown_tokens: 0,
});

function newState(opts) {
  return {
    opts,
    root: projectsRoot(),
    tz: process.env.SKILLITON_TZ ?? "America/New_York",
    counters: {
      files: 0, unreadable_files: 0, unreadable_dirs: 0, unparseable_lines: 0, records: 0, distinct: 0, duplicates: 0, no_ids: 0,
      no_timestamp: 0, out_of_window: 0, filtered_project: 0, synthetic: 0, absent_project_dirs: 0,
    },
    unpriced: {}, // model -> requests
    // key -> { output, bucket, cost }: the copy of each request that is counted, so a later copy with a larger output
    // count can correct the bucket it went into (trap 7 above). bucket is null when the copy was not summed.
    chosen: new Map(),
    buckets: {}, // `${day}|${scope}` or `${project}|${scope}`
    // `${scope}|${model}`: token counts only (a row in the committed ledger stores these and prices them when shown).
    models: {},
  };
}

function* walk(dir, counters) {
  let ents = [];
  try { ents = readdirSync(dir); } catch { counters.unreadable_dirs++; return; }
  for (const e of ents) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { counters.unreadable_files++; continue; }
    if (st.isDirectory()) yield* walk(p, counters);
    else if (e.endsWith(".jsonl")) yield p;
  }
}

// A later copy of a counted request: one count per (requestId, message.id); the largest output count wins in the group.
function correctDuplicate(earlier, msg, counters) {
  counters.duplicates++;
  const output = msg.usage.output_tokens ?? 0;
  if (!earlier.bucket || output <= earlier.output) return;
  const delta = output - earlier.output;
  earlier.bucket.output += delta;
  if (earlier.modelBucket) earlier.modelBucket.output += delta;
  if (earlier.price) {
    earlier.bucket.cost_usd += (delta * earlier.price.output) / 1e6;
    earlier.bucket.cost_all_5m_usd += (delta * earlier.price.output) / 1e6;
  }
  earlier.output = output;
}

function tokensOf(u) {
  const cc = u.cache_creation;
  const hasTtl = Boolean(cc && (cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null));
  return {
    hasTtl,
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cache_read: u.cache_read_input_tokens ?? 0,
    // unknown TTL: attributed to 5m, and reported
    cache_write_5m: hasTtl ? (cc.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0),
    cache_write_1h: hasTtl ? (cc.ephemeral_1h_input_tokens ?? 0) : 0,
  };
}

// The day form and the instant form compose: a record is in the window when its day is inside FROM_DAY..TO_DAY (when
// given) and its time is after --since (exclusive) and at or before --until (inclusive), so windows that share an end
// never count a record twice.
function outOfWindow(s, ms) {
  const { from, to, sinceMs, untilMs } = s.opts;
  const day = new Date(ms).toLocaleDateString("en-CA", { timeZone: s.tz }); // YYYY-MM-DD
  const outside = (from && day < from) || (to && day > to) || (sinceMs != null && ms <= sinceMs) || (untilMs != null && ms > untilMs);
  return { day, out: Boolean(outside) };
}

function addRecord(s, rec, file) {
  const msg = rec.message;
  if (!msg || !msg.usage) return;
  const c = s.counters;
  c.records++;
  const reqId = rec.requestId ?? rec.request_id ?? "";
  const msgId = msg.id ?? "";
  if (!reqId && !msgId) { c.no_ids++; return; } // cannot dedup; counted and reported, never summed
  const key = `${reqId}|${msgId}`;
  const earlier = s.chosen.get(key);
  if (earlier) { correctDuplicate(earlier, msg, c); return; }
  const mine = { output: msg.usage.output_tokens ?? 0, bucket: null, price: null, modelBucket: null };
  s.chosen.set(key, mine);
  c.distinct++;

  const ms = Date.parse(rec.timestamp ?? rec.ts ?? "");
  if (Number.isNaN(ms)) { c.no_timestamp++; return; }
  const when = outOfWindow(s, ms);
  if (when.out) { c.out_of_window++; return; }
  if (!file.projectMatch) { c.filtered_project++; return; }

  const model = msg.model ?? "unknown";
  if (model === "<synthetic>") { c.synthetic++; return; } // written locally, no API call, never a request
  const t = tokensOf(msg.usage);
  const priced = priceTokens(model, t);
  if (!priced) s.unpriced[model] = (s.unpriced[model] ?? 0) + 1;

  const b = (s.buckets[`${s.opts.byProject ? file.project : when.day}|${file.scope}`] ??= blank());
  mine.bucket = b;
  mine.price = priced?.rates ?? null;
  b.requests++;
  b.peak_context = Math.max(b.peak_context, t.input + t.cache_read + t.cache_write_5m + t.cache_write_1h);
  for (const f of FIELDS.slice(1)) b[f] += t[f];
  b.cost_usd += priced?.cost ?? 0;
  b.cost_all_5m_usd += priced?.cost5m ?? 0;
  if (!t.hasTtl) b.ttl_unknown_tokens += t.cache_write_5m;
  addToModel(s, mine, file.scope, model, t);
}

// The same request counted once more, per scope and model, with token counts only.
function addToModel(s, mine, scope, model, t) {
  const m = (s.models[`${scope}|${model}`] ??= { requests: 0, input: 0, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, peak_context: 0 });
  mine.modelBucket = m;
  m.requests++;
  m.peak_context = Math.max(m.peak_context, t.input + t.cache_read + t.cache_write_5m + t.cache_write_1h);
  for (const f of FIELDS.slice(1)) m[f] += t[f];
}

// Which folders to walk. --project-dir alone reads only its folders, by exact name; anything else walks everything
// and filters record by record, so filtered_project keeps counting what a --project filter left out.
function* transcriptFiles(s) {
  const { projects, folders } = s.opts;
  if (!folders.length || projects.length) { yield* walk(s.root, s.counters); return; }
  for (const name of folders) {
    const dir = join(s.root, name);
    if (!existsSync(dir)) { s.counters.absent_project_dirs++; continue; }
    yield* walk(dir, s.counters);
  }
}

function matchesProject(s, project) {
  const { projects, folders } = s.opts;
  if (!projects.length && !folders.length) return true;
  return folders.includes(project) || projects.some((p) => project.toLowerCase().includes(p));
}

async function scanFile(s, path) {
  const project = path.slice(s.root.length + 1).split("/")[0];
  const file = { project, scope: path.includes("/subagents/") ? "subagent" : "top", projectMatch: matchesProject(s, project) };
  s.counters.files++;
  let rl;
  try {
    rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.includes('"usage"')) continue; // records without the key cannot carry usage
      let rec; try { rec = JSON.parse(line); } catch { s.counters.unparseable_lines++; continue; }
      addRecord(s, rec, file);
    }
  } catch (e) {
    s.counters.unreadable_files++;
    process.stderr.write(`UNREADABLE: ${path.slice(s.root.length + 1)}: ${e.message}\n`);
  } finally {
    rl?.close();
  }
}

const round = (x) => Math.round(x * 1e9) / 1e9;
const isIncomplete = (s) => Object.keys(s.unpriced).length > 0 || s.counters.unreadable_files > 0 || s.counters.unreadable_dirs > 0;

function jsonReport(s) {
  const byScope = {};
  for (const [k, b] of Object.entries(s.buckets)) {
    const sc = (byScope[k.split("|")[1]] ??= blank());
    for (const f of [...FIELDS, "cost_usd", "cost_all_5m_usd", "ttl_unknown_tokens"]) sc[f] += b[f];
    sc.peak_context = Math.max(sc.peak_context, b.peak_context);
  }
  for (const sc of Object.values(byScope)) { sc.cost_usd = round(sc.cost_usd); sc.cost_all_5m_usd = round(sc.cost_all_5m_usd); }
  const byScopeModel = {};
  for (const [k, m] of Object.entries(s.models)) {
    const [scope, model] = k.split("|");
    (byScopeModel[scope] ??= {})[model] = m;
  }
  const { from, to, since, until, projects, folders } = s.opts;
  // project_dirs is a count and never the names: a folder name spells out a path on this machine.
  return {
    ...s.counters, tz: s.tz, window: { from: from ?? null, to: to ?? null, since: since ?? null, until: until ?? null }, projects,
    project_dirs: folders.length, byScopeModel,
    unpriced_models: s.unpriced, incomplete: isIncomplete(s), byScope,
  };
}

function tableReport(s) {
  const c = s.counters;
  const { byProject, since, until, projects, folders } = s.opts;
  const ratio = (c.records / Math.max(c.distinct, 1)).toFixed(2);
  out(`files=${c.files} records=${c.records} distinct=${c.distinct} duplicates=${c.duplicates} dedup_ratio=${ratio}x tz=${s.tz}`
    + `${since ? ` since=${since}` : ""}${until ? ` until=${until}` : ""}${projects.length ? ` projects=${projects.length} filter(s)` : ""}`
    + `${folders.length ? ` project_dirs=${folders.length} (${c.absent_project_dirs} absent)` : ""}`);
  out(`not summed: no_ids=${c.no_ids} no_timestamp=${c.no_timestamp} unparseable_lines=${c.unparseable_lines} unreadable_files=${c.unreadable_files}`
    + ` out_of_window=${c.out_of_window} filtered_project=${c.filtered_project} synthetic=${c.synthetic}`);
  const width = byProject ? 40 : 10;
  out(`${(byProject ? "project" : "day").padEnd(width)} scope     requests     input    output  cache_read     cw_5m     cw_1h   peak_ctx   est_usd`);
  let grand = 0, ttlUnknown = 0;
  for (const k of Object.keys(s.buckets).sort()) {
    const [label, scope] = k.split("|");
    const b = s.buckets[k];
    grand += b.cost_usd; ttlUnknown += b.ttl_unknown_tokens;
    const cells = [[b.requests, 8], [b.input, 9], [b.output, 9], [b.cache_read, 11], [b.cache_write_5m, 9], [b.cache_write_1h, 9], [b.peak_context, 10]];
    out(`${label.padEnd(width)} ${scope.padEnd(9)} ${cells.map(([v, w]) => String(v).padStart(w)).join(" ")} ${b.cost_usd.toFixed(2).padStart(9)}`);
  }
  if (ttlUnknown) out(`NOTE: ${ttlUnknown} cache-write tokens had no TTL breakdown and were priced at the 5m rate`);
  if (Object.keys(s.unpriced).length) out(`UNPRICED MODELS (requests counted, cost omitted): ${JSON.stringify(s.unpriced)}`);
  const warn = isIncomplete(s) ? "  INCOMPLETE: see unpriced models or unreadable files above; do not quote this" : "";
  out(`TOTAL est_usd=${grand.toFixed(2)}  (reconstructed API-equivalent, not the subscription meter)${warn}`);
}

async function main() {
  const s = newState(parseMeterArgs(process.argv.slice(2)));
  for (const path of transcriptFiles(s)) await scanFile(s, path);
  if (s.opts.json) out(JSON.stringify(jsonReport(s)));
  else tableReport(s);
}

await main();
