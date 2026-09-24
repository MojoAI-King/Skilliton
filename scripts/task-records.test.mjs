#!/usr/bin/env node
// task-records.test.mjs: a checkpoint written by hand is named, not silently lost (packs/base/plugins/workflow/runtime/
// lib/tasks.mjs parseTask unreadCheckpointLines, shown by commands/task.mjs task show and lib/session-hooks.mjs).
//
// A task record whose Checkpoints section held a hand-edited entry reported "0 checkpoints" with no word about it.
// Now the lines under Checkpoints that are not part of a checkpoint as the parser reads one are counted, and task
// show and the session-start task line say how many and how to record them. And task close --apply regenerates the
// open-task index in the status record (commands/task.mjs, lib/records.mjs regenerateIndexes narrowed to tasks).
//
// Commands run the way a person runs them: node scripts/skilliton.mjs, and the shipped bin/skilliton for hooks. Each
// test works in its own folder under os.tmpdir(), with HOME pointed inside it, and removes it afterwards.
//
//   node --test scripts/task-records.test.mjs

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");
const PLUGIN = join(here, "..", "packs", "base", "plugins", "workflow");
const BIN = join(PLUGIN, "bin", "skilliton");
const INSTALLED = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
const lib = (name) => import(pathToFileURL(join(PLUGIN, "runtime", "lib", name)).href);
const [{ parseTask }, { regenerateIndexes }, { loadProject }] = await Promise.all([lib("tasks.mjs"), lib("records.mjs"), lib("prepare.mjs")]);

const UNREAD = (n) => new RegExp(`${n} line\\(s\\) under Checkpoints could not be read as checkpoints; record them with \\S.* checkpoint`);

async function withTemp(label, body) {
  const dir = mkdtempSync(join(tmpdir(), `skilliton-task-records-${label}-`));
  const home = join(dir, "home");
  mkdirSync(home);
  const env = {
    ...process.env,
    HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config"), GIT_CONFIG_NOSYSTEM: "1",
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

// A repository on main with a Skilliton configuration and a status record, everything committed.
function preparedRepo(dir, env) {
  mkdirSync(join(dir, ".skilliton"), { recursive: true });
  git(dir, ["init", "-q"], env);
  git(dir, ["symbolic-ref", "HEAD", "refs/heads/main"], env);
  writeFileSync(join(dir, ".skilliton", "config.json"), `${JSON.stringify({ prepare: { version: 3, requires: { workflow: INSTALLED } } }, null, 2)}\n`);
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "STATUS.md"), "# Status\n\nKind: Living.\n");
  commit(dir, env, "prepare");
  return dir;
}

function cli(cwd, args, env) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}

