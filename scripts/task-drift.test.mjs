// task-drift.test.mjs: N14 (backlog B74). When the current task has criteria and five or more checkpoints, and at
// least two of its open criteria have no trace in its checkpoints or in the files touched since its first one, the
// stop hook's checkpoint reminder gains one sentence naming them and offering a split; a task on track gets nothing.
// The sentence rides on the reminder, so it is said once per working tree state, and it never blocks by itself.
//   node scripts/task-drift.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { assessDrift, driftSentence } from "../packs/base/plugins/workflow/runtime/lib/task-drift.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");
const base = mkdtempSync(join(tmpdir(), "skilliton-task-drift-"));
process.on("exit", () => rmSync(base, { recursive: true, force: true }));
let count = 0;

const CRITERIA = ["Add a frobnicator widget to the parser", "Rewrite the zanzibar exporter", "Document the quokka setting in the guide"];
const DRIFT_RE = /Drift check: (\d+) of this task's (\d+) criteria have no trace in its (\d+) checkpoints/;

// ---------------------------------------------------------------- the comparison, on values

test("the comparison: a drifted task names its untraced criteria and the folders no criterion names", () => {
  const criteria = CRITERIA.map((text) => ({ done: false, text }));
  const drifted = assessDrift({ criteria, checkpoints: 5, checkpointText: "styled the login page", touched: ["web/login.css"] });
  assert.deepEqual(drifted.untraced, CRITERIA);
  assert.deepEqual(drifted.folders, ["web"]);
  const sentence = driftSentence({ result: drifted }, "skilliton");
  assert.match(sentence, DRIFT_RE);
  assert.match(sentence, /while the work touched web, which no criterion names/);
  assert.match(sentence, /skilliton task start "<title for the untraced criteria>" --criteria "<each untraced criterion>" --branch <its own branch> --apply\. This is a note and not a block\.$/);
});

test("the comparison: on track, below the thresholds, and ticked criteria say nothing", () => {
  const criteria = CRITERIA.map((text) => ({ done: false, text }));
  const onTrack = assessDrift({ criteria, checkpoints: 6, checkpointText: "the parser has its frobnicator; the exporter is rewritten", touched: ["src/parser.js"] });
  assert.deepEqual(onTrack.untraced, ["Document the quokka setting in the guide"], "one untraced criterion is not drift");
  assert.equal(driftSentence({ result: onTrack }, "skilliton"), null);
  assert.equal(assessDrift({ criteria, checkpoints: 4, checkpointText: "", touched: [] }), null, "four checkpoints is too young to judge");
  assert.equal(assessDrift({ criteria: criteria.slice(0, 1), checkpoints: 9, checkpointText: "", touched: [] }), null, "one criterion cannot have two untraced");
  const ticked = assessDrift({ criteria: criteria.map((c, i) => ({ ...c, done: i > 0 })), checkpoints: 5, checkpointText: "", touched: [] });
  assert.deepEqual(ticked.untraced, [CRITERIA[0]], "a ticked criterion was done, so it is never untraced");
  assert.match(driftSentence({ problem: "the record could not be read" }, "skilliton"), /the drift check did not run \(the record could not be read\)/);
});

// ---------------------------------------------------------------- through the stop hook

// A prepared repository on a work branch, reminding at the first changed stop (minMinutes 0), with one task holding
// CRITERIA and the given checkpoints.
function fixture(checkpoints) {
  const dir = join(base, `r${++count}`), home = join(base, `home${count}`);
  mkdirSync(dir);
  mkdirSync(home);
  const env = {
    ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid",
    GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid",
  };
  for (const key of ["SKILLITON_SELF", "CLAUDE_PROJECT_DIR", "CLAUDE_PLUGIN_ROOT", "GIT_DIR", "GIT_WORK_TREE"]) delete env[key];
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { env, stdio: "ignore" });
  const run = (args, input) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, env, encoding: "utf8", input });
    return { code: r.status, out: r.stdout, all: `${r.stdout}${r.stderr}` };
  };
  git("init", "-q", "-b", "main");
  assert.equal(run(["prepare", "--apply"]).code, 0, "fixture: prepare --apply");
  const configFile = join(dir, ".skilliton", "config.json");
  const config = JSON.parse(readFileSync(configFile, "utf8"));
  writeFileSync(configFile, `${JSON.stringify({ ...config, checkpoints: { ...config.checkpoints, minMinutes: 0 } }, null, 2)}\n`);
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-q", "-m", "prepared");
  git("checkout", "-q", "-b", "work");
  const start = run(["task", "start", "Parser work", ...CRITERIA.flatMap((c) => ["--criteria", c]), "--apply"]);
  assert.equal(start.code, 0, `fixture: task start: ${start.all}`);
  for (const { state, file } of checkpoints) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), `${state}\n`);
    const r = run(["checkpoint", "--state", state, "--next", "keep going", "--apply"]);
    assert.equal(r.code, 0, `fixture: checkpoint: ${r.all}`);
  }
  const stop = () => run(["hook", "stop"], JSON.stringify({ cwd: dir, session_id: "s1", stop_hook_active: false }));
  return { dir, stop, git };
}

test("a drifted task: the stop reason gains the drift sentence, once for that working tree state, and it is not a block of its own", () => {
  const f = fixture([1, 2, 3, 4, 5].map((i) => ({ state: `styled the login page, pass ${i}`, file: `web/login-${i}.css` })));
  // Committed, so the touched paths come from the commits since the first checkpoint, and one more left uncommitted.
  f.git("add", "-A");
  f.git("-c", "commit.gpgsign=false", "commit", "-q", "-m", "login styles");
  writeFileSync(join(f.dir, "web", "login-6.css"), "more\n");
  const first = f.stop();
  assert.equal(first.code, 0, first.all);
  const decision = JSON.parse(first.out);
  assert.equal(decision.decision, "block", "the checkpoint reminder blocks, as it would without the drift check");
  const m = DRIFT_RE.exec(decision.reason);
  assert.ok(m, `expected the drift sentence in: ${decision.reason}`);
  assert.deepEqual([m[1], m[2], m[3]], ["3", "3", "5"]);
  assert.match(decision.reason, /"Rewrite the zanzibar exporter"/);
  assert.match(decision.reason, /while the work touched web, which no criterion names/);
  assert.ok(decision.reason.endsWith("--apply"), "the checkpoint command is still the last thing in the reason");
  const second = f.stop();
  assert.equal(second.out, "", "the same working tree state is not reminded, or drift-checked, twice");
});

test("a task on track: the same reminder, with no drift sentence", () => {
  const f = fixture([
    { state: "frobnicator widget sketched in the parser", file: "src/parser.js" },
    { state: "zanzibar exporter rewritten", file: "src/exporter.js" },
    { state: "quokka setting documented in the guide", file: "guide/settings.md" },
    { state: "parser tests pass", file: "src/parser.test.js" },
    { state: "exporter tests pass", file: "src/exporter.test.js" },
  ]);
  // A new file: the fingerprint is HEAD plus porcelain, so more bytes in a file already untracked would not change it.
  writeFileSync(join(f.dir, "src", "parser-extra.js"), "more\n");
  const decision = JSON.parse(f.stop().out);
  assert.equal(decision.decision, "block");
  assert.doesNotMatch(decision.reason, /Drift check|drift check did not run/);
});
