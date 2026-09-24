// usage.mjs: reading this machine's own transcripts through the meter, grouped by the batches that merged.
//
// Nothing here prices anything or reads a transcript. The meter does all of that: the plugin's own
// (runtime/meter/token-cost.mjs, beside this folder), or a project's scripts/token-cost.mjs when that file speaks the
// same contract. This file finds it, refuses to believe it until its own test has passed in this run, works out the
// window each merged batch covers, and turns the meter's JSON into rows.
//
// A batch ends at a boundary, and there are three kinds, because a merge commit alone misses most of them: a
// repository that fast-forwards, or commits straight to its integration branch, makes no merge commit at all.
//
//   maintain  a maintain event in this machine's journal (lib/journal.mjs; the journal lives under the Git folder, so it
//             is one machine's and is never committed)
//   task      a task record whose State is merged, done-local, released or verified, at its Updated time
//   merge     a merge commit on the current branch, at its committer time
//
// A row runs from the instant the previous row ended (exclusive) to the latest boundary it names (inclusive), and the
// meter is asked for exactly that span with --since and --until, so rows tile time with no gap and no overlap.
// Boundaries inside the same clock minute are one row naming all of them: a merge, the task it closed and the
// maintenance after it are one piece of work, and splitting them would make rows of a few seconds each. The oldest row
// has no lower bound, and says so rather than inventing a start.
//
// Every figure is reconstructed from local transcripts. It is not a bill. PLAN.md sections 6 and 8 govern any number
// that leaves this repository, and nothing here may be turned into a sentence about savings.

import { existsSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { refuse, runProgram, tilde } from "./core.mjs";
import { OperationFailed } from "./prepare.mjs";
import { readJournal, runGit } from "./journal.mjs";
import { listTasks } from "./tasks.mjs";
import { PRICING_RETRIEVED, priceTokens } from "../meter/pricing.mjs";

const DEFAULT_METER = join("scripts", "token-cost.mjs");
const METER_TEST = "token-cost.test.mjs";
// The meter this plugin ships, found from this file's own folder, so it is the one beside the running runtime and never
// one a project put somewhere on a path.
export const PLUGIN_METER = join(dirname(fileURLToPath(import.meta.url)), "..", "meter", "token-cost.mjs");
// What a meter's --json output must carry to be believed as this contract: the four keys every row is built from, and
// the two that show it reads --project-dir and --since. A meter from before those flags would take their values for
// FROM_DAY and TO_DAY and answer a different window without a word, so it is not believed either.
const CONTRACT_KEYS = ["byScope", "tz", "incomplete", "unpriced_models", "project_dirs"];
const METER_TIMEOUT_MS = 300000;
const TEST_TIMEOUT_MS = 120000;
export const DEFAULT_LIMIT = 12;
export const MAX_LIMIT = 200;
const DEFAULT_TZ = "America/New_York";

// The footer under every scorecard, and the same paragraph in the command's help. It is written to be quoted whole:
// a figure that travels without it reads as a bill, which is exactly what it is not. It is deliberately written
// without the words a comparison would use, so a check for one has nothing of its own to trip over.
export const RECONSTRUCTION_NOTE = [
  "Every figure above is reconstructed from this machine's own transcripts. It is not a bill, and it is not the",
  "subscription's own meter: the usage screen is the only real one, and no number here leaves this repository",
  "without being checked against it. A comparison between two spans is drawn only by the summary's verdict line,",
  "and only when the usage screen's own readings agree with it.",
].join("\n");

// The timezone the meter buckets by. It reads the same variable with the same default, and the first result is
// checked against what the meter reports, so a disagreement is a failure and never a quietly wrong window.
export const meterTz = (env = process.env) => env.SKILLITON_TZ ?? DEFAULT_TZ;

// The one place a meter is started. runProgram by name, never through an injected function: scripts/allowlist.test.mjs
// reads this file for the programs it starts, and it follows named callees. A start it cannot see is one
// docs/IT-ALLOWLIST.md would not carry, which is the hole that check exists to close.
function runMeter(path, args, env) {
  return runProgram(process.execPath, [path, ...args], METER_TIMEOUT_MS, { env });
}

function parseMeterJson(r, where) {
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { parsed = null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new OperationFailed(`the meter's --json output for ${where} is not one JSON object, so nothing is reported from it`);
  }
  return parsed;
}

// Asks a meter for an empty window and names every contract key its answer lacks ([] when it speaks the contract). The
// transcripts folder is pointed at one that does not exist, so the question costs nothing on a machine with years of
// transcripts; a meter that ignores SKILLITON_PROJECTS still answers, only more slowly.
function probeContract(path, root, env = process.env) {
  const probeEnv = { ...env, SKILLITON_PROJECTS: join(root, ".skilliton", "usage", "no-transcripts-here") };
  const r = runMeter(path, ["1970-01-01", "1970-01-01", "--json"], probeEnv);
  if (!r.ok) return [`an answer at all (${r.failure})`];
  let parsed;
  try { parsed = JSON.parse(r.stdout.trim().split("\n").pop()); } catch { return ["a JSON object on its last line of output"]; }
  if (!parsed || typeof parsed !== "object") return ["a JSON object on its last line of output"];
  const missing = CONTRACT_KEYS.filter((k) => !(k in parsed));
  if (!parsed.window || typeof parsed.window !== "object" || !("since" in parsed.window)) missing.push("window.since");
  return missing;
}

const testBeside = (path) => join(dirname(path), METER_TEST);
const pluginMeter = (notice = null) => ({ path: PLUGIN_METER, test: testBeside(PLUGIN_METER), source: "plugin", notice });

// The meter and the test that stands behind it: { path, test, source: "override" | "project" | "plugin", notice }.
// The plugin's meter is the default. A project's own scripts/token-cost.mjs is used only when it has its test beside
// it and speaks the contract; otherwise the notice says what it lacked and names the plugin meter used instead. An
// override (--meter, a file or the folder holding it) is refused outright when it falls short, because a person asked
// for that one by name.
export function findMeter(root, override = null, { env = process.env } = {}) {
  if (override) {
    const given = isAbsolute(override) ? override : resolve(root, override);
    const path = existsSync(given) && statSync(given).isDirectory() ? join(given, "token-cost.mjs") : given;
    if (!existsSync(path)) refuse(`--meter names ${path}, which does not exist. Nothing was written.`);
    if (!existsSync(testBeside(path))) {
      refuse(`the meter at ${path} has no test beside it (${METER_TEST}), and a number from a meter whose own test has never run is `
        + "not reported here. Put the test beside the meter, or do not use this command. Nothing was written.");
    }
    const missing = probeContract(path, root, env);
    if (missing.length) refuse(`the meter at ${path} does not speak the meter's contract: its --json answer lacks ${missing.join(", ")}. Nothing was written.`);
    return { path, test: testBeside(path), source: "override", notice: null };
  }
  const own = join(root, DEFAULT_METER);
  if (!existsSync(own)) return pluginMeter();
  const instead = `so the plugin's meter is used instead: ${tilde(PLUGIN_METER)}`;
  if (!existsSync(testBeside(own))) return pluginMeter(`this project's ${DEFAULT_METER} has no ${METER_TEST} beside it, ${instead}`);
  const missing = probeContract(own, root, env);
  if (missing.length) {
    return pluginMeter(`this project's ${DEFAULT_METER} does not speak the meter's contract (its --json answer lacks ${missing.join(", ")}), ${instead}`);
  }
  return { path: own, test: testBeside(own), source: "project", notice: null };
}

// Run the meter's test now, in this run. Not "has it ever been run": a meter is believed because its test passed a
// moment ago on this checkout, which is the only form of that claim a command can make honestly.
export function proveMeter(meter) {
  // runProgram by name here too, for the reason runMeter gives.
  const r = runProgram(process.execPath, [meter.test], TEST_TIMEOUT_MS);
  if (!r.ok) {
    const tail = [...r.stdout.split("\n"), ...r.stderr.split("\n")].map((l) => l.trim()).filter(Boolean).slice(-5);
    const why = tail.length ? `\n  ${tail.join("\n  ")}` : "";
    throw new OperationFailed(`the meter's own test failed (${r.failure}), so nothing it reports is printed: ${meter.test}${why}`);
  }
  const summary = r.stdout.trim().split("\n").filter(Boolean).pop() ?? "passed";
  return { test: meter.test, summary: summary.length > 120 ? `${summary.slice(0, 120)} ...` : summary };
}

// The task states that end a piece of work, and so end a batch. abandoned is closed too, but nothing was delivered by
// it, so it bounds nothing.
const BATCH_TASK_STATES = ["merged", "done-local", "released", "verified"];

function instant(iso, what) {
  const ms = Date.parse(iso ?? "");
  if (Number.isNaN(ms)) throw new OperationFailed(`${what} this command cannot read: ${JSON.stringify(iso)}`);
  return ms;
}

// The merge commits git reported, newest first: [{ sha, shortSha, at, subject }]. The fields arrive NUL separated so
// a subject carrying anything at all cannot be mistaken for a field boundary.
export function parseMerges(stdout) {
  return stdout.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [sha, at, ...rest] = line.split("\u0000");
    return { sha, shortSha: (sha ?? "").slice(0, 12), at, subject: rest.join(" ") };
  });
}

