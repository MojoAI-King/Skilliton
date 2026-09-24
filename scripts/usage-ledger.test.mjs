#!/usr/bin/env node
// usage-ledger.test.mjs: the committed usage ledger (packs/base/plugins/workflow/runtime/lib/usage-ledger.mjs) and the
// batch row `skilliton maintain --apply` appends to it.
//
//   node scripts/usage-ledger.test.mjs
//
// What it proves: a row is appended; a second row for the same window, a row that would leave a gap, a row carrying a
// money-shaped key and a row made without the meter's test having passed are all refused with nothing written; rows
// written by maintain tile without a gap and end at the maintain event's own time; the file carries no dollar figure,
// no project folder name and no path (asserted on the file's text); the display prices a stored row from the meter's
// table and names the table's retrieval date; and skilliton usage marks committed and live rows, and --ledger-only
// reads no transcript at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  LEDGER_REL, appendLedgerRow, appendProblem, batchRowFromMeter, displayRow, readLedger,
} from "../packs/base/plugins/workflow/runtime/lib/usage-ledger.mjs";
import { describeUsage } from "../packs/base/plugins/workflow/runtime/lib/usage.mjs";
import { PRICING_RETRIEVED } from "../packs/base/plugins/workflow/runtime/meter/pricing.mjs";
import { folderNameFor } from "../packs/base/plugins/workflow/runtime/meter/projects.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");
const INSTALLED = JSON.parse(readFileSync(join(here, "..", "packs", "base", "plugins", "workflow", ".claude-plugin", "plugin.json"), "utf8")).version;
const PROOF = { test: "token-cost.test.mjs", summary: "meter fixture test passed" };
const T1 = "2026-09-20T12:00:00.000Z";
const T2 = "2026-09-21T12:00:00.000Z";
const T3 = "2026-09-22T12:00:00.000Z";

// A meter answer with token counts per scope and model, hand-priced below.
const METER_ANSWER = {
  files: 2, records: 3, distinct: 2, duplicates: 1, tz: "America/New_York", incomplete: false, unpriced_models: {}, project_dirs: 1,
  byScope: {
    top: { requests: 1, input: 1000, output: 100, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, peak_context: 1000, cost_usd: 0.003 },
    subagent: { requests: 1, input: 1000, output: 1000, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, peak_context: 1000, cost_usd: 0.006 },
  },
  byScopeModel: {
    top: { "claude-sonnet-5": { requests: 1, input: 1000, output: 100, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, peak_context: 1000 } },
    subagent: { "claude-haiku-4-5-20251001": { requests: 1, input: 1000, output: 1000, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, peak_context: 1000 } },
  },
};
const row = (from, to) => batchRowFromMeter(METER_ANSWER, { from, to, fromBasis: from ? "last ledger row" : "earliest transcript",
  boundaries: [{ kind: "maintain", at: to, ms: Date.parse(to) }] });

function temp(t, label) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `skilliton-ledger-${label}-`)));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("a row is appended, a duplicate window, a gap and a missing proof are refused with nothing written", (t) => {
  const root = temp(t, "append");
  const path = join(root, LEDGER_REL);
  const unproved = appendLedgerRow(root, row(null, T1));
  assert.equal(unproved.written, false);
  assert.match(unproved.refused, /the meter's own test has not passed in this run.*Nothing was written/);
  assert.equal(existsSync(path), false, "nothing was written without the proof");

  assert.equal(appendLedgerRow(root, row(null, T1), { proof: PROOF }).written, true);
  const once = readFileSync(path, "utf8");
  const again = appendLedgerRow(root, row(null, T1), { proof: PROOF });
  assert.match(again.refused, /a row for the window \(earliest\)\.\.2026-09-20T12:00:00\.000Z is already in/);
  assert.equal(readFileSync(path, "utf8"), once, "the duplicate wrote nothing");

  assert.equal(appendLedgerRow(root, row(T1, T2), { proof: PROOF }).written, true);
  const gap = appendLedgerRow(root, row(T2.replace("21", "22"), T3.replace("22", "23")), { proof: PROOF });
  assert.match(gap.refused, /rows must tile without a gap or an overlap/);
  const money = appendLedgerRow(root, { ...row(T2, T3), cost_usd: 1 }, { proof: PROOF });
  assert.match(money.refused, /carries cost_usd, and a ledger row stores token counts, never a dollar figure/);

  const rows = readLedger(root).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[1].from, rows[0].to, "the rows tile: each starts where the previous one ended");
  assert.equal(appendProblem(rows, row(T2, T3)), null, "and the next one in line is accepted");
});