function hook(cwd, event, payload, env) {
  const r = spawnSync(BIN, ["hook", event], { cwd, env, input: JSON.stringify({ cwd, hook_event_name: event, ...payload }), encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}

function startTask(dir, env, title) {
  const r = cli(dir, ["task", "start", title, "--criteria", "It works", "--apply"], env);
  assert.equal(r.code, 0, r.all);
  const m = /created (\S+\/([^/\s]+))\.md/.exec(r.out);
  assert.ok(m, r.all);
  return { id: m[2], file: join(dir, `${m[1]}.md`) };
}

// Replaces what sits between "## Checkpoints" and "## Handoff" with body.
function setCheckpoints(file, body) {
  const text = readFileSync(file, "utf8");
  writeFileSync(file, text.replace(/## Checkpoints\n[\s\S]*?## Handoff/, `## Checkpoints\n\n${body}\n## Handoff`));
}

// ---------------------------------------------------------------- N36: hand-written checkpoints are named

test("task show names lines under Checkpoints that are not checkpoints", async () => withTemp("show", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  const { id, file } = startTask(p, env, "Hand edited");
  setCheckpoints(file, "- 2026-09-24: finished the form, tests pass\n- next: the error page\n");
  const shown = cli(p, ["task", "show", id], env);
  assert.equal(shown.code, 0, shown.all);
  assert.match(shown.out, /^Checkpoints: 0$/m);
  assert.match(shown.out, UNREAD(2));
}));

test("a record with only written checkpoints, or none, says nothing extra", async () => withTemp("clean", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  const { id } = startTask(p, env, "Recorded");
  assert.doesNotMatch(cli(p, ["task", "show", id], env).out, /could not be read/);
  const cp = cli(p, ["checkpoint", "--task", id, "--state", "a state", "--evidence", "a check", "--next", "a step", "--apply"], env);
  assert.equal(cp.code, 0, cp.all);
  const shown = cli(p, ["task", "show", id], env);
  assert.match(shown.out, /^Checkpoints: 1$/m);
  assert.doesNotMatch(shown.out, /could not be read/);
}));

test("the session-start task line names them too", async () => withTemp("start", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  const { file } = startTask(p, env, "Hand edited at start");
  setCheckpoints(file, "Did the first half by hand.\n");
  const started = hook(p, "session-start", { session_id: "s1" }, env);
  assert.equal(started.code, 0, started.all);
  assert.match(started.out, /^- Current task: .*\(in-progress, 0 checkpoint\(s\)\)/m);
  assert.match(started.out, new RegExp(`^- Task checkpoints \\(needs attention\\): ${UNREAD(1).source}`, "m"));
}));

test("the count: text before the first heading and stray lines under a heading; bullets and continuations are read", () => {
  const record = (checkpoints) => [
    "# Task: T", "", "- **ID:** 2026-09-24-t-abcd", "- **State:** in-progress", "- **Branch:** main", "- **Owner:** unassigned",
    "- **Updated:** 2026-09-24T10:00:00.000Z", "", "## Checkpoints", "", ...checkpoints, "", "## Handoff", "",
  ].join("\n");
  const written = ["### 2026-09-24T10:00:00.000Z", "", "- **State:** s", "- **Evidence:** e", "  continued evidence", "- **Next:** n", "- **Git:** main @ abc, 0 uncommitted"];
  assert.equal(parseTask(record(written), "t").unreadCheckpointLines, 0);
  assert.equal(parseTask(record([]), "t").unreadCheckpointLines, 0);
  assert.equal(parseTask(record(["a note by hand", "", ...written]), "t").unreadCheckpointLines, 1);
  assert.equal(parseTask(record([...written, "- also fixed the header"]), "t").unreadCheckpointLines, 1);
  const parsed = parseTask(record(["- **State:** outside any heading", ...written]), "t");
  assert.equal(parsed.unreadCheckpointLines, 1, "a State bullet before any heading belongs to no checkpoint");
  assert.equal(parsed.checkpoints, 1);
});

// ---------------------------------------------------------------- N37: closing a task refreshes the tasks index

test("task close --apply on an integration branch refreshes the open-task index, on one line", async () => withTemp("close", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  const kept = startTask(p, env, "Still open");
  const closed = startTask(p, env, "Finished");
  commit(p, env, "tasks");
  const r = cli(p, ["task", "close", closed.id, "--state", "done-local", "--apply"], env);
  assert.equal(r.code, 0, r.all);
  const lines = r.out.split("\n").filter((l) => /tasks index/.test(l));
  assert.deepEqual(lines, ["task close: tasks index refreshed in docs/STATUS.md (1 open task(s) of 2)"]);
  const status = readFileSync(join(p, "docs", "STATUS.md"), "utf8");
  assert.match(status, /<!-- skilliton:index:tasks:start -->/);
  assert.ok(status.includes(kept.id), "the open task is listed");
  assert.ok(!status.includes(closed.id), "the closed task is not");
  const again = regenerateIndexes(loadProject(p), { kinds: ["tasks"] }).sections[0];
  assert.equal(again.changed, false, "the index writer agrees there is nothing left to change");
}));

test("task close --apply off an integration branch says the index was not refreshed, and the close stands", async () => withTemp("close-branch", async ({ dir, env }) => {
  const p = preparedRepo(join(dir, "p"), env);
  git(p, ["checkout", "-q", "-b", "feature"], env);
  const t = startTask(p, env, "On a branch");
  const before = readFileSync(join(p, "docs", "STATUS.md"), "utf8");
  const r = cli(p, ["task", "close", t.id, "--state", "done-local", "--apply"], env);
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /^task close: tasks index not refreshed; indexes are written on an integration branch \(main, master\), and this branch is feature$/m);
  assert.equal(readFileSync(join(p, "docs", "STATUS.md"), "utf8"), before);
  assert.match(readFileSync(t.file, "utf8"), /^- \*\*State:\*\* done-local$/m);
}));
