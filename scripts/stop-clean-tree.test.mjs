#!/usr/bin/env node
// stop-clean-tree.test.mjs: the Stop checkpoint reminder never fires on a clean working tree
// (packs/base/plugins/workflow/runtime/lib/session-hooks.mjs, evaluateStop).
//
// Measured 2026-09-22 on this repository's main: a checkpoint was taken, its records were committed, and the next stop
// was held with "the working tree has changed since the last checkpoint" although `git status` printed nothing. The
// fingerprint the reminder compares is HEAD plus the porcelain status (lib/journal.mjs, fingerprintOf), so the commit
// that saved the checkpoint's own records was enough to change it. The rule now: no porcelain lines, no reminder; a
// dirty tree is judged exactly as before; a merge on a clean tree is the maintenance reminder's to raise, on its own.
//
// Hooks run the way Claude Code runs them: the shipped bin/skilliton by path with the hook JSON on stdin. Each test
// works in its own folder under os.tmpdir() with HOME pointed inside it, and removes it afterwards. The mutation check
// runs the same sequence against a copy of the plugin with the clean-tree line removed and proves the key assertion
// fails there, so the assertion is not one that passes whatever the code does.
//
//   node --test scripts/stop-clean-tree.test.mjs

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");
const PLUGIN = join(here, "..", "packs", "base", "plugins", "workflow");
const BIN = join(PLUGIN, "bin", "skilliton");
const HOOKS_LIB = join(PLUGIN, "runtime", "lib", "session-hooks.mjs");
const { evaluateStop } = await import(pathToFileURL(HOOKS_LIB).href);

// The line under test, exactly as shipped. The mutation check removes it from a copy.
const CLEAN_TREE_LINE = '  if (state.dirty === 0) return { block: false, why: `the working tree is clean, so nothing is waiting to be recorded; the commits since the ${fromCheckpoint ? "last checkpoint" : "session started"} carry their own messages` };\n';

// ---------------------------------------------------------------- harness

async function withTemp(label, body) {
  const dir = mkdtempSync(join(tmpdir(), `skilliton-stop-clean-${label}-`));
  const home = join(dir, "home");
  mkdirSync(home);
  const env = {
    ...process.env,
    HOME: home, XDG_CONFIG_HOME: join(home, ".config"), GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com",
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}`,
  };
  for (const key of ["SKILLITON_SELF", "SKILLITON_DEBUG", "CLAUDE_PROJECT_DIR", "CLAUDE_PLUGIN_ROOT", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[key];
  try {
    await body({ dir, env });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const git = (cwd, args, env) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const commit = (cwd, env, message) => { git(cwd, ["add", "-A"], env); git(cwd, ["-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", message], env); };
const porcelain = (cwd, env) => git(cwd, ["status", "--porcelain=v1", "-uall"], env);

function cli(cwd, args, env) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}

function hook(cwd, event, payload, env, { bin = BIN } = {}) {
  const input = JSON.stringify({ cwd, hook_event_name: event, ...payload });
  const r = spawnSync(bin, ["hook", event], { cwd, env, input, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}

const journalFile = (dir, env) => join(git(dir, ["rev-parse", "--absolute-git-dir"], env).trim(), "skilliton", "journal.jsonl");
function readEvents(dir, env) {
  const file = journalFile(dir, env);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}
// Moves the matching events earlier by `minutes`, so a stop can be past checkpoints.minMinutes without waiting.
function backdate(dir, env, match, minutes) {
  const file = journalFile(dir, env);
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => {
    const e = JSON.parse(line);
    return JSON.stringify(match(e) ? { ...e, at: new Date(Date.parse(e.at) - minutes * 60000).toISOString() } : e);
  });
  writeFileSync(file, `${lines.join("\n")}\n`);
}

// The measured sequence up to the stop: a session that started an hour ago on `branch`, a task, a change, a
// checkpoint of it 25 minutes ago (past minMinutes of 20), and then the commit of the change and the records.
function checkpointThenCommit(p, env, { branch = "main" } = {}) {
  mkdirSync(p, { recursive: true });
  git(p, ["init", "-q"], env);
  git(p, ["symbolic-ref", "HEAD", `refs/heads/${branch}`], env);
  mkdirSync(join(p, ".skilliton"), { recursive: true });
  writeFileSync(join(p, ".skilliton", "config.json"), `${JSON.stringify({ checkpoints: { minMinutes: 20 } }, null, 2)}\n`);
  writeFileSync(join(p, "README.md"), "# fixture\n");
  commit(p, env, "init");
  assert.equal(hook(p, "session-start", { session_id: "s1" }, env).code, 0);
  backdate(p, env, (e) => e.event === "session-start", 60);
  const started = cli(p, ["task", "start", "Record the work", "--criteria", "it is recorded", "--apply"], env);
  assert.equal(started.code, 0, started.all);
  writeFileSync(join(p, "work.txt"), "the change\n");
  const cp = cli(p, ["checkpoint", "--state", "the change is made", "--evidence", "none needed", "--next", "commit it", "--apply"], env);
  assert.equal(cp.code, 0, cp.all);
  backdate(p, env, (e) => e.event === "checkpoint", 25);
  commit(p, env, "the change and its checkpoint records");
  assert.equal(porcelain(p, env), "", "the tree is clean after the commit, as it was when this was measured");
  return p;
}

const stop = (p, env, bin = BIN) => {
  const r = hook(p, "stop", { session_id: "s1", stop_hook_active: false }, env, { bin });
  assert.equal(r.code, 0, r.all);
  return r;
};

// ---------------------------------------------------------------- the rule itself

test("evaluateStop: a clean tree with a moved HEAD is not reminded, and the why says the commits carry their messages", () => {
  const now = new Date("2026-09-22T12:00:00Z");
  const events = [
    { event: "session-start", session: "s1", at: "2026-09-22T11:00:00.000Z", fingerprint: "start" },
    { event: "checkpoint", at: "2026-09-22T11:30:00.000Z", fingerprint: "at-checkpoint", head: "a".repeat(40) },
  ];
  const base = { stopHookActive: false, checkpoints: { stopReminder: true, minMinutes: 20 }, events, session: "s1", now };
  const clean = evaluateStop({ ...base, state: { fingerprint: "after-commit", dirty: 0 } });
  assert.equal(clean.block, false);
  assert.equal(clean.why, "the working tree is clean, so nothing is waiting to be recorded; the commits since the last checkpoint carry their own messages");
  const dirty = evaluateStop({ ...base, state: { fingerprint: "after-commit", dirty: 1 } });
  assert.equal(dirty.block, true, "the same window with one uncommitted path is reminded, exactly as before");
  assert.equal(dirty.baseline, "checkpoint");
  assert.equal(dirty.elapsedMinutes, 30);
  const fromStart = evaluateStop({ ...base, events: events.slice(0, 1), state: { fingerprint: "after-commit", dirty: 0 } });
  assert.equal(fromStart.block, false);
  assert.match(fromStart.why, /the commits since the session started carry their own messages$/);
});

// ---------------------------------------------------------------- through the shipped hook

test("the measured sequence: checkpoint, commit, clean tree, stop does not block", async () => withTemp("measured", async ({ dir, env }) => {
  const p = checkpointThenCommit(join(dir, "p"), env);
  const r = stop(p, env);
  assert.equal(r.out, "", `a clean tree after the checkpoint's commit is not held:\n${r.all}`);
  assert.equal(readEvents(p, env).filter((e) => e.event === "stop-reminded").length, 0, "no reminder was recorded");
}));

