#!/usr/bin/env node
// dispatch-close.test.mjs: `skilliton dispatch close` (packs/base/plugins/workflow/runtime/lib/dispatch.mjs, planClose
// and applyClose). Kept out of scripts/dispatch.test.mjs so that file stays under the size its lint allows.
//
//   node --test scripts/dispatch-close.test.mjs
//
// Three lanes are dispatched for real (dispatch --apply writes each lane's task record and commits it on the lane
// branch); two are merged into main and one is not. Close must mark exactly the two merged lanes' task records merged,
// detach exactly their folders, leave the third alone, refuse the whole close when a merged lane's folder holds
// uncommitted work, and never delete a branch or a folder. It also prints each merged lane folder's own cost and peak
// context from the meter against the context bound, names the lane that ran past it, and appends those lines to the
// lane's LANE_REPORT.md under the sixth heading.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { folderNameFor } from "../packs/base/plugins/workflow/runtime/meter/projects.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");

const BASE_ENV = (() => {
  const env = {
    ...process.env, SKILLITON_SELF: "skilliton", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Skilliton Test", GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Skilliton Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  delete env.SKILLITON_DEBUG;
  return env;
})();

const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { env: BASE_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const gitStatus = (dir, ...args) => spawnSync("git", ["-C", dir, ...args], { env: BASE_ENV, encoding: "utf8" }).status;

const PLAN = `Base commit: {base}

## Lane: alpha   branch: lane/alpha-0924   model: sonnet   context ceiling: 120000
N1. [TOUCH] Alpha work: src/alpha.txt: it exists

## Lane: beta   branch: lane/beta-0924   model: sonnet   context ceiling: 120000
N2. [TOUCH] Beta work: src/beta.txt: it exists

## Lane: gamma   branch: lane/gamma-0924   model: sonnet   context ceiling: 120000
N3. [TOUCH] Gamma work: src/gamma.txt: it exists
`;

// A repository with three dispatched lanes; alpha and beta each commit a file and are merged into main, gamma is not.
function fixture(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), "skilliton-dispatch-close-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ctx = { base, dir: join(base, "repo"), home: join(base, "home"), laneRoot: join(base, "repo-lanes"), projects: join(base, "projects") };
  for (const d of [ctx.dir, ctx.home, ctx.projects]) mkdirSync(d);
  git(ctx.dir, "init", "-q", "-b", "main");
  writeFileSync(join(ctx.dir, "README.md"), "# repo\n");
  git(ctx.dir, "add", "-A");
  git(ctx.dir, "commit", "-q", "-m", "first");
  writeFileSync(join(ctx.dir, "LANES.md"), PLAN.replace("{base}", git(ctx.dir, "rev-parse", "HEAD").trim()));
  const made = sg(ctx, ["dispatch", "--apply"]);
  assert.equal(made.code, 0, made.err || made.out);
  ctx.lane = (name) => join(ctx.laneRoot, name);
  for (const name of ["alpha", "beta", "gamma"]) {
    mkdirSync(join(ctx.lane(name), "src"), { recursive: true });
    writeFileSync(join(ctx.lane(name), "src", `${name}.txt`), `${name}\n`);
    git(ctx.lane(name), "add", "-A");
    git(ctx.lane(name), "commit", "-q", "-m", `N1: ${name} work`);
  }
  for (const name of ["alpha", "beta"]) git(ctx.dir, "merge", "-q", "--no-ff", "-m", `Merge ${name}`, `lane/${name}-0924`);
  return ctx;
}

function sg(ctx, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: ctx.dir, env: { ...BASE_ENV, HOME: ctx.home, SKILLITON_PROJECTS: ctx.projects }, encoding: "utf8" });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "", all: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

// The State of the task record for a lane, as it stands in the main checkout's working tree, or null when it is not there.
function stateOf(ctx, name) {
  const dir = join(ctx.dir, "docs", "tasks");
  const file = existsSync(dir) ? readdirSync(dir).find((f) => f.includes(`-lane-${name}-`)) : null;
  return file ? /^- \*\*State:\*\* (\S+)/m.exec(readFileSync(join(dir, file), "utf8"))?.[1] ?? null : null;
}
const onBranch = (ctx, name) => gitStatus(ctx.lane(name), "symbolic-ref", "-q", "HEAD") === 0;
const branches = (ctx) => git(ctx.dir, "branch", "--format=%(refname:short)").split("\n").filter(Boolean).sort();

test("preview names every lane, one line each, and writes nothing", (t) => {
  const ctx = fixture(t);
  const r = sg(ctx, ["dispatch", "close"]);
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /^skilliton dispatch close \(preview\): 3 lane branches, 2 merged into main$/m);
  assert.match(r.out, /^ {2}lane\/alpha-0924 +merged: task \S+-lane-alpha-\S+ would close as merged; \S+alpha would be detached to this branch$/m);
  assert.match(r.out, /^ {2}lane\/beta-0924 +merged: task \S+ would close as merged/m);
  assert.match(r.out, /^ {2}lane\/gamma-0924 +not merged into this branch; left alone$/m);
  assert.deepEqual([stateOf(ctx, "alpha"), stateOf(ctx, "beta"), stateOf(ctx, "gamma")], ["in-progress", "in-progress", null]);
  assert.equal(onBranch(ctx, "alpha"), true, "the preview detached nothing");
});

