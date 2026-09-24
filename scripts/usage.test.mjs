#!/usr/bin/env node
// usage.test.mjs: `skilliton usage` groups the meter's reading by batch (a batch ends at a maintain event, a closed
// task or a merge commit), picks the meter it believes, and reports nothing at all when the meter's own test fails
// (PLAN.md section 6; report card area 04 batch 04 item 2).
//
//   node scripts/usage.test.mjs   exit 0 when every check passes, 1 when one fails
//
// The meter is stubbed. This file is about the windows and the refusals, not about pricing: the real meter has its
// own test beside it (scripts/token-cost.test.mjs), which is exactly the file the command insists on running before
// it prints a number, and stubbing it here is what lets that insistence be proved.
//
// The stub writes down every argument list it is given, so the window boundaries are checked against what the meter
// was actually asked for rather than against what the printed table says. A table can agree with itself while the
// windows behind it overlap.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLUGIN_METER, batchBoundaries, batchRows, describeUsage, foldScopes, parseMerges, RECONSTRUCTION_NOTE,
} from "../packs/base/plugins/workflow/runtime/lib/usage.mjs";
import { renderTask } from "../packs/base/plugins/workflow/runtime/lib/tasks.mjs";
import { folderNameFor } from "../packs/base/plugins/workflow/runtime/meter/projects.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SKILLITON = join(ROOT, "packs", "base", "plugins", "workflow", "runtime", "skilliton.mjs");
const TZ = "America/New_York";
const TEMPS = [];
const results = [];

const check = (name, fn) => { try { fn(); results.push({ name }); } catch (e) { results.push({ name, fail: e.message }); } };
const eq = (got, want, what) => { if (got !== want) throw new Error(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };
const has = (text, re, what) => { if (!re.test(text)) throw new Error(`${what}: nothing matched ${re} in:\n${text}`); };
const hasNot = (text, re, what) => { if (re.test(text)) throw new Error(`${what}: ${re} matched, and should not have, in:\n${text}`); };
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------- the pure half: windows, folding, and what the scorecard says ----------

// Three merges, two of them 40 seconds apart, and a task closed in the same minute as the second pair: that minute is
// one row. A maintain event later is a row of its own.
const MERGES = parseMerges([
  ["cccccccccccccccccccccccccccccccccccccccc", "2026-09-16T22:30:40-04:00", "Merge the third"].join("\u0000"),
  ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "2026-09-16T22:30:00-04:00", "Merge the second"].join("\u0000"),
  ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "2026-09-16T10:00:00-04:00", "Merge the first"].join("\u0000"),
].join("\n"));
const TASKS = [
  { id: "2026-09-16-one-aaaa", title: "One", state: "merged", updated: "2026-09-17T02:30:20.000Z" },
  { id: "2026-09-16-two-bbbb", title: "Two", state: "in-progress", updated: "2026-09-17T01:00:00.000Z" },
  { id: "2026-09-16-gone-cccc", title: "Gone", state: "abandoned", updated: "2026-09-17T01:00:00.000Z" },
];
const MAINTAINS = [{ event: "maintain", at: "2026-09-18T13:00:00.000Z" }, { event: "checkpoint", at: "2026-09-18T12:00:00.000Z" }];
const BOUNDS = batchBoundaries({ maintains: MAINTAINS, tasks: TASKS, merges: MERGES });

check("git's NUL separated fields are read back whole, subject included", () => {
  eq(MERGES.length, 3, "merges parsed");
  eq(MERGES[0].sha, "cccccccccccccccccccccccccccccccccccccccc", "the newest sha");
  eq(MERGES[0].shortSha, "cccccccccccc", "the short sha");
  eq(MERGES[0].subject, "Merge the third", "the subject");
});

check("boundaries come from maintain events, closed tasks and merges, and nothing else", () => {
  eq(BOUNDS.map((b) => b.kind).join(","), "merge,merge,task,merge,maintain", "an open task, an abandoned one and a checkpoint bound nothing");
});