test("a dirty tree after a checkpoint and past minMinutes still blocks", async () => withTemp("dirty", async ({ dir, env }) => {
  const p = checkpointThenCommit(join(dir, "p"), env);
  writeFileSync(join(p, "more.txt"), "work after the commit\n");
  const r = stop(p, env);
  assert.notEqual(r.out, "", `a changed tree is still reminded:\n${r.all}`);
  const decision = JSON.parse(r.out);
  assert.equal(decision.decision, "block");
  assert.match(decision.reason, /Skilliton checkpoint reminder: the working tree has changed since the last checkpoint \(25 minutes ago\)\./);
  assert.equal(readEvents(p, env).filter((e) => e.event === "stop-reminded").length, 1);
}));

// A lane merged into `branch` after the checkpoint, and the tree left clean.
function mergeAfterCheckpoint(p, env, branch) {
  git(p, ["checkout", "-q", "-b", "lane/one"], env);
  writeFileSync(join(p, "lane.txt"), "lane work\n");
  commit(p, env, "lane: one item");
  git(p, ["checkout", "-q", branch], env);
  git(p, ["-c", "commit.gpgsign=false", "merge", "-q", "--no-ff", "-m", "merge lane/one", "lane/one"], env);
  assert.equal(porcelain(p, env), "", "the merge left the tree clean");
}

test("a clean tree with a merge since the checkpoint does not block for a checkpoint; maintenance holds on its own", async () => withTemp("merge", async ({ dir, env }) => {
  // Not an integration branch: nothing holds the session at all.
  const lane = checkpointThenCommit(join(dir, "lane"), env, { branch: "work" });
  mergeAfterCheckpoint(lane, env, "work");
  const quiet = stop(lane, env);
  assert.equal(quiet.out, "", `no checkpoint reminder for a merge on a clean tree:\n${quiet.all}`);

  // The integration branch: the maintenance reminder is the whole reason, and the checkpoint reminder is absent.
  const main = checkpointThenCommit(join(dir, "main"), env);
  mergeAfterCheckpoint(main, env, "main");
  const held = stop(main, env);
  assert.notEqual(held.out, "", `maintenance is due after a merge on main:\n${held.all}`);
  const reason = JSON.parse(held.out).reason;
  assert.match(reason, /^Skilliton maintenance is due: 1 merge commit\(s\) landed/);
  assert.doesNotMatch(reason, /checkpoint reminder/, "the checkpoint reminder does not ride along on a clean tree");
  const events = readEvents(main, env);
  assert.equal(events.filter((e) => e.event === "stop-reminded").length, 0);
  assert.equal(events.filter((e) => e.event === "maintain-reminded").length, 1);
}));

// ---------------------------------------------------------------- mutation check

test("mutation check: without the clean-tree line, the measured sequence blocks, so the assertion above can fail", async () => withTemp("mutant", async ({ dir, env }) => {
  const copy = join(dir, "plugin-copy");
  cpSync(PLUGIN, copy, { recursive: true });
  const file = join(copy, "runtime", "lib", "session-hooks.mjs");
  const text = readFileSync(file, "utf8");
  assert.equal(text.split(CLEAN_TREE_LINE).length, 2, "the clean-tree line is in the shipped file exactly once");
  writeFileSync(file, text.replace(CLEAN_TREE_LINE, ""));
  const mutantBin = join(copy, "bin", "skilliton");

  const shipped = checkpointThenCommit(join(dir, "shipped"), env);
  assert.equal(stop(shipped, env).out, "", "control: the shipped hook allows the stop");
  const mutated = checkpointThenCommit(join(dir, "mutated"), env);
  const r = stop(mutated, env, mutantBin);
  assert.notEqual(r.out, "", "the mutant holds the clean tree, which is the measured defect");
  assert.match(JSON.parse(r.out).reason, /the working tree has changed since the last checkpoint/);
}));