test("the display prices a stored row from the meter's table and names its retrieval date", () => {
  // top: 1000 input at $2 + 100 output at $10 per MTok = 3000 micro-usd; subagent (haiku): 1000 * 1 + 1000 * 5 = 6000.
  const shown = displayRow(row(null, T1), "ledger-committed");
  assert.equal(Math.round(shown.folded.byScope.top.cost_usd * 1e6), 3000);
  assert.equal(Math.round(shown.folded.byScope.subagent.cost_usd * 1e6), 6000);
  assert.equal(Math.round(shown.folded.total.cost_usd * 1e6), 9000);
  assert.equal(shown.folded.incomplete, false);
  const unpriced = batchRowFromMeter({ ...METER_ANSWER, byScopeModel: { top: { "a-model-nobody-priced": { requests: 1, input: 5 } } } },
    { from: null, to: T1, fromBasis: "earliest transcript", boundaries: [] });
  const marked = displayRow(unpriced, "live");
  assert.equal(marked.folded.incomplete, true, "a model the table does not price leaves the row incomplete");
  assert.deepEqual(marked.folded.unpriced, ["a-model-nobody-priced"]);
  const text = describeUsage({ rows: [shown], tz: "UTC", meter: null, proof: null, scope: { describe: "fixture" } }).join("\n");
  assert.match(text, new RegExp(`priced from the meter's table retrieved ${PRICING_RETRIEVED}`));
  assert.match(text, /committed ledger row/);
  assert.match(text, /\s9000|0\.01/, "the priced total is printed");
});

// ---------- maintain, end to end, in a prepared repository ----------

function repoEnv(base) {
  const home = join(base, "home");
  mkdirSync(home);
  const env = {
    ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config"), GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com",
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`, SKILLITON_PROJECTS: join(base, "projects"), SKILLITON_TZ: "UTC",
  };
  for (const key of ["SKILLITON_SELF", "SKILLITON_DEBUG", "CLAUDE_PROJECT_DIR", "CLAUDE_PLUGIN_ROOT", "GIT_DIR", "GIT_WORK_TREE", "CLAUDE_CONFIG_DIR"]) delete env[key];
  return env;
}

const git = (cwd, args, env) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
function commit(cwd, env, message, at = null) {
  git(cwd, ["add", "-A"], env);
  const dated = at ? { ...env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } : env;
  git(cwd, ["-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", message], dated);
}
const cli = (cwd, args, env) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
};

// A prepared repository with one task record committed at a known time and no journal yet, so the first row's start
// is that task record's arrival.
function preparedRepo(t) {
  const base = temp(t, "maintain");
  const env = repoEnv(base);
  const dir = join(base, "repo");
  mkdirSync(join(dir, ".skilliton"), { recursive: true });
  git(dir, ["init", "-q"], env);
  git(dir, ["symbolic-ref", "HEAD", "refs/heads/main"], env);
  writeFileSync(join(dir, ".skilliton", "config.json"), `${JSON.stringify({ prepare: { version: 3, requires: { workflow: INSTALLED } } }, null, 2)}\n`);
  mkdirSync(join(dir, "docs", "tasks"), { recursive: true });
  for (const rel of ["docs/STATUS.md", "docs/BACKLOG.md", "docs/BACKLOG_ARCHIVE.md", "docs/ROADMAP.md", "DECISIONS.md", "docs/LESSONS.md",
    "docs/HANDOFF.md", "docs/HANDOFF_ARCHIVE.md", "docs/MAINTAIN.md"]) writeFileSync(join(dir, rel), `# ${rel}\n\nKind: Living.\n`);
  commit(dir, env, "prepare", "2026-09-19T10:00:00Z");
  writeFileSync(join(dir, "docs", "tasks", "README.md"), "# Tasks\n\nKind: Living.\n");
  commit(dir, env, "the tasks folder's README, which is not a task record", "2026-09-19T11:00:00Z");
  taskRecord(dir, "2026-09-20-first-aaaa", "in-progress", "2026-09-20T10:00:00.000Z");
  commit(dir, env, "the first task record", "2026-09-20T10:00:00Z");
  return { base, dir, env, folder: join(base, "projects", folderNameFor(dir)) };
}

function taskRecord(dir, id, state, updated) {
  writeFileSync(join(dir, "docs", "tasks", `${id}.md`), `# Task: ${id}\n\n- **ID:** ${id}\n- **State:** ${state}\n- **Branch:** main\n`
    + `- **Owner:** unassigned\n- **Updated:** ${updated}\n`);
}

function request(f, id, at) {
  mkdirSync(f.folder, { recursive: true });
  const line = { requestId: id, timestamp: at, message: { id: `m-${id}`, model: "claude-sonnet-5", usage: { input_tokens: 1000, output_tokens: 100 } } };
  writeFileSync(join(f.folder, `${id}.jsonl`), `${JSON.stringify(line)}\n`);
}

const maintainEvents = (f) => {
  const path = join(f.dir, ".git", "skilliton", "journal.jsonl");
  return existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.event === "maintain") : [];
};

