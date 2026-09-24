// usage-ledger.mjs: the committed record of what each batch used, .skilliton/usage/ledger.jsonl, one JSON object per
// line.
//
// Why a committed file: the transcripts the meter reads are on one machine and expire (Claude Code keeps them for a
// limited time), so a figure that exists only in them is gone for everyone else and, later, for this machine too. A
// row here is what another machine, or next month, can still read.
//
// Two kinds of row:
//
//   batch   one batch, written by `skilliton maintain --apply` just before it records its maintain event, so the
//           row's window ends at that event and the next row starts exactly there: from, to, from_basis (what the start
//           was taken from), its boundaries (tasks closed, merges, maintain events), and per scope the token counts
//           and peak context in total and per model, the meter's counters, incomplete, and the unpriced models.
//   screen  the usage screen's own readings as a person read them (skilliton usage screen).
//
// What a row never holds: a dollar figure, and a Claude Code project folder name. A cost is worked out when a row is
// shown, from the meter's price table (runtime/meter/pricing.mjs), and the display names the table's retrieval date; a
// folder name spells out a path on one machine and is never written into a repository. An append that would write a
// key shaped like money is refused, as is one for a window already in the ledger, one that would leave a gap or an
// overlap, and one made without the meter's own test having passed in the same run.

import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { runGit } from "./journal.mjs";
import {
  RECONSTRUCTION_NOTE, collectBoundaries, findMeter, foldModels, laneFigures, laneFolderOf, localTime, meterWindow, proveMeter, usageScope,
} from "./usage.mjs";
import { PRICING_RETRIEVED } from "../meter/pricing.mjs";

export const LEDGER_REL = ".skilliton/usage/ledger.jsonl";
const MAX_LEDGER_BYTES = 16 * 1024 * 1024;
const TOKEN_KEYS = ["requests", "input", "output", "cache_read", "cache_write_5m", "cache_write_1h", "peak_context"];
const COUNTER_KEYS = [
  "files", "records", "distinct", "duplicates", "no_ids", "no_timestamp", "unparseable_lines", "unreadable_files", "unreadable_dirs",
  "out_of_window", "filtered_project", "synthetic", "absent_project_dirs",
];
// A key naming money as one of its words: cost_usd, est_usd, price, dollars. unpriced_models is a list of names and
// does not match.
const MONEY_KEY = /(^|_)(cost|usd|price|dollars?)(_|$)/i;
const TASK_FILE_RE = /(^|\/)\d{4}-\d{2}-\d{2}-[a-z0-9-]+-[0-9a-f]{4}\.md$/;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// { path, exists, rows (file order), corrupt }. A line that is not a batch or screen row is counted, never used.
export function readLedger(root) {
  const path = join(root, LEDGER_REL);
  if (!existsSync(path)) return { path, exists: false, rows: [], corrupt: 0 };
  const text = readFileSync(path, "utf8");
  if (Buffer.byteLength(text) > MAX_LEDGER_BYTES) throw new Error(`${LEDGER_REL} is over ${MAX_LEDGER_BYTES} bytes and is not read`);
  const rows = [];
  let corrupt = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let row = null;
    try { row = JSON.parse(line); } catch { row = null; }
    if (isObject(row) && (row.kind === "batch" || row.kind === "screen")) rows.push(row); else corrupt++;
  }
  return { path, exists: true, rows, corrupt };
}

const batchRowsOf = (ledger) => ledger.rows.filter((r) => r.kind === "batch");

// The keys of an object tree that look like money: the check behind "a row stores token counts and never a dollar
// figure", run on every row before it is written.
function moneyKeys(value, at = "") {
  if (Array.isArray(value)) return value.flatMap((v, i) => moneyKeys(v, `${at}[${i}]`));
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([k, v]) => [...(MONEY_KEY.test(k) ? [`${at}${k}`] : []), ...moneyKeys(v, `${at}${k}.`)]);
}

