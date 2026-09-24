// usage.mjs: reading this machine's own transcripts through the meter, grouped by the batches that merged.
//
// Nothing here prices anything or reads a transcript. The meter does all of that: the plugin's own
// (runtime/meter/token-cost.mjs, beside this folder), or a project's scripts/token-cost.mjs when that file speaks the
// same contract. This file finds it, refuses to believe it until its own test has passed in this run, works out the
// window each merged batch covers, and turns the meter's JSON into rows.
//
// Two limits are deliberate, and both are printed rather than hidden:
//
//   1. The meter buckets by day, in its own timezone. A batch's window is therefore whole days, from the day after
//      the previous batch merged through the day this one merged, and not the two merge instants. Rows tile the
//      calendar exactly: no day is counted twice and no day is left out. A day carrying two merges is one row naming
//      both, because this meter cannot separate them and a row that pretended otherwise would be a made-up number.
//   2. Every figure is reconstructed from local transcripts. It is not a bill. PLAN.md sections 6 and 8 govern any
//      number that leaves this repository, and nothing here may be turned into a sentence about savings.

import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { refuse, runProgram, tilde } from "./core.mjs";
import { OperationFailed } from "./prepare.mjs";

const DEFAULT_METER = join("scripts", "token-cost.mjs");
const METER_TEST = "token-cost.test.mjs";
// The meter this plugin ships, found from this file's own folder, so it is the one beside the running runtime and never
// one a project put somewhere on a path.
export const PLUGIN_METER = join(dirname(fileURLToPath(import.meta.url)), "..", "meter", "token-cost.mjs");
// What a meter's --json output must carry to be believed as this contract: the four keys every row is built from.
const CONTRACT_KEYS = ["byScope", "tz", "incomplete", "unpriced_models"];
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
  "without being checked against it. Nothing above says one batch cost less than another, because that is a",
  "comparison and it needs the same cross-check.",
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
  return CONTRACT_KEYS.filter((k) => !(k in parsed));
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

// The day a moment falls on, in the meter's timezone, as YYYY-MM-DD. The meter buckets by the same rule, so a window
// worked out here and a window the meter reports mean the same thing.
function dayIn(iso, tz) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    throw new OperationFailed(`git reported a commit date this command cannot read: ${JSON.stringify(iso)}`);
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

const dayAfter = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

// The merge commits git reported, newest first: [{ sha, shortSha, at, subject }]. The fields arrive NUL separated so
// a subject carrying anything at all cannot be mistaken for a field boundary.
export function parseMerges(stdout) {
  return stdout.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [sha, at, ...rest] = line.split("\u0000");
    return { sha, shortSha: (sha ?? "").slice(0, 12), at, subject: rest.join(" ") };
  });
}

// One row per day that ended in a merge, oldest first, each with the whole days it covers. The oldest row has no
// lower bound: everything the meter can see up to that day belongs to it, and the row says so rather than inventing
// a start. `limit` keeps the newest rows, and the row that then becomes the oldest keeps its real lower bound.
export function batchRows(merges, tz, { limit = null } = {}) {
  const byDay = new Map();
  for (const m of [...merges].reverse()) {
    const day = dayIn(m.at, tz);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(m);
  }
  const days = [...byDay.keys()].sort();
  const all = days.map((day, i) => ({ day, merges: byDay.get(day), from: i === 0 ? null : dayAfter(days[i - 1]), to: day }));
  return limit !== null && all.length > limit ? all.slice(all.length - limit) : all;
}

// The meter, over one row's window. `projects` is passed straight through: a project folder name is particular to one
// machine and is never written into this repository, so it arrives on the command line and goes no further.
export function meterWindow(meter, { from, to, projects = [], env = process.env }) {
  const args = [from ?? "1970-01-01", to];
  for (const p of projects) args.push("--project", p);
  args.push("--json");
  const where = `${from ?? "the earliest day the meter can see"}..${to}`;
  const r = runMeter(meter.path, args, env);
  if (!r.ok) {
    const why = (r.stderr || r.stdout || "").trim().split("\n").slice(-3).join(" ");
    throw new OperationFailed(`the meter could not read ${where} (${r.failure})${why ? `: ${why}` : ""}`);
  }
  const parsed = parseMeterJson(r, where);
  if (parsed.tz && parsed.tz !== meterTz(env)) {
    throw new OperationFailed(`the windows were worked out in ${meterTz(env)} and the meter buckets in ${parsed.tz}, so the rows would not line `
      + "up with the days they name. Set SKILLITON_TZ to one of them and run it again");
  }
  return parsed;
}

const zero = () => ({ requests: 0, input: 0, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, cost_usd: 0 });

// The meter reports per scope (the session itself, and its subagents). A row keeps them apart and gives their total,
// because "the session cost this" and "its subagents cost this" are two facts and one of them hides the other.
export function foldScopes(parsed) {
  const total = zero();
  const byScope = {};
  for (const [name, s] of Object.entries(parsed.byScope ?? {})) {
    const row = zero();
    for (const k of Object.keys(row)) row[k] += Number(s?.[k] ?? 0);
    byScope[name] = row;
    for (const k of Object.keys(total)) total[k] += row[k];
  }
  return { total, byScope, incomplete: Boolean(parsed.incomplete), unpriced: Object.keys(parsed.unpriced_models ?? {}) };
}

const num = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const cell = (s, w) => String(s).padStart(w);
const HEAD = [
  ["days", 24, false], ["merges", 7, false], ["scope", 10, false], ["requests", 9, true], ["input", 12, true], ["output", 11, true],
  ["cache read", 13, true], ["cache write", 13, true], ["est usd", 9, true],
];
const line = (values) => HEAD.map(([, w, right], i) => (right ? cell(values[i], w) : String(values[i]).padEnd(w))).join(" ").trimEnd();

// The scorecard, as lines. It never says a number went down: a sentence about savings needs the usage screen and a
// cross-check, and it has no business being produced by something that only reads transcripts.
export function describeUsage({ rows, tz, meter, proof, projects }) {
  const out = [`meter: ${meter.path}, proved in this run by ${meter.test} (${proof.summary})`];
  const which = projects.length ? `; projects: ${projects.join(", ")}` : "; every project on this machine";
  out.push(`windows are whole days in ${tz}, because that is how the meter buckets${which}`);
  if (!rows.length) return [...out, "no merge commit was found in the range given, so there is no batch to report."];
  out.push("", line(HEAD.map(([name]) => name)));
  for (const row of rows) {
    const window = `${row.from ?? "(earliest)"}..${row.to}`;
    const names = Object.keys(row.folded.byScope).sort();
    const shown = names.length > 1 ? [...names, "total"] : (names.length ? names : ["total"]);
    for (const [i, scope] of shown.entries()) {
      const v = scope === "total" ? row.folded.total : row.folded.byScope[scope];
      const figures = [num(v.requests), num(v.input), num(v.output), num(v.cache_read), num(v.cache_write_5m + v.cache_write_1h), v.cost_usd.toFixed(2)];
      out.push(line([i === 0 ? window : "", i === 0 ? row.merges.length : "", scope, ...figures]));
    }
    for (const m of row.merges) out.push(`${"".padEnd(24)} ${m.shortSha} ${m.subject}`);
    const unpriced = row.folded.unpriced.length ? `; unpriced model(s): ${row.folded.unpriced.join(", ")}` : "";
    if (row.folded.incomplete) out.push(`${"".padEnd(24)} INCOMPLETE: the meter could not price part of this window${unpriced}. Do not quote this row.`);
  }
  return [...out, "", RECONSTRUCTION_NOTE];
}