// Every boundary, oldest first: { kind, at (ISO), ms, ... }. maintains are journal events, tasks are task records
// (lib/tasks.mjs), merges come from parseMerges. A time that cannot be read is a failure, never a guess.
export function batchBoundaries({ maintains = [], tasks = [], merges = [] }) {
  const out = [];
  for (const e of maintains) {
    if (e.event !== "maintain") continue;
    out.push({ kind: "maintain", at: e.at, ms: instant(e.at, "the journal holds a maintain event time") });
  }
  for (const t of tasks) {
    if (!BATCH_TASK_STATES.includes(t.state)) continue;
    const ms = instant(t.updated, `task ${t.id} has an Updated time`);
    out.push({ kind: "task", at: new Date(ms).toISOString(), ms, id: t.id, title: t.title, state: t.state, branch: t.branch });
  }
  for (const m of merges) out.push({ kind: "merge", at: m.at, ms: instant(m.at, "git reported a commit date"), ...m });
  return out.sort((a, b) => a.ms - b.ms);
}

function gitText(root, args, what) {
  const r = runGit(root, args);
  if (r.status !== 0) throw new OperationFailed(`${what} could not be read (git ${args[0]} exit ${r.status}): ${(r.stderr || "").trim().split("\n")[0]}`);
  return r.stdout;
}

// The three sources of a boundary, read from the repository and this machine's journal: { boundaries, sinceAt, notes,
// counts, journal }. The journal and the task folder may be missing, and each says so in `notes` rather than reading as
// "nothing happened". `since` is a revision: only what came after its commit time is counted.
export function collectBoundaries(root, project, { since = null } = {}) {
  // %x00 between the fields, so a merge subject carrying anything at all cannot be read as a field boundary.
  const range = since ? [`${since}..HEAD`] : [];
  const merges = parseMerges(gitText(root, ["log", "--merges", "--format=%H%x00%cI%x00%s", ...range], "the merge commits"));
  const sinceAt = since ? gitText(root, ["log", "-1", "--format=%cI", since], `the commit ${since}`).trim() : null;
  const journal = readJournal(root);
  const listed = listTasks(project, { all: true });
  const notes = [];
  if (!journal.exists) notes.push("no journal on this machine, so no maintain event bounds a batch here");
  if (journal.corrupt) notes.push(`${journal.corrupt} line(s) of the journal could not be read and bound nothing`);
  for (const u of listed.unreadable) notes.push(`task record ${u.file} could not be read (${u.reason}) and bounds nothing`);
  const boundaries = batchBoundaries({ maintains: journal.events, tasks: listed.tasks, merges });
  const after = (b) => !sinceAt || b.ms > Date.parse(sinceAt);
  const count = (kind) => boundaries.filter((b) => b.kind === kind && after(b)).length;
  return { boundaries, sinceAt, notes, journal, counts: { merges: count("merge"), tasks: count("task"), maintains: count("maintain") } };
}