check("boundaries inside one minute are one row, and the rows tile time", () => {
  const rows = batchRows(BOUNDS);
  eq(rows.length, 3, "rows");
  eq(rows[0].from, null, "the oldest row has no lower bound");
  eq(rows[0].to, "2026-09-16T14:00:00.000Z", "and ends at its merge");
  eq(rows[1].from, rows[0].to, "the next row starts exactly where the previous one ended");
  eq(rows[1].to, "2026-09-17T02:30:40.000Z", "a row ends at the latest boundary it names");
  eq(`${rows[1].merges.length} ${rows[1].tasks.length}`, "2 1", "both merges and the task closed in that minute are on one row");
  eq(rows[2].from, rows[1].to, "and the maintain row starts where that one ended");
  eq(rows[2].maintains.length, 1, "the maintain event ends its own row");
});

check("a limit keeps the newest rows and the new oldest row keeps its real lower bound; since drops what came before", () => {
  const rows = batchRows(BOUNDS, { limit: 1 });
  eq(rows.length, 1, "rows kept");
  eq(rows[0].from, "2026-09-17T02:30:40.000Z", "it keeps the bound it had, and does not become open ended");
  const later = batchRows(BOUNDS, { since: "2026-09-16T14:00:00.000Z" });
  eq(later.length, 2, "a boundary exactly at since is not after it");
  eq(later[0].from, "2026-09-16T14:00:00.000Z", "and the first row starts at since");
});

check("a date git could not have written is reported, never guessed", () => {
  let message = null;
  try { batchBoundaries({ merges: parseMerges(["abc", "not-a-date", "Merge"].join("\u0000")) }); } catch (e) { message = e.message; }
  has(String(message), /commit date this command cannot read/, "the failure names what it could not read");
});

check("the scopes are kept apart and totalled, and an unpriced window says so", () => {
  const folded = foldScopes({
    incomplete: true,
    unpriced_models: { "some-model": 3 },
    byScope: { main: { requests: 10, input: 100, output: 20, cache_read: 5, cache_write_5m: 1, cache_write_1h: 0, cost_usd: 1.5 },
      subagent: { requests: 2, input: 40, output: 4, cache_read: 1, cache_write_5m: 0, cache_write_1h: 2, cost_usd: 0.5 } },
  });
  eq(folded.total.requests, 12, "the total adds the scopes");
  eq(folded.total.cost_usd, 2, "the total adds the cost of each scope");
  eq(folded.byScope.main.requests, 10, "a scope keeps its own figure");
  eq(folded.incomplete, true, "an incomplete window stays incomplete");
  eq(folded.unpriced.join(","), "some-model", "the model it could not price is named");
});

// ---------- the fixture repository and its stub meter ----------

const gitThere = spawnSync("git", ["--version"], { encoding: "utf8" }).status === 0;

const STUB_METER = `#!/usr/bin/env node
// A stub meter for scripts/usage.test.mjs. It prices nothing: it writes down the arguments it was given and prints
// one fixed JSON object, so the test can check the windows the command asked for.
import { appendFileSync } from "node:fs";
const argv = process.argv.slice(2);
appendFileSync(process.env.STUB_METER_LOG, JSON.stringify(argv) + "\\n");
const tz = process.env.STUB_METER_TZ ?? process.env.SKILLITON_TZ ?? "America/New_York";
console.log(JSON.stringify({ files: 1, records: 2, tz, window: { from: argv[0], to: argv[1], since: null, until: null }, projects: [], project_dirs: 0,
  unpriced_models: {}, incomplete: false,
  byScope: { main: { requests: 7, input: 1234, output: 56, cache_read: 78, cache_write_5m: 9, cache_write_1h: 0, cost_usd: 0.42 } } }));
`;

const PASSING_TEST = "#!/usr/bin/env node\nconsole.log(\"token-cost check passed: 9 checks\");\n";
const FAILING_TEST = "#!/usr/bin/env node\nconsole.log(\"token-cost check FAILED: 1 check of 9\");\nprocess.exit(1);\n";

const GIT_ENV = {
  ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid", GIT_CONFIG_GLOBAL: "/dev/null",
};

function gitIn(dir) {
  return (args, at = null) => {
    const env = at ? { ...GIT_ENV, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } : GIT_ENV;
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", env });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} exited ${r.status}: ${(r.stderr || r.stdout || "").trim()}`);
    return r.stdout;
  };
}