// Why a batch row cannot follow the rows already there, or null when it can.
export function appendProblem(rows, row) {
  const batches = rows.filter((r) => r.kind === "batch");
  const start = row.from ?? "(earliest)";
  if (batches.some((r) => r.from === row.from && r.to === row.to)) return `a row for the window ${start}..${row.to} is already in ${LEDGER_REL}`;
  const last = batches.at(-1) ?? null;
  if (last && row.from !== last.to) return `the row would start at ${start}, and the last row ends at ${last.to}; rows must tile without a gap or an overlap`;
  if (row.from !== null && Date.parse(row.to) <= Date.parse(row.from)) return `the row ends at ${row.to}, which is not after its start ${row.from}`;
  return null;
}

// Appends one row: { written, refused, path }. A batch row needs `proof`, the answer of proveMeter in this same run;
// without it nothing is written. Throws only when the file cannot be written.
export function appendLedgerRow(root, row, { proof = null } = {}) {
  const path = join(root, LEDGER_REL);
  const refused = (why) => ({ written: false, refused: `${why}. Nothing was written`, path });
  const money = moneyKeys(row);
  if (money.length) return refused(`the row carries ${money.join(", ")}, and a ledger row stores token counts, never a dollar figure`);
  const ledger = readLedger(root);
  if (row.kind === "batch") {
    if (!proof) return refused("the meter's own test has not passed in this run, so no figure from it is written");
    const problem = appendProblem(ledger.rows, row);
    if (problem) return refused(problem);
  }
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${endsClean(path) ? "" : "\n"}${JSON.stringify(row)}\n`);
  return { written: true, refused: null, path };
}

// Whether the file is absent, empty, or ends with a newline, so a line cut short by a crash never swallows the next row.
function endsClean(path) {
  if (!existsSync(path)) return true;
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    if (!size) return true;
    const last = Buffer.alloc(1);
    readSync(fd, last, 0, 1, size - 1);
    return last[0] === 0x0a;
  } finally {
    closeSync(fd);
  }
}

// A batch row from the meter's --json answer. Token counts and the counters only: nothing priced, no folder name, no
// path. Merges keep their commit id and time (the subject is in git), tasks their id, state and close time.
export function batchRowFromMeter(parsed, { from, to, fromBasis, boundaries, lanes = [] }) {
  const scopes = {};
  for (const [scope, totals] of Object.entries(parsed.byScope ?? {})) {
    const models = {};
    for (const [model, counts] of Object.entries(parsed.byScopeModel?.[scope] ?? {})) {
      models[model] = Object.fromEntries(TOKEN_KEYS.map((k) => [k, Number(counts?.[k] ?? 0)]));
    }
    scopes[scope] = { ...Object.fromEntries(TOKEN_KEYS.map((k) => [k, Number(totals?.[k] ?? 0)])), models };
  }
  return {
    kind: "batch", from, to, from_basis: fromBasis,
    boundaries: {
      tasks: boundaries.filter((b) => b.kind === "task").map((b) => ({ id: b.id, state: b.state, at: b.at })),
      merges: boundaries.filter((b) => b.kind === "merge").map((b) => ({ sha: b.sha, at: b.at })),
      maintains: boundaries.filter((b) => b.kind === "maintain").map((b) => ({ at: b.at })),
    },
    scope: "repository",
    scopes,
    counters: Object.fromEntries(COUNTER_KEYS.map((k) => [k, Number(parsed[k] ?? 0)])),
    incomplete: Boolean(parsed.incomplete),
    unpriced_models: Object.keys(parsed.unpriced_models ?? {}).sort(),
    lanes,
  };
}

// A stored batch row in the shape the scorecard prints, priced now from the table. source says whether the line is
// in the last commit.
export function displayRow(row, source) {
  const at = (iso) => Date.parse(iso);
  const b = row.boundaries ?? {};
  const byScopeModel = Object.fromEntries(Object.entries(row.scopes ?? {}).map(([scope, v]) => [scope, v.models ?? {}]));
  return {
    from: row.from, to: row.to, source,
    tasks: (b.tasks ?? []).map((t) => ({ kind: "task", ...t, ms: at(t.at) })),
    merges: (b.merges ?? []).map((m) => ({ kind: "merge", ...m, shortSha: String(m.sha ?? "").slice(0, 12), subject: "", ms: at(m.at) })),
    maintains: (b.maintains ?? []).map((m) => ({ kind: "maintain", ...m, ms: at(m.at) })),
    folded: foldModels(byScopeModel, { incomplete: Boolean(row.incomplete), unpriced: row.unpriced_models ?? [] }),
  };
}

// The ledger's lines as they are in HEAD, so a row can say whether it is committed. An empty set when HEAD has no
// ledger, or no HEAD at all.
function committedLines(root) {
  const r = runGit(root, ["show", `HEAD:${LEDGER_REL}`]);
  return new Set(r.status === 0 ? r.stdout.split("\n").map((l) => l.trim()).filter(Boolean) : []);
}

// The ledger's batch rows in file order, each marked with whether its line is in the last commit.
export function ledgerDisplayRows(root) {
  const ledger = readLedger(root);
  const committed = committedLines(root);
  const rows = [];
  for (const raw of ledger.exists ? readFileSync(ledger.path, "utf8").split("\n") : []) {
    const line = raw.trim();
    let row = null;
    try { row = line ? JSON.parse(line) : null; } catch { row = null; }
    if (isObject(row) && row.kind === "batch") rows.push(displayRow(row, committed.has(line) ? "ledger-committed" : "ledger-uncommitted"));
  }
  return { ledger, rows };
}

// Where the next batch row starts: { from, basis }. After the last ledger row when there is one. For the first row, the
// earliest transcript (from null) when this machine has a journal; with no journal, the time the first task record
// was added to the repository, which is the earliest this project can say its work began; and when there is none of
// those, the earliest transcript again. The row carries the basis, so a reader knows which it was.
function nextRowStart(root, project, { ledger, journal }) {
  const last = batchRowsOf(ledger).at(-1) ?? null;
  if (last) return { from: last.to, basis: "last ledger row" };
  if (journal.exists) return { from: null, basis: "earliest transcript" };
  const first = [...taskStarts(root, project).values()].sort()[0] ?? null;
  return first ? { from: first, basis: "first task record" } : { from: null, basis: "earliest transcript" };
}

// When each task record was first committed: Map of repository-relative path to an ISO time. One git call; a record
// that was never committed has no entry. The folder's README is not a task record and is left out.
export function taskStarts(root, project) {
  const r = runGit(root, ["log", "--diff-filter=A", "--reverse", "--format=@%cI", "--name-only", "--", project.directories.tasks]);
  const starts = new Map();
  let when = null;
  for (const raw of r.status === 0 ? r.stdout.split("\n") : []) {
    const line = raw.trim();
    if (line.startsWith("@")) { when = Date.parse(line.slice(1)); continue; }
    if (!TASK_FILE_RE.test(line) || Number.isNaN(when) || starts.has(line)) continue;
    starts.set(line, new Date(when).toISOString());
  }
  return starts;
}

// The lanes whose task closed as merged in the window, each with its own folder's figures: the lane's name only, never
// its folder or the folder name its transcripts are filed under.
function closedLanes(root, project, meter, boundaries, env) {
  const out = [];
  for (const b of boundaries) {
    if (b.kind !== "task" || b.state !== "merged") continue;
    const lane = laneFolderOf(root, project, b);
    if (!lane) continue;
    const f = laneFigures(meter, lane.dir, env);
    out.push({ lane: lane.name, ...Object.fromEntries([...TOKEN_KEYS, "incomplete"].map((k) => [k, f[k]])) });
  }
  return out;
}

// The maintain step: one batch row for the window since the last row, ending at `at`, the maintain event's own time.
// Returns a maintain step { name, status, detail }. It never throws for the meter's sake: a meter that cannot be
// believed or read is a step that did not run, and maintenance carries on.
export function ledgerStep(project, { root, apply, at, env = process.env }) {
  const name = "usage ledger";
  const step = (status, detail) => ({ name, status, detail });
  let found, start;
  try {
    found = collectBoundaries(root, project);
    start = nextRowStart(root, project, { ledger: readLedger(root), journal: found.journal });
  } catch (e) {
    return step("not run", e?.message ?? String(e));
  }
  const window = `${start.from ?? `(the ${start.basis})`}..${at}`;
  if (!apply) return step("would write", `a batch row for ${window} in ${LEDGER_REL}, once the meter's own test passes`);
  let proof, parsed, meter;
  try {
    const scope = usageScope(root, project);
    meter = findMeter(root, null, { env });
    proof = proveMeter(meter);
    parsed = meterWindow(meter, { since: start.from, until: at, scope, env });
  } catch (e) {
    return step("refused", `${String(e?.message ?? e).replace(/\s*\n\s*/g, "; ")}; no row was written`);
  }
  const requests = Object.values(parsed.byScope ?? {}).reduce((n, s) => n + Number(s?.requests ?? 0), 0);
  if (!requests) return step("current", `no request in ${window}; nothing written, and the next row starts where this one would have`);
  const inWindow = found.boundaries.filter((b) => (start.from === null || b.ms > Date.parse(start.from)) && b.ms <= Date.parse(at));
  const boundaries = [...inWindow, { kind: "maintain", at, ms: Date.parse(at) }];
  let lanes;
  try {
    lanes = closedLanes(root, project, meter, inWindow, env);
  } catch (e) {
    return step("not run", `a lane's figures could not be read: ${e?.message ?? e}; no row was written`);
  }
  const row = batchRowFromMeter(parsed, { from: start.from, to: at, fromBasis: start.basis, boundaries, lanes });
  const done = appendLedgerRow(root, row, { proof });
  if (!done.written) return step("refused", done.refused);
  return step("wrote", `a batch row for ${window} (${requests} request(s)) in ${LEDGER_REL}; commit it with the maintenance`);
}