test("apply closes the two merged lanes' task records and detaches their folders, and leaves the third alone", (t) => {
  const ctx = fixture(t);
  const before = branches(ctx);
  // Alpha's record is missing from this working tree, so close has to bring it back the way dispatch merge does
  // before it can close it.
  const tasks = join(ctx.dir, "docs", "tasks");
  rmSync(join(tasks, readdirSync(tasks).find((f) => f.includes("-lane-alpha-"))));
  const r = sg(ctx, ["dispatch", "close", "--apply"]);
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /^1 record brought back: docs\/tasks\/\S+-lane-alpha-\S+\.md$/m);
  assert.match(r.out, /^ {2}lane\/alpha-0924 +merged: task \S+ closed as merged; \S+alpha now detached to this branch$/m);
  assert.deepEqual([stateOf(ctx, "alpha"), stateOf(ctx, "beta"), stateOf(ctx, "gamma")], ["merged", "merged", null]);
  assert.deepEqual([onBranch(ctx, "alpha"), onBranch(ctx, "beta"), onBranch(ctx, "gamma")], [false, false, true]);
  assert.equal(git(ctx.lane("alpha"), "rev-parse", "HEAD").trim(), git(ctx.dir, "rev-parse", "main").trim(), "detached at the integration branch");
  assert.deepEqual(branches(ctx), before, "no branch was deleted");
  for (const name of ["alpha", "beta", "gamma"]) assert.equal(existsSync(ctx.lane(name)), true, `the ${name} folder is still there`);
  assert.equal(existsSync(join(ctx.dir, ".git", "skilliton-backups")), true, "the task records were backed up before they changed");
  const again = sg(ctx, ["dispatch", "close", "--apply"]);
  assert.equal(again.code, 0, again.all);
  assert.match(again.out, /^ {2}lane\/alpha-0924 +merged: task already merged; \S+alpha already detached$/m, "a second close changes nothing");
});

test("a merged lane whose folder holds uncommitted work refuses the whole close, naming the folder, with nothing written", (t) => {
  const ctx = fixture(t);
  writeFileSync(join(ctx.lane("beta"), "src", "unsaved.txt"), "not committed\n");
  const r = sg(ctx, ["dispatch", "close", "--apply"]);
  assert.equal(r.code, 2, r.all);
  assert.match(r.err, /repo-lanes\/beta \(1 uncommitted change\(s\)\) must be committed or cleared before its lane is closed.*Nothing was written/);
  assert.deepEqual([stateOf(ctx, "alpha"), stateOf(ctx, "beta")], ["in-progress", "in-progress"], "no task record changed");
  assert.deepEqual([onBranch(ctx, "alpha"), onBranch(ctx, "beta")], [true, true], "no folder was detached, the clean one included");
});

// One request in a lane folder's own transcripts, filed under the folder name Claude Code would give that folder.
function laneRequest(ctx, name, context) {
  const folder = join(ctx.projects, folderNameFor(ctx.lane(name)));
  mkdirSync(folder, { recursive: true });
  const line = { requestId: `r-${name}`, timestamp: "2026-09-23T12:00:00Z",
    message: { id: `m-${name}`, model: "claude-sonnet-5", usage: { input_tokens: context, output_tokens: 10 } } };
  writeFileSync(join(folder, "s.jsonl"), `${JSON.stringify(line)}\n`);
}

test("each merged lane's cost and peak context is printed against the bound, and appended to its report", (t) => {
  const ctx = fixture(t);
  laneRequest(ctx, "alpha", 250000);
  laneRequest(ctx, "beta", 1000);
  laneRequest(ctx, "gamma", 999999);
  const report = join(ctx.lane("alpha"), "LANE_REPORT.md");
  writeFileSync(report, "# Lane report\n\n## Commits by item\n\n- abc N1\n\nLANE DONE\n");
  const preview = sg(ctx, ["dispatch", "close"]);
  assert.equal(preview.code, 0, preview.all);
  assert.match(preview.out, /^ {2}lane alpha: 1 request\(s\), 250,010 tokens, est usd 0\.50, peak context 250,000 against a bound of 200,000, PAST THE BOUND$/m);
  assert.match(preview.out, /^ {2}lane beta: 1 request\(s\), 1,010 tokens, est usd 0\.00, peak context 1,000 against a bound of 200,000$/m);
  assert.match(preview.out, /^ {2}ran past the context bound of 200,000: alpha$/m);
  assert.doesNotMatch(preview.out, /lane gamma:/, "an unmerged lane is not measured");
  assert.match(preview.out, /It is not a bill/);
  assert.doesNotMatch(readFileSync(report, "utf8"), /Cost and peak context/, "the preview appended nothing");
  const r = sg(ctx, ["dispatch", "close", "--apply"]);
  assert.equal(r.code, 0, r.all);
  const text = readFileSync(report, "utf8");
  assert.match(text, /## Cost and peak context\n\nMeasured by skilliton dispatch close on \d{4}-\d{2}-\d{2}[^\n]*\n- lane alpha: 1 request\(s\)[^\n]*PAST THE BOUND\n- ran past the context bound of 200,000\n\nLANE DONE\n$/,
    "the section goes in before LANE DONE");
  assert.equal(gitStatus(ctx.lane("alpha"), "diff", "--quiet"), 0, "the report is not a tracked change");
  sg(ctx, ["dispatch", "close", "--apply"]);
  assert.equal(readFileSync(report, "utf8"), text, "a second close does not append the same lines twice");
});