function newRepo(prefix) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  TEMPS.push(dir);
  const run = gitIn(dir);
  run(["init", "-q", "-b", "main"]);
  run(["commit", "-q", "--allow-empty", "-m", "the first commit"], "2026-09-15T09:00:00-04:00");
  return { dir, run };
}

function placeMeter(dir, meter, meterTest) {
  if (meter === null) return;
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(join(dir, "scripts", "token-cost.mjs"), meter);
  if (meterTest !== null) writeFileSync(join(dir, "scripts", "token-cost.test.mjs"), meterTest);
}

// A repository with three merge commits. The committer date is what %cI reports and what the rows are worked out
// from, so each merge is given one explicitly rather than inheriting the moment the test happens to run.
function fixture({ meter = STUB_METER, meterTest = PASSING_TEST } = {}) {
  const { dir, run } = newRepo("skilliton-usage-test-");
  for (const [n, at] of [["one", "2026-09-16T10:00:00-04:00"], ["two", "2026-09-16T22:30:00-04:00"], ["three", "2026-09-18T09:00:00-04:00"]]) {
    run(["checkout", "-q", "-b", `batch-${n}`]);
    run(["commit", "-q", "--allow-empty", "-m", `work ${n}`], at);
    run(["checkout", "-q", "main"]);
    run(["merge", "-q", "--no-ff", `batch-${n}`, "-m", `Merge batch ${n}`], at);
  }
  placeMeter(dir, meter, meterTest);
  return withTranscripts({ dir, log: join(dir, "meter-calls.log") });
}

// A repository that only fast-forwards: no merge commit at all, two closed task records and one maintain event in
// this machine's journal. The second task closes in the same minute as the maintain event, so that minute is one row.
function fastForwardFixture() {
  const { dir, run } = newRepo("skilliton-usage-ff-");
  run(["checkout", "-q", "-b", "feature"]);
  run(["commit", "-q", "--allow-empty", "-m", "feature work"], "2026-09-16T09:00:00-04:00");
  run(["checkout", "-q", "main"]);
  run(["merge", "-q", "--ff-only", "feature"]);
  mkdirSync(join(dir, "docs", "tasks"), { recursive: true });
  const task = (id, state, updated) => writeFileSync(join(dir, "docs", "tasks", `${id}.md`),
    renderTask({ id, title: id, state, branch: "main", owner: "unassigned", updated, criteria: ["done"] }));
  task("2026-09-16-alpha-aaaa", "merged", "2026-09-16T15:00:00.000Z");
  task("2026-09-17-beta-bbbb", "done-local", "2026-09-17T15:00:30.000Z");
  task("2026-09-17-open-cccc", "in-progress", "2026-09-17T16:00:00.000Z");
  mkdirSync(join(dir, ".git", "skilliton"), { recursive: true });
  const event = { at: "2026-09-17T15:00:10.000Z", event: "maintain", session: null, branch: "main", head: null, dirty: 0, fingerprint: null };
  writeFileSync(join(dir, ".git", "skilliton", "journal.jsonl"), `${JSON.stringify(event)}\n`);
  placeMeter(dir, STUB_METER, PASSING_TEST);
  return withTranscripts({ dir, log: join(dir, "meter-calls.log") });
}

// Every run gets an empty transcripts folder of its own, so the plugin's meter, when a case falls back to it, reads
// nothing from this machine and its answer cannot depend on who runs the test.
function withTranscripts(f) {
  f.projects = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-usage-transcripts-")));
  TEMPS.push(f.projects);
  return f;
}

// The contract probe asks for 1970-01-01..1970-01-01; it is logged by the stub like any call and is dropped here, so a
// count of calls is a count of the windows the command asked for.
const isProbe = (call) => call[0] === "1970-01-01" && call[1] === "1970-01-01";
// The default scope passes every folder as --project-dir; the windows are checked without them, and the folders apart.
const withoutDirs = (call) => call.filter((a, i) => a !== "--project-dir" && call[i - 1] !== "--project-dir");
const dirsOf = (call) => call.flatMap((a, i) => (call[i - 1] === "--project-dir" ? [a] : []));