// ---------- the usage screen's readings, and the summary ----------

const SCREEN_OPTIONS = [["five_hour", "--five-hour", true], ["weekly", "--weekly", true], ["model_weekly", "--model-weekly", false]];

// A screen row from what a person read off the usage screen: { row } or { problem }. Each reading is a whole number
// from 0 to 100, as the screen shows it; --at is when it was read, and defaults to now.
export function screenRow(given, { now = new Date() } = {}) {
  const row = { kind: "screen", at: null };
  for (const [key, option, required] of SCREEN_OPTIONS) {
    const value = given[key];
    if (value === undefined) {
      if (required) return { problem: `${option} is needed: the reading the usage screen shows, a whole number from 0 to 100` };
      row[key] = null;
      continue;
    }
    if (!/^\d{1,3}$/.test(String(value)) || Number(value) > 100) {
      return { problem: `${option} takes a whole number from 0 to 100 (got ${JSON.stringify(value)})` };
    }
    row[key] = Number(value);
  }
  const at = given.at === undefined ? now.getTime() : Date.parse(given.at);
  if (Number.isNaN(at)) return { problem: `--at takes a date and time (got ${JSON.stringify(given.at)})` };
  row.at = new Date(at).toISOString();
  return { row };
}

const tokenTotal = (f) => f.total.input + f.total.output + f.total.cache_read + f.total.cache_write_5m + f.total.cache_write_1h;