// One row per clock minute that holds a boundary, oldest first: { from, to, tasks, merges, maintains }. from is the
// previous row's to (or `since`, or null for the oldest row), to is the latest boundary in the row. `since` drops every
// boundary at or before it. `limit` keeps the newest rows, and the row that then becomes the oldest keeps its real
// lower bound.
export function batchRows(boundaries, { limit = null, since = null } = {}) {
  const sinceMs = since ? instant(since, "the start of the range is a time") : null;
  const groups = new Map();
  for (const b of boundaries) {
    if (sinceMs !== null && b.ms <= sinceMs) continue;
    const minute = Math.floor(b.ms / 60000);
    if (!groups.has(minute)) groups.set(minute, []);
    groups.get(minute).push(b);
  }
  const rows = [];
  let from = since ? new Date(sinceMs).toISOString() : null;
  for (const minute of [...groups.keys()].sort((a, b) => a - b)) {
    const group = groups.get(minute);
    const to = new Date(Math.max(...group.map((b) => b.ms))).toISOString();
    const of = (kind) => group.filter((b) => b.kind === kind);
    rows.push({ from, to, tasks: of("task"), merges: of("merge"), maintains: of("maintain") });
    from = to;
  }
  return limit !== null && rows.length > limit ? rows.slice(rows.length - limit) : rows;
}

// The worktrees git has for this repository, the main one first: [{ path, branch }].
function worktreesOf(root) {
  const r = runGit(root, ["worktree", "list", "--porcelain"]);
  if (r.status !== 0) throw new OperationFailed(`git worktree list failed (exit ${r.status}), so the lane folders cannot be named`);
  const list = [];
  for (const block of r.stdout.split(/\r?\n\r?\n/)) {
    const path = /^worktree (.+)$/m.exec(block)?.[1]?.trim();
    if (path) list.push({ path, branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]?.trim() ?? null });
  }
  return list;
}