function usage(f, args = [], extraEnv = {}) {
  const r = spawnSync(process.execPath, [SKILLITON, "usage", "--dir", f.dir, ...args], {
    encoding: "utf8",
    env: { ...process.env, SKILLITON_TZ: TZ, STUB_METER_LOG: f.log, SKILLITON_PROJECTS: f.projects, ...extraEnv },
  });
  const logged = existsSync(f.log) ? readFileSync(f.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const real = logged.filter((c) => !isProbe(c));
  const probes = logged.length - real.length;
  const calls = real.map(withoutDirs);
  const dirs = real.map(dirsOf);
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "", all: `${r.stdout ?? ""}${r.stderr ?? ""}`, calls, dirs, probes };
}

const REPO_CHECKS = [
  ["the meter is asked for instant windows that tile time, one per batch", () => {
    const f = fixture();
    const r = usage(f);
    eq(r.code, 0, `exit status (output was:\n${r.all})`);
    eq(r.calls.length, 3, `meter runs, one per batch row (calls: ${JSON.stringify(r.calls)})`);
    eq(r.calls[0].join(" "), "--until 2026-09-16T14:00:00.000Z --json", "the oldest window reaches back as far as the meter can see");
    eq(r.calls[1].join(" "), "--since 2026-09-16T14:00:00.000Z --until 2026-09-17T02:30:00.000Z --json", "the next begins where it ended");
    eq(r.calls[2].join(" "), "--since 2026-09-17T02:30:00.000Z --until 2026-09-18T13:00:00.000Z --json", "and so on, with no gap");
    has(r.out, /3 batch row\(s\) from 3 merge\(s\), 0 closed task\(s\) and 0 maintain event\(s\)/, "the header counts the rows and what ended them");
    has(r.out, /\(earliest\)\.\.2026-09-16 10:00/, "the oldest row says it is open ended rather than inventing a start");
    has(r.out, /merge \S+ Merge batch one/, "each merge on a row is named");
    has(r.out, /note: no journal on this machine/, "and a missing journal is said, not read as no maintenance");
    eq(r.dirs[0].join(" "), f.dir, "the default scope is the repository's own folder, passed as --project-dir");
    has(r.out, /^scope: this repository's own transcript folder and 0 lane folder\(s\) under .*, matched exactly;/m, "and the second line says so");
  }],
  ["the default scope counts this repository and its lane worktrees exactly, and nothing whose name only starts the same", () => {
    const f = fixture({ meter: null });
    const lane = join(`${f.dir}-lanes`, "one");
    TEMPS.push(`${f.dir}-lanes`);
    gitIn(f.dir)(["worktree", "add", "-q", lane, "-b", "lane/one"]);
    // Three folders under SKILLITON_PROJECTS: the repository's, its lane's, and one for a sibling folder whose name
    // begins with the repository's, which a substring match would count. One request each, inside the oldest row.
    for (const [path, id] of [[f.dir, "r1"], [lane, "r2"], [`${f.dir}-other`, "r3"]]) {
      const folder = join(f.projects, folderNameFor(path));
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, "s.jsonl"), `${JSON.stringify({ requestId: id, timestamp: "2026-09-16T12:00:00Z",
        message: { id: `m-${id}`, model: "claude-sonnet-5", usage: { input_tokens: 10, output_tokens: 1 } } })}\n`);
    }
    const requests = (args) => JSON.parse(usage(f, ["--json", ...args]).out).rows[0].total.requests;
    eq(requests([]), 2, "the repository and its lane, and not the sibling");
    eq(requests(["--all-projects"]), 3, "--all-projects widens to every folder");
    eq(requests(["--project", basename(f.dir)]), 3, "--project is a substring, which is why it is not the default");
    has(usage(f).out, /^scope: this repository's own transcript folder and 1 lane folder\(s\)/m, "the second line names the lane");
    const both = usage(f, ["--project", "x", "--all-projects"]);
    eq(both.code, 2, `asking for both is refused (output was:\n${both.all})`);
  }],
  ["a repository that only fast-forwards gets its rows from task closes and the maintain event", () => {
    const r = usage(fastForwardFixture());
    eq(r.code, 0, `exit status (output was:\n${r.all})`);
    has(r.out, /2 batch row\(s\) from 0 merge\(s\), 2 closed task\(s\) and 1 maintain event\(s\)/, "no merge commit, and still two rows");
    eq(r.calls.length, 2, `meter runs (calls: ${JSON.stringify(r.calls)})`);
    eq(r.calls[0].join(" "), "--until 2026-09-16T15:00:00.000Z --json", "the first row ends at the first task close");
    eq(r.calls[1].join(" "), "--since 2026-09-16T15:00:00.000Z --until 2026-09-17T15:00:30.000Z --json",
      "the second runs from there to the later of the task close and the maintain event in the same minute");
    has(r.out, /task 2026-09-16-alpha-aaaa closed merged at 2026-09-16 11:00/, "the first row names its task");
    has(r.out, /maintain event at 2026-09-17 11:00\n\s+task 2026-09-17-beta-bbbb closed done-local at 2026-09-17 11:00/, "the second names both, in time order");
    hasNot(r.out, /open-cccc/, "a task still in progress ends nothing");
  }],
  ["a project filter reaches the meter and nothing else", () => {
    const r = usage(fixture(), ["--project", "one-project,another"]);
    eq(r.code, 0, `exit status (output was:\n${r.all})`);
    eq(r.calls[0].join(" "), "--until 2026-09-16T14:00:00.000Z --project one-project --project another --json", "each name is passed through");
  }],
  ["--since narrows the batches to those after the revision, and --limit narrows the rows", () => {
    const since = usage(fixture(), ["--since", "HEAD~1"]);
    eq(since.code, 0, `--since exit status (output was:\n${since.all})`);
    has(since.out, /1 batch row\(s\) from 1 merge\(s\), 0 closed task\(s\) and 0 maintain event\(s\) after HEAD~1/, "only what came after is counted");
    eq(since.calls[0].join(" "), "--since 2026-09-17T02:30:00.000Z --until 2026-09-18T13:00:00.000Z --json", "and the row starts at that commit");
    const limited = usage(fixture(), ["--limit", "1"]);
    eq(limited.calls.length, 1, "one row means one meter run");
    eq(limited.calls[0].join(" "), "--since 2026-09-17T02:30:00.000Z --until 2026-09-18T13:00:00.000Z --json", "the row kept is the newest one");
  }],
  ["no line of the scorecard carries a comparison the usage screen has not confirmed", () => {
    const r = usage(fixture());
    // The words a saving would be written in, and the shapes a percentage takes. The reconstruction note is written
    // without any of them on purpose, so this check has nothing of its own to trip over.
    hasNot(r.all, /\d\s*%|%\s*\d|\bsavings?\b|\bsaved\b|\bcheaper\b|\breduc(e|ed|tion)\b|\bless than before\b/i, "a comparison in the output");
    has(r.out, /It is not a bill/, "every scorecard carries the reconstruction note");
    has(r.out, /the usage screen is the only real one/, "and names what the real meter is");
  }],
  ["--json carries the same rows, the note, and no printed table", () => {
    const r = usage(fixture(), ["--json"]);
    eq(r.code, 0, `exit status (output was:\n${r.all})`);
    const parsed = JSON.parse(r.out);
    eq(parsed.rows.length, 3, "rows in the JSON");
    eq(parsed.rows[0].from, null, "the oldest row is open ended in the JSON too");
    eq(parsed.rows[1].from, "2026-09-16T14:00:00.000Z", "the next row's lower bound");
    eq(parsed.tz, TZ, "the timezone the windows were worked out in");
    eq(parsed.reconstruction, RECONSTRUCTION_NOTE, "the note travels with the JSON");
    eq(parsed.rows[0].total.requests, 7, "each row is one meter run");
    eq(parsed.rows[1].merges[0].subject, "Merge batch two", "and names what ended it");
    hasNot(r.out, /est usd/, "the printed table is not also emitted");
  }],
  ["a meter whose own test fails prints no number at all", () => {
    const r = usage(fixture({ meterTest: FAILING_TEST }));
    eq(r.code, 3, `exit status (output was:\n${r.all})`);
    has(r.err, /the meter's own test failed/, "the failure says which gate stopped it");
    has(r.err, /token-cost check FAILED/, "and carries the test's own last words");
    eq(r.calls.length, 0, "the meter was never run, so no figure could have been printed");
    hasNot(r.out, /est usd/, "and no table was printed");
  }],
  ["a project with no meter of its own is read through the plugin's meter, proved first", () => {
    const r = usage(fixture({ meter: null }));
    eq(r.code, 0, `exit status (output was:\n${r.all})`);
    has(r.out, /meter: \S*runtime\/meter\/token-cost\.mjs, proved in this run by \S*runtime\/meter\/token-cost\.test\.mjs \(meter fixture test passed\)/,
      "the plugin's meter is named with its own test");
    hasNot(r.out, /^note: this project's/m, "and no notice about a meter: there was nothing of the project's to pass over");
    eq(PLUGIN_METER.endsWith(join("runtime", "meter", "token-cost.mjs")), true, "the plugin's meter is found from the runtime's own folder");
  }],
  ["a project meter with no test beside it is passed over, named, and never run", () => {
    const r = usage(fixture({ meterTest: null }));
    eq(r.code, 0, `exit status (output was:\n${r.all})`);
    has(r.out, /note: this project's scripts\/token-cost\.mjs has no token-cost\.test\.mjs beside it, so the plugin's meter is used instead/,
      "the notice names what is missing and what is used instead");
    eq(r.calls.length + r.probes, 0, "and the project's meter was not run at all");
  }],
  ["a project meter that does not speak the contract is named with what it lacks, and the plugin's meter is used", () => {
    const r = usage(fixture({ meter: STUB_METER.replace(/console\.log\(JSON\.stringify\(\{[\s\S]*\}\)\);\n$/, 'console.log("{}");\n') }));
    eq(r.code, 0, `exit status (output was:\n${r.all})`);
    has(r.out, /does not speak the meter's contract \(its --json answer lacks byScope, tz, incomplete, unpriced_models, project_dirs, window\.since\)/,
      "every missing key is named");
    has(r.out, /meter: \S*runtime\/meter\/token-cost\.mjs/, "and the plugin's meter did the reading");
    eq(r.probes, 1, "the project's meter was asked once, for the empty window, and not for a real one");
    eq(r.calls.length, 0, "and never for a batch window");
  }],
  ["a meter named with --meter that does not speak the contract is refused, and nothing is written", () => {
    const f = fixture();
    mkdirSync(join(f.dir, "other"));
    writeFileSync(join(f.dir, "other", "token-cost.mjs"), 'console.log("{}");\n');
    writeFileSync(join(f.dir, "other", "token-cost.test.mjs"), PASSING_TEST);
    const r = usage(f, ["--meter", "other"]);
    eq(r.code, 2, `exit status (output was:\n${r.all})`);
    has(r.all, /does not speak the meter's contract: its --json answer lacks byScope, tz, incomplete, unpriced_models, project_dirs, window\.since\. Nothing/,
      "the refusal names it");
  }],
  ["a meter bucketing in another timezone is a failure, not a quietly wrong window", () => {
    const f = fixture();
    // The stub reports whatever STUB_METER_TZ names. A meter with its own hard coded zone, or a machine whose
    // SKILLITON_TZ was changed between the two, produces exactly this disagreement: the rows would name days the
    // meter never bucketed by, and every figure would be off by the hours between the two zones.
    const r = usage(f, [], { STUB_METER_TZ: "UTC" });
    eq(r.code, 3, `exit status (output was:\n${r.all})`);
    has(r.err, /worked out in America\/New_York and the meter buckets in UTC/, "the failure names both zones");
    hasNot(r.out, /est usd/, "and no table was printed from windows that do not line up");
  }],
  ["--since is refused when it is not a revision, before git is asked anything", () => {
    const f = fixture();
    // A value that would reach git as an option never gets past the argument parser.
    const option = usage(f, ["--since", "--upload-pack=echo no"]);
    eq(option.code, 2, `an option shaped value (output was:\n${option.all})`);
    has(option.all, /--since needs a value/, "the parser refuses it first");
    // One that is shaped like a revision at the front, and is not one, is refused by the revision check.
    const bent = usage(f, ["--since", "HEAD; echo no"]);
    eq(bent.code, 2, `a value that is not a revision (output was:\n${bent.all})`);
    has(bent.all, /--since takes a branch, tag or commit/, "the refusal says what it takes");
    eq(bent.calls.length, 0, "and nothing was asked of the meter");
  }],
  ["a repository with no boundary at all says so and asks the meter nothing", () => {
    const { dir } = newRepo("skilliton-usage-test-bare-");
    placeMeter(dir, STUB_METER, PASSING_TEST);
    const f = withTranscripts({ dir, log: join(dir, "meter-calls.log") });
    const r = usage(f);
    eq(r.code, 0, `exit status (output was:\n${r.all})`);
    has(r.out, /no batch boundary \(a maintain event, a closed task or a merge commit\) was found/, "it says there is no batch to report");
    eq(r.calls.length, 0, "and the meter was not run");
  }],
];

// ---------- the printed shape, without a repository ----------

check("an incomplete row is marked, and the mark tells the reader not to quote it", () => {
  const rows = [{ from: null, to: "2026-09-16T14:00:00.000Z", tasks: [], maintains: [],
    merges: [{ kind: "merge", ms: 0, shortSha: "abcdefabcdef", subject: "Merge a batch" }],
    folded: foldScopes({ incomplete: true, unpriced_models: { "a-model": 1 }, byScope: { main: { requests: 1, input: 2, output: 3, cache_read: 4, cache_write_5m: 5, cache_write_1h: 6, cost_usd: 7 } } }) }];
  const text = describeUsage({ rows, tz: TZ, meter: { path: "scripts/token-cost.mjs", test: "scripts/token-cost.test.mjs" }, proof: { summary: "passed" }, scope: { describe: "every project on this machine" } }).join("\n");
  has(text, /INCOMPLETE/, "the row is marked");
  has(text, /Do not quote this row/, "and says what to do about it");
  has(text, /unpriced model\(s\): a-model/, "and names the model behind the mark");
});

check("the scorecard names the meter and the test that proved it in this run", () => {
  const text = describeUsage({ rows: [], tz: TZ, meter: { path: "scripts/token-cost.mjs", test: "scripts/token-cost.test.mjs" }, proof: { summary: "9 checks" }, scope: { describe: "every project on this machine" } }).join("\n");
  has(text, /proved in this run by scripts\/token-cost\.test\.mjs \(9 checks\)/, "the proof is named with the meter");
  has(text, /in America\/New_York/, "and the windows say what they are measured in");
});

// ---------- run ----------

function main() {
  const repo = [];
  if (gitThere) for (const [name, fn] of REPO_CHECKS) { try { fn(); repo.push({ name }); } catch (e) { repo.push({ name, fail: e.message }); } }
  for (const r of [...results, ...repo]) console.log(`${r.fail ? "FAIL" : "ok  "} ${r.name}${r.fail ? `: ${r.fail}` : ""}`);
  if (!gitThere) console.log(`NOT RUN    ${plural(REPO_CHECKS.length, "repository check")}: git is not on the path, so the windows the meter is asked for and the refusals were not checked`);
  for (const dir of TEMPS) rmSync(dir, { recursive: true, force: true });

  const failed = [...results, ...repo].filter((r) => r.fail).length;
  if (failed) {
    console.log(`\nusage check FAILED: ${plural(failed, "check")} of ${results.length + repo.length}`);
    return 1;
  }
  console.log(`\nusage check passed: ${plural(results.length, "check")} over the windows and the printed shape, and ${gitThere ? plural(repo.length, "check") : "no check"} over a fixture repository with a stubbed meter`);
  // A run that could not reach the repository checks has proved the arithmetic and none of the command. It reports
  // attention rather than success: a skipped check read as a pass is the failure this repository exists to stop.
  return gitThere ? 0 : 1;
}

process.exitCode = main();