test("maintain --apply appends rows that tile, end at the maintain event, and carry no dollar figure, folder name or path", (t) => {
  const f = preparedRepo(t);
  const empty = cli(f.dir, ["maintain", "--apply"], f.env);
  assert.equal(empty.code, 0, empty.all);
  assert.match(empty.out, /current +usage ledger +no request in 2026-09-20T10:00:00\.000Z\.\.\S+; nothing written/, "an empty window writes nothing");
  assert.equal(existsSync(join(f.dir, LEDGER_REL)), false);

  // The journal now exists, and still no ledger row: the first row starts at the earliest transcript.
  request(f, "r1", "2026-09-21T12:00:00.000Z");
  const first = cli(f.dir, ["maintain", "--apply"], f.env);
  assert.equal(first.code, 0, first.all);
  assert.match(first.out, /wrote +usage ledger +a batch row for \(the earliest transcript\)\.\.\S+ \(1 request\(s\)\)/);
  request(f, "r2", new Date().toISOString());
  const second = cli(f.dir, ["maintain", "--apply"], f.env);
  assert.match(second.out, /wrote +usage ledger +a batch row for \S+\.\.\S+ \(1 request\(s\)\)/, second.all);

  const rows = readLedger(f.dir).rows;
  const events = maintainEvents(f);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].from, null);
  assert.equal(rows[0].from_basis, "earliest transcript");
  assert.equal(rows[0].to, events[1].at, "the first row ends at the second maintenance's own event");
  assert.equal(rows[1].from, rows[0].to, "and the next row starts exactly there");
  assert.equal(rows[1].from_basis, "last ledger row");
  assert.equal(rows[1].to, events[2].at);
  assert.equal(rows[1].scopes.top.models["claude-sonnet-5"].input, 1000, "token counts per scope and model");
  const text = readFileSync(join(f.dir, LEDGER_REL), "utf8");
  assert.doesNotMatch(text, /\$|cost|usd|dollar|"price/i, "no dollar figure, and no key shaped like one");
  assert.equal(text.includes(folderNameFor(f.dir)), false, "no project folder name");
  assert.equal(text.includes(f.base), false, "and no path at all");
});

test("with no journal and no ledger row, the first row starts at the first task record, and says so", (t) => {
  const f = preparedRepo(t);
  request(f, "r1", "2026-09-21T12:00:00.000Z");
  const r = cli(f.dir, ["maintain", "--apply"], f.env);
  assert.equal(r.code, 0, r.all);
  const [only] = readLedger(f.dir).rows;
  assert.equal(only.from, "2026-09-20T10:00:00.000Z");
  assert.equal(only.from_basis, "first task record");
});

test("a meter whose own test fails writes no row, and maintenance carries on", (t) => {
  const f = preparedRepo(t);
  request(f, "r1", "2026-09-21T12:00:00.000Z");
  mkdirSync(join(f.dir, "scripts"));
  const answer = { byScope: {}, tz: "UTC", incomplete: false, unpriced_models: {}, project_dirs: 0, window: { since: null } };
  writeFileSync(join(f.dir, "scripts", "token-cost.mjs"), `console.log(${JSON.stringify(JSON.stringify(answer))});\n`);
  writeFileSync(join(f.dir, "scripts", "token-cost.test.mjs"), "console.log('meter check FAILED');\nprocess.exit(1);\n");
  const r = cli(f.dir, ["maintain", "--apply"], f.env);
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /refused +usage ledger +the meter's own test failed .*no row was written/);
  assert.match(r.out, /wrote +journal/, "the rest of maintenance still ran");
  assert.equal(existsSync(join(f.dir, LEDGER_REL)), false);
});

test("skilliton usage shows the ledger first, marks committed and live rows, and --ledger-only reads no transcript", (t) => {
  const f = preparedRepo(t);
  request(f, "r1", "2026-09-21T12:00:00.000Z");
  cli(f.dir, ["maintain", "--apply"], f.env);
  const before = JSON.parse(cli(f.dir, ["usage", "--json"], f.env).out);
  assert.equal(before.rows[0].source, "ledger-uncommitted", "a row not yet committed says so");
  commit(f.dir, f.env, "maintenance");
  request(f, "r2", new Date().toISOString());
  taskRecord(f.dir, "2026-09-24-later-bbbb", "merged", new Date(Date.now() + 2000).toISOString());
  const after = JSON.parse(cli(f.dir, ["usage", "--json"], f.env).out);
  assert.deepEqual(after.rows.map((r) => r.source), ["ledger-committed", "live"], "the committed row, then the live tail");
  assert.equal(after.rows[1].from, after.rows[0].to, "the live tail starts where the ledger ends");
  assert.equal(after.rows[1].total.requests, 1);
  const only = cli(f.dir, ["usage", "--ledger-only"], f.env);
  assert.equal(only.code, 0, only.all);
  assert.match(only.out, /1 batch row\(s\) \(committed ledger rows only\)/);
  assert.match(only.out, /meter: not run \(committed ledger rows only\)/);
  assert.doesNotMatch(only.out, /live, read from the transcripts/);
  assert.match(only.out, /It is not a bill/, "the reconstruction note is on this output too");
});
