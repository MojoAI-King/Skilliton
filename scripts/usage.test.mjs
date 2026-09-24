#!/usr/bin/env node
// usage.test.mjs: `skilliton usage` groups the meter's reading by the batches that merged, refuses when the meter is
// not there, and reports nothing at all when the meter's own test fails (PLAN.md section 6; report card area 04
// batch 04 item 2).
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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PLUGIN_METER, batchRows, describeUsage, foldScopes, parseMerges, RECONSTRUCTION_NOTE } from "../packs/base/plugins/workflow/runtime/lib/usage.mjs";

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

// Two merges on one day and one on a later day. The pair must become one row, because the meter buckets by day and a
// row per merge would ask for the same day twice and count it twice.
const MERGES = parseMerges([
  ["cccccccccccccccccccccccccccccccccccccccc", "2026-09-18T09:00:00-04:00", "Merge the third"].join("\u0000"),
  ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "2026-09-16T22:30:00-04:00", "Merge the second"].join("\u0000"),
  ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "2026-09-16T10:00:00-04:00", "Merge the first"].join("\u0000"),
].join("\n"));

check("git's NUL separated fields are read back whole, subject included", () => {
  eq(MERGES.length, 3, "merges parsed");
  eq(MERGES[0].sha, "cccccccccccccccccccccccccccccccccccccccc", "the newest sha");
  eq(MERGES[0].shortSha, "cccccccccccc", "the short sha");
  eq(MERGES[0].subject, "Merge the third", "the subject");
});

check("two merges on one day are one row, and the rows tile the calendar", () => {
  const rows = batchRows(MERGES, TZ);
  eq(rows.length, 2, "rows");
  eq(rows[0].from, null, "the oldest row has no lower bound");
  eq(rows[0].to, "2026-09-16", "the oldest row ends on the day its merges landed");
  eq(rows[0].merges.length, 2, "both merges of that day are on one row");
  eq(rows[1].from, "2026-09-17", "the next row starts the day after the previous row ended");
  eq(rows[1].to, "2026-09-18", "the next row ends on its own merge day");
});

check("a day is never counted twice and never left out", () => {
  const rows = batchRows(MERGES, TZ);
  for (let i = 1; i < rows.length; i++) {
    const after = new Date(`${rows[i - 1].to}T00:00:00Z`);
    after.setUTCDate(after.getUTCDate() + 1);
    eq(rows[i].from, after.toISOString().slice(0, 10), `row ${i} begins the day after row ${i - 1} ended`);
  }
});

check("a limit keeps the newest rows and the new oldest row keeps its real lower bound", () => {
  const rows = batchRows(MERGES, TZ, { limit: 1 });
  eq(rows.length, 1, "rows kept");
  eq(rows[0].to, "2026-09-18", "the newest row is the one kept");
  eq(rows[0].from, "2026-09-17", "it keeps the bound it had, and does not become open ended");
});

check("a merge date git could not have written is reported, never guessed", () => {
  let message = null;
  try { batchRows(parseMerges(["abc", "not-a-date", "Merge"].join("\u0000")), TZ); } catch (e) { message = e.message; }
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
console.log(JSON.stringify({ files: 1, records: 2, tz, window: { from: argv[0], to: argv[1], until: null }, projects: [],
  unpriced_models: {}, incomplete: false,
  byScope: { main: { requests: 7, input: 1234, output: 56, cache_read: 78, cache_write_5m: 9, cache_write_1h: 0, cost_usd: 0.42 } } }));
`;

const PASSING_TEST = "#!/usr/bin/env node\nconsole.log(\"token-cost check passed: 9 checks\");\n";
const FAILING_TEST = "#!/usr/bin/env node\nconsole.log(\"token-cost check FAILED: 1 check of 9\");\nprocess.exit(1);\n";

// A repository with three merges, two of them on one day. The committer date is what %cI reports and what the rows
// are worked out from, so each merge is given one explicitly rather than inheriting the day the test happens to run.
function fixture({ meter = STUB_METER, meterTest = PASSING_TEST } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-usage-test-")));
  TEMPS.push(dir);
  const run = (args, at = null) => {
    const env = { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.invalid" };
    if (at) { env.GIT_AUTHOR_DATE = at; env.GIT_COMMITTER_DATE = at; }
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", env });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} exited ${r.status}: ${(r.stderr || r.stdout || "").trim()}`);
    return r.stdout;
  };
  run(["init", "-q", "-b", "main"]);
  run(["commit", "-q", "--allow-empty", "-m", "the first commit"], "2026-09-15T09:00:00-04:00");
  for (const [n, at] of [["one", "2026-09-16T10:00:00-04:00"], ["two", "2026-09-16T22:30:00-04:00"], ["three", "2026-09-18T09:00:00-04:00"]]) {
    run(["checkout", "-q", "-b", `batch-${n}`]);
    run(["commit", "-q", "--allow-empty", "-m", `work ${n}`], at);
    run(["checkout", "-q", "main"]);
    run(["merge", "-q", "--no-ff", `batch-${n}`, "-m", `Merge batch ${n}`], at);
  }
  if (meter !== null) {
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "scripts", "token-cost.mjs"), meter);
    if (meterTest !== null) writeFileSync(join(dir, "scripts", "token-cost.test.mjs"), meterTest);
  }
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

function usage(f, args = [], extraEnv = {}) {
  const r = spawnSync(process.execPath, [SKILLITON, "usage", "--dir", f.dir, ...args], {
    encoding: "utf8",
    env: { ...process.env, SKILLITON_TZ: TZ, STUB_METER_LOG: f.log, SKILLITON_PROJECTS: f.projects, ...extraEnv },
  });
  const logged = existsSync(f.log) ? readFileSync(f.log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const calls = logged.filter((c) => !isProbe(c));
  const probes = logged.length - calls.length;
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "", all: `${r.stdout ?? ""}${r.stderr ?? ""}`, calls, probes };
}