function spanFigures(rows) {
  const tokens = rows.reduce((n, r) => n + tokenTotal(r.folded), 0);
  const cost = rows.reduce((n, r) => n + r.folded.total.cost_usd, 0);
  return { batches: rows.length, tokens, cost, perBatch: rows.length ? tokens / rows.length : null, incomplete: rows.some((r) => r.folded.incomplete) };
}

// The meter's per-batch trend: tokens per batch this period against the baseline. down is null when either side has no
// batch, because there is then nothing comparable.
export function meterTrend(periodRows, baselineRows) {
  const period = spanFigures(periodRows);
  const baseline = spanFigures(baselineRows);
  if (!period.batches || !baseline.batches) {
    return { period, baseline, down: null, why: `no comparable batch ${period.batches ? "in the baseline" : "in this period"}` };
  }
  return { period, baseline, down: period.perBatch < baseline.perBatch, why: null };
}

// The usage screen's trend: the latest reading against the one before it. down only when every reading both rows carry
// went down; null, with what is missing, when there are not two readings.
export function screenTrend(screens) {
  const sorted = [...screens].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (sorted.length < 2) {
    const missing = `${sorted.length} usage screen reading(s) filed; two are needed to see a direction`;
    return { previous: sorted[0] ?? null, latest: null, down: null, missing };
  }
  const [previous, latest] = sorted.slice(-2);
  const keys = SCREEN_OPTIONS.map(([k]) => k).filter((k) => Number.isFinite(previous[k]) && Number.isFinite(latest[k]));
  return { previous, latest, down: keys.every((k) => latest[k] < previous[k]), keys, missing: null };
}