const inside = (parent, child) => {
  const rel = relative(parent, resolve(child));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

// The lane folder root, resolved the way dispatch resolves it: dispatch.laneRoot from the main checkout, else a folder
// beside the main checkout named after it.
const laneRootFor = (mainRoot, project) => resolve(mainRoot, project?.dispatch?.laneRoot ?? `../${basename(mainRoot)}-lanes`);

// The folder a dispatched lane lives in, from its task record (dispatch titles it "Lane <name>" and puts it at
// <lane root>/<name>), or null when the record is not a lane's or the folder is gone.
export function laneFolderOf(root, project, task) {
  const name = /^Lane (\S+)$/.exec(task?.title ?? "")?.[1];
  if (!name || !String(task?.branch ?? "").startsWith("lane/")) return null;
  const main = worktreesOf(root)[0]?.path ?? root;
  const dir = join(laneRootFor(main, project), name);
  return existsSync(dir) ? { name, dir } : null;
}

// Which transcripts a reading covers: { kind, args, describe }. By default this repository's own folder and each lane
// worktree's, passed as --project-dir so the meter matches them exactly, never as a substring (a substring of one
// project's folder name is often the start of another's). --project keeps the substring form for a person, and
// --all-projects widens to every project on this machine.
export function usageScope(root, project, { projects = [], all = false } = {}) {
  if (all) return { kind: "all", args: [], describe: "every project on this machine (--all-projects)" };
  if (projects.length) {
    const describe = `project folders whose name holds ${projects.join(", ")} (--project)`;
    return { kind: "project", args: projects.flatMap((p) => ["--project", p]), describe };
  }
  const trees = worktreesOf(root);
  const main = trees[0]?.path ?? root;
  const laneRoot = laneRootFor(main, project);
  const lanes = trees.filter((w) => inside(laneRoot, w.path)).map((w) => w.path);
  const dirs = [...new Set([main, root, ...lanes])];
  return {
    kind: "repository", dirs, args: dirs.flatMap((d) => ["--project-dir", d]),
    describe: `this repository's own transcript folder and ${lanes.length} lane folder(s) under ${tilde(laneRoot)}, matched exactly`,
  };
}

// The meter, over one span. `since` is exclusive and `until` inclusive, the way the meter reads them; either may be
// null. `scope` is usageScope's answer, passed straight through: a project folder name is particular to one machine and
// is never written into this repository, so it is worked out by the meter at run time and goes no further.
export function meterWindow(meter, { since = null, until = null, days = null, scope = { args: [] }, env = process.env }) {
  // days ({ from, to }, YYYY-MM-DD in the meter's timezone) composes with the instant span: a record must be inside both.
  const args = days ? [days.from, days.to] : [];
  if (since) args.push("--since", since);
  if (until) args.push("--until", until);
  args.push(...scope.args, "--json");
  const where = `${since ?? "the earliest record the meter can see"}..${until ?? "now"}`;
  const r = runMeter(meter.path, args, env);
  if (!r.ok) {
    const why = (r.stderr || r.stdout || "").trim().split("\n").slice(-3).join(" ");
    throw new OperationFailed(`the meter could not read ${where} (${r.failure})${why ? `: ${why}` : ""}`);
  }
  const parsed = parseMeterJson(r, where);
  if (parsed.tz && parsed.tz !== meterTz(env)) {
    throw new OperationFailed(`the windows were worked out in ${meterTz(env)} and the meter buckets in ${parsed.tz}, so the rows would not line `
      + "up with the times they name. Set SKILLITON_TZ to one of them and run it again");
  }
  return parsed;
}

const TOKEN_KEYS = ["requests", "input", "output", "cache_read", "cache_write_5m", "cache_write_1h"];
const zero = () => ({ requests: 0, input: 0, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, cost_usd: 0 });

// Token counts per scope and model, priced now from the meter's table (runtime/meter/pricing.mjs, retrieved
// PRICING_RETRIEVED). This is how a committed ledger row gets a cost, since it stores none, and how a live row gets its
// cost too, so both come from the same table. A model the table does not price leaves the row incomplete, by name.
export function foldModels(byScopeModel, { incomplete = false, unpriced = [] } = {}) {
  const total = zero();
  const byScope = {};
  const missing = new Set(unpriced);
  for (const [scope, models] of Object.entries(byScopeModel ?? {})) {
    const row = zero();
    for (const [model, counts] of Object.entries(models ?? {})) {
      const t = Object.fromEntries(TOKEN_KEYS.map((k) => [k, Number(counts?.[k] ?? 0)]));
      for (const k of TOKEN_KEYS) row[k] += t[k];
      const priced = priceTokens(model, t);
      if (priced) row.cost_usd += priced.cost; else missing.add(model);
    }
    byScope[scope] = row;
    for (const k of Object.keys(total)) total[k] += row[k];
  }
  return { total, byScope, incomplete: incomplete || missing.size > 0, unpriced: [...missing].sort() };
}

// The meter reports per scope (the session itself, and its subagents). A row keeps them apart and gives their total,
// because "the session cost this" and "its subagents cost this" are two facts and one of them hides the other. A meter
// that reports token counts per model is priced from the table here; one that does not is taken at its own figures.
export function foldScopes(parsed) {
  const unpriced = Object.keys(parsed.unpriced_models ?? {});
  if (parsed.byScopeModel) return foldModels(parsed.byScopeModel, { incomplete: Boolean(parsed.incomplete), unpriced });
  const total = zero();
  const byScope = {};
  for (const [name, s] of Object.entries(parsed.byScope ?? {})) {
    const row = zero();
    for (const k of Object.keys(row)) row[k] += Number(s?.[k] ?? 0);
    byScope[name] = row;
    for (const k of Object.keys(total)) total[k] += row[k];
  }
  return { total, byScope, incomplete: Boolean(parsed.incomplete), unpriced };
}

// One lane's transcripts, all of them: { requests, input, output, cache_read, cache_write_5m, cache_write_1h, tokens,
// cost_usd, peak_context, incomplete, laneAgents, laneAgentsLeftOut }. The folder is passed as --lane-dir, so the meter
// reads the folder's own transcripts, matched exactly, and the subagent transcripts of a lane agent whose brief names the
// folder (runtime/meter/lanes.mjs), wherever the integrating window filed them; a lane's figures never include the main
// checkout's own work or another lane's. A meter that does not know --lane-dir answers without lane_agent_files; it is
// asked again with --project-dir alone, and laneAgents is null to say that lane agents were not looked for.
export function laneFigures(meter, dir, env = process.env) {
  let parsed = meterWindow(meter, { scope: { args: ["--by-project", "--lane-dir", dir] }, env });
  const knowsLanes = Number.isInteger(parsed.lane_agent_files);
  if (!knowsLanes) parsed = meterWindow(meter, { scope: { args: ["--by-project", "--project-dir", dir] }, env });
  const folded = foldScopes(parsed);
  const peak = Math.max(0, ...Object.values(parsed.byScope ?? {}).map((s) => Number(s?.peak_context ?? 0)));
  const t = folded.total;
  const tokens = t.input + t.output + t.cache_read + t.cache_write_5m + t.cache_write_1h;
  const leftOut = knowsLanes ? Number(parsed.lane_agent_ambiguous ?? 0) + Number(parsed.lane_prompt_unread ?? 0) : 0;
  const laneAgents = knowsLanes ? parsed.lane_agent_files : null;
  return { ...t, tokens, peak_context: peak, incomplete: folded.incomplete, laneAgents, laneAgentsLeftOut: leftOut };
}

// An instant as "YYYY-MM-DD HH:MM" in the meter's timezone, which the scorecard names on its second line.
export function localTime(iso, tz) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const v = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")} ${v("hour")}:${v("minute")}`;
}