const REPO_CHECKS = [
  ["the meter is asked for whole day windows that tile the calendar", () => {
    const r = usage(fixture());
    eq(r.code, 0, `exit status (output was:\n${r.all})`);
    eq(r.calls.length, 2, `meter runs, one per batch row (calls: ${JSON.stringify(r.calls)})`);
    eq(r.calls[0].slice(0, 2).join(".."), "1970-01-01..2026-09-16", "the oldest window reaches back as far as the meter can see");
    eq(r.calls[1].slice(0, 2).join(".."), "2026-09-17..2026-09-18", "the next window begins the day after the previous one ended");
    for (const call of r.calls) eq(call[call.length - 1], "--json", "the meter is asked for JSON, never for its printed table");
    has(r.out, /2 batch row\(s\) from 3 merge\(s\)/, "the header counts the rows and the merges behind them");
    has(r.out, /\(earliest\)\.\.2026-09-16/, "the oldest row says it is open ended rather than inventing a start");
    has(r.out, /Merge batch one/, "each merge on a row is named");
    has(r.out, /Merge batch two/, "the second merge of a shared day is named too");
  }],
  ["a project filter reaches the meter and nothing else", () => {
    const r = usage(fixture(), ["--project", "one-project,another"]);
    eq(r.code, 0, `exit status (output was:\n${r.all})`);
    eq(r.calls[0].join(" "), "1970-01-01 2026-09-16 --project one-project --project another --json", "each name is passed through as the meter takes it");
  }],
  ["--since narrows the merges, and --limit narrows the rows", () => {
    const since = usage(fixture(), ["--since", "HEAD~1"]);
    eq(since.code, 0, `--since exit status (output was:\n${since.all})`);
    has(since.out, /1 batch row\(s\) from 1 merge\(s\) after HEAD~1/, "only the merges after the revision are counted");
    const limited = usage(fixture(), ["--limit", "1"]);
    eq(limited.calls.length, 1, "one row means one meter run");
    eq(limited.calls[0].slice(0, 2).join(".."), "2026-09-17..2026-09-18", "the row kept is the newest one");
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
    eq(parsed.rows.length, 2, "rows in the JSON");
    eq(parsed.rows[0].from, null, "the oldest row is open ended in the JSON too");
    eq(parsed.rows[1].from, "2026-09-17", "the next row's lower bound");
    eq(parsed.tz, TZ, "the timezone the windows were worked out in");
    eq(parsed.reconstruction, RECONSTRUCTION_NOTE, "the note travels with the JSON");
    // 7 is one stub run, not two. A row per merge would have asked the meter for 2026-09-16 twice and this would
    // read 14: the day bucketing is what stops the shared day being counted once for each merge that landed on it.
    eq(parsed.rows[0].total.requests, 7, "a day carrying two merges is read once, not once per merge");
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
    hasNot(r.out, /^note:/m, "and no notice: there was nothing of the project's to pass over");
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
    has(r.out, /does not speak the meter's contract \(its --json answer lacks byScope, tz, incomplete, unpriced_models\)/, "every missing key is named");
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
    has(r.all, /does not speak the meter's contract: its --json answer lacks byScope, tz, incomplete, unpriced_models\. Nothing was written/, "the refusal names it");
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
  ["a repository with no merge at all says so and asks the meter nothing", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "skilliton-usage-test-bare-")));
    TEMPS.push(dir);
    const env = { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.invalid" };
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir, env });
    spawnSync("git", ["commit", "-q", "--allow-empty", "-m", "only commit"], { cwd: dir, env });
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "scripts", "token-cost.mjs"), STUB_METER);
    writeFileSync(join(dir, "scripts", "token-cost.test.mjs"), PASSING_TEST);
    const f = withTranscripts({ dir, log: join(dir, "meter-calls.log") });
    const r = usage(f);
    eq(r.code, 0, `exit status (output was:\n${r.all})`);
    has(r.out, /no merge commit was found/, "it says there is no batch to report");
    eq(r.calls.length, 0, "and the meter was not run");
  }],
];

// ---------- the printed shape, without a repository ----------

check("an incomplete row is marked, and the mark tells the reader not to quote it", () => {
  const rows = [{ from: null, to: "2026-09-16", merges: [{ shortSha: "abcdefabcdef", subject: "Merge a batch" }],
    folded: foldScopes({ incomplete: true, unpriced_models: { "a-model": 1 }, byScope: { main: { requests: 1, input: 2, output: 3, cache_read: 4, cache_write_5m: 5, cache_write_1h: 6, cost_usd: 7 } } }) }];
  const text = describeUsage({ rows, tz: TZ, meter: { path: "scripts/token-cost.mjs", test: "scripts/token-cost.test.mjs" }, proof: { summary: "passed" }, projects: [] }).join("\n");
  has(text, /INCOMPLETE/, "the row is marked");
  has(text, /Do not quote this row/, "and says what to do about it");
  has(text, /unpriced model\(s\): a-model/, "and names the model behind the mark");
});

check("the scorecard names the meter and the test that proved it in this run", () => {
  const text = describeUsage({ rows: [], tz: TZ, meter: { path: "scripts/token-cost.mjs", test: "scripts/token-cost.test.mjs" }, proof: { summary: "9 checks" }, projects: [] }).join("\n");
  has(text, /proved in this run by scripts\/token-cost\.test\.mjs \(9 checks\)/, "the proof is named with the meter");
  has(text, /whole days in America\/New_York/, "and the windows say what they are measured in");
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