// The one line that may say saved: only when the meter and the screen both went down. It never carries an amount.
function verdictLine(meter, screen) {
  if (screen.missing) return `verdict: not established: a usage screen reading is missing (${screen.missing})`;
  if (meter.down === null) return `verdict: not established: the meter has ${meter.why}`;
  if (meter.down && screen.down) {
    return "verdict: saved. The meter's tokens per batch and the usage screen's readings both went down over this period; no amount is claimed";
  }
  if (meter.down !== screen.down) {
    return `verdict: not established: the meter and the usage screen disagree (the meter ${meter.down ? "went down" : "did not go down"}, `
      + `the screen ${screen.down ? "went down" : "did not go down"})`;
  }
  return "verdict: not established: neither the meter's tokens per batch nor the usage screen's readings went down";
}

// Start to close for each task closed in the period: { closed, timed, median, longest: { id, ms } | null, untimed }.
export function taskTimes(tasks, starts, relOf, { sinceMs, untilMs }) {
  const closed = tasks.filter((t) => ["merged", "done-local", "released", "verified"].includes(t.state)
    && Date.parse(t.updated) > sinceMs && Date.parse(t.updated) <= untilMs);
  const timed = closed.flatMap((t) => {
    const start = starts.get(relOf(t.id));
    return start ? [{ id: t.id, ms: Date.parse(t.updated) - Date.parse(start) }] : [];
  }).sort((a, b) => a.ms - b.ms);
  const mid = Math.floor(timed.length / 2);
  const median = !timed.length ? null : timed.length % 2 ? timed[mid].ms : (timed[mid - 1].ms + timed[mid].ms) / 2;
  return { closed: closed.length, timed: timed.length, median, longest: timed.at(-1) ?? null, untimed: closed.length - timed.length };
}