const num = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const cell = (s, w) => String(s).padStart(w);
const WINDOW_WIDTH = 34;
const HEAD = [
  ["window", WINDOW_WIDTH, false], ["ends", 5, false], ["scope", 10, false], ["requests", 9, true], ["input", 12, true], ["output", 11, true],
  ["cache read", 14, true], ["cache write", 13, true], ["est usd", 9, true],
];
const line = (values) => HEAD.map(([, w, right], i) => (right ? cell(values[i], w) : String(values[i]).padEnd(w))).join(" ").trimEnd();
const indent = "".padEnd(WINDOW_WIDTH);

// What ended a row, one line each, in time order.
function boundaryLines(row, tz) {
  const all = [...row.maintains, ...row.tasks, ...row.merges].sort((a, b) => a.ms - b.ms);
  return all.map((b) => {
    if (b.kind === "task") return `task ${b.id} closed ${b.state} at ${localTime(b.at, tz)}`;
    if (b.kind === "merge") return `merge ${b.shortSha} ${b.subject}`;
    return `maintain event at ${localTime(b.at, tz)}`;
  });
}

const SOURCE_LABEL = {
  "ledger-committed": "committed ledger row",
  "ledger-uncommitted": "ledger row, not yet committed",
  live: "live, read from the transcripts now",
};

function rowLines(row, tz) {
  const out = [];
  const window = `${row.from ? localTime(row.from, tz) : "(earliest)"}..${localTime(row.to, tz)}`;
  const names = Object.keys(row.folded.byScope).sort();
  const shown = names.length > 1 ? [...names, "total"] : (names.length ? names : ["total"]);
  const ends = row.tasks.length + row.merges.length + row.maintains.length;
  for (const [i, scope] of shown.entries()) {
    const v = scope === "total" ? row.folded.total : row.folded.byScope[scope];
    const figures = [num(v.requests), num(v.input), num(v.output), num(v.cache_read), num(v.cache_write_5m + v.cache_write_1h), v.cost_usd.toFixed(2)];
    out.push(line([i === 0 ? window : "", i === 0 ? ends : "", scope, ...figures]));
  }
  if (row.source) out.push(`${indent} ${SOURCE_LABEL[row.source]}`);
  for (const l of boundaryLines(row, tz)) out.push(`${indent} ${l}`);
  const unpriced = row.folded.unpriced.length ? `; unpriced model(s): ${row.folded.unpriced.join(", ")}` : "";
  if (row.folded.incomplete) out.push(`${indent} INCOMPLETE: the meter could not price part of this window${unpriced}. Do not quote this row.`);
  return out;
}

// The scorecard, as lines. It never says a number went down: a sentence about savings needs the usage screen and a
// cross-check, and it has no business being produced by something that only reads transcripts.
export function describeUsage({ rows, tz, meter, proof, scope }) {
  const priced = `est usd priced from the meter's table retrieved ${PRICING_RETRIEVED}`;
  const out = [proof ? `meter: ${meter.path}, proved in this run by ${meter.test} (${proof.summary}); ${priced}`
    : `meter: not run (committed ledger rows only); ${priced}`];
  out.push(`scope: ${scope.describe}; times in ${tz}`);
  if (!rows.length) return [...out, "no batch boundary (a maintain event, a closed task or a merge commit) was found, so there is no batch to report."];
  out.push("", line(HEAD.map(([name]) => name)));
  for (const row of rows) out.push(...rowLines(row, tz));
  return [...out, "", RECONSTRUCTION_NOTE];
}