// The controlled comparison filed under evidence/comparison/<date>/results.jsonl, newest date, as one line per task and
// arm; or the line that says there is none.
export function comparisonLines(root) {
  const base = join(root, "evidence", "comparison");
  const dates = existsSync(base) ? readdirSync(base).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && existsSync(join(base, d, "results.jsonl"))).sort() : [];
  if (!dates.length) return ["no controlled comparison filed"];
  const date = dates.at(-1);
  const groups = new Map();
  for (const line of readFileSync(join(base, date, "results.jsonl"), "utf8").split("\n")) {
    let r = null;
    try { r = line.trim() ? JSON.parse(line) : null; } catch { r = null; }
    if (!isObject(r)) continue;
    const key = `task ${r.task ?? "?"}, arm ${r.arm ?? "?"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const med = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
  const lines = [`controlled comparison filed ${date} (evidence/comparison/${date}/results.jsonl), one line per task and arm:`];
  for (const [key, runs] of [...groups.entries()].sort()) {
    const ok = runs.filter((r) => r.measured?.success === true).length;
    const unknown = runs.filter((r) => r.measured?.success == null).length;
    lines.push(`  ${key}: ${runs.length} run(s), median input tokens ${med(runs.map((r) => r.measured?.inputTokens)) ?? "unknown"}, `
      + `median output tokens ${med(runs.map((r) => r.measured?.outputTokens)) ?? "unknown"}, succeeded ${ok}, success unknown ${unknown}`);
  }
  return lines;
}

const num = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const hours = (ms) => `${(ms / 3600000).toFixed(1)} hours`;

function spanLine(label, f) {
  if (!f.batches) return `  ${label}: no batch`;
  const warn = f.incomplete ? "; INCOMPLETE, a model the table does not price is in it" : "";
  return `  ${label}: ${f.batches} batch(es), ${num(f.tokens)} tokens, est usd ${f.cost.toFixed(2)}, ${num(f.perBatch)} tokens per batch${warn}`;
}

function readingText(r, tz) {
  const parts = [`five-hour ${r.five_hour} of 100`, `weekly ${r.weekly} of 100`];
  if (Number.isFinite(r.model_weekly)) parts.push(`model weekly ${r.model_weekly} of 100`);
  return `${localTime(r.at, tz)}: ${parts.join(", ")}`;
}

function screenLines(screen, tz) {
  if (screen.missing) return [`usage screen: ${screen.missing}${screen.previous ? `; the one filed: ${readingText(screen.previous, tz)}` : ""}`];
  return [
    `usage screen, the two latest readings: ${readingText(screen.previous, tz)}`,
    `                                  then ${readingText(screen.latest, tz)}: ${screen.down ? "went down" : "did not go down"}`,
  ];
}

// The summary, as lines. The verdict line is the only one that can carry the word saved, and no line carries an amount
// saved: the figures are this period's and the baseline's, side by side, each with the date or window it belongs to.
export function describeSummary({ periodLabel, baselineLabel, meter, screen, tasks, events, comparison, tz }) {
  const out = [`period: ${periodLabel}`, `baseline: ${baselineLabel}`];
  out.push(`figures in tokens, and est usd priced from the meter's table retrieved ${PRICING_RETRIEVED}:`);
  out.push(spanLine("this period", meter.period), spanLine("baseline", meter.baseline));
  const trend = meter.down === null ? `not comparable (${meter.why})` : meter.down ? "went down" : "did not go down";
  out.push(`meter trend: tokens per batch ${trend}`);
  out.push(...screenLines(screen, tz));
  const t = tasks;
  out.push(t.timed
    ? `tasks closed in the period: ${t.closed}; start to close, for ${t.timed} with a committed start: median ${hours(t.median)}, `
      + `longest ${hours(t.longest.ms)} (${t.longest.id})${t.untimed ? `; ${t.untimed} without a committed start` : ""}`
    : `tasks closed in the period: ${t.closed}${t.closed ? ", none with a committed start to time from" : ""}`);
  const unread = events.unreadable_files + events.unparseable_lines;
  out.push(`in the period: ${events.gate_runs} skilliton gate run(s), ${events.read_refusals} read(s) refused by the read guard, `
    + `${events.compactions} compaction(s) (${events.compactions_auto} automatic)${unread ? `; ${unread} file(s) or line(s) could not be read` : ""}`);
  out.push(...comparison, verdictLine(meter, screen), "", RECONSTRUCTION_NOTE);
  return out;
}
