#!/usr/bin/env node
// index-churn.test.mjs: a checkpoint that changes nothing the tasks table shows must not rewrite docs/STATUS.md
// (packs/base/plugins/workflow/runtime/lib/records.mjs readEntries, lib/project-files.mjs renderIndexSection).
//
// Measured against a fixture before this was fixed: two checkpoints on one task changed the index's Updated column
// between them even though the task's ID, Title, State, Branch and Owner never moved, so a checkpoint that merely
// records progress rewrote docs/STATUS.md every time (docs/decisions/2026-09-19-records-are-written-at-checkpoint-time-m-554d.md
// says checkpoints write the indexes; it does not say every checkpoint must change their bytes). The Updated column
// is gone from the table now; the task record itself still keeps its own Updated line.
//
// Commands run the way a person runs them (node scripts/skilliton.mjs ...) in a temporary Git repository.
//
//   node --test scripts/index-churn.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "skilliton.mjs");

const BASE_ENV = (() => {
  const env = {
    ...process.env, SKILLITON_SELF: "skilliton", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Skilliton Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Skilliton Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  delete env.SKILLITON_DEBUG;
  return env;
})();

const git = (ctx, ...args) => execFileSync("git", ["-C", ctx.dir, ...args], { env: BASE_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const commit = (ctx, message) => { git(ctx, "add", "-A"); git(ctx, "commit", "-q", "-m", message); };

function fixture(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), "skilliton-index-churn-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ctx = { base, dir: join(base, "repo"), home: join(base, "home") };
  for (const d of [ctx.dir, ctx.home]) mkdirSync(d);
  git(ctx, "init", "-q", "-b", "main");
  return ctx;
}

function sg(ctx, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: ctx.dir, env: { ...BASE_ENV, HOME: ctx.home }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, all: `${r.stdout}${r.stderr}` };
}

const status = (ctx) => readFileSync(join(ctx.dir, "docs", "STATUS.md"), "utf8");

test("two checkpoints on one task leave docs/STATUS.md byte-identical after the first, and a state change still updates it", (t) => {
  const ctx = fixture(t);
  const prepared = sg(ctx, ["prepare", "--apply"]);
  assert.equal(prepared.code, 0, prepared.all);
  commit(ctx, "prepared");

  const started = sg(ctx, ["task", "start", "Steady task", "--branch", "main", "--apply"]);
  assert.equal(started.code, 0, started.all);
  const id = /created \S+\/([^/\s]+)\.md/.exec(started.out)[1];
  commit(ctx, "task started");

  // The first checkpoint adds the task to a table that had none ("No open tasks."): the index must write.
  const first = sg(ctx, ["checkpoint", "--state", "one", "--evidence", "e1", "--next", "n1", "--apply"]);
  assert.equal(first.code, 0, first.all);
  assert.match(first.out, /^indexes: written docs\/STATUS\.md \(tasks index: 1 open task\(s\) of 1\)$/m);
  const afterFirst = status(ctx);
  assert.ok(afterFirst.includes(`| [${id}](tasks/${id}.md) | Steady task | in-progress | main | unassigned |`), afterFirst);
  commit(ctx, "checkpoint one");

  // The second checkpoint changes the task's own Updated line, its Handoff section, and adds a checkpoint entry:
  // none of that is a column of the tasks table (ID, Title, State, Branch, Owner), so the index must not move at all.
  const second = sg(ctx, ["checkpoint", "--state", "two", "--evidence", "e2", "--next", "n2", "--apply"]);
  assert.equal(second.code, 0, second.all);
  assert.match(second.out, /^indexes: every index is current; nothing to write$/m);
  assert.equal(status(ctx), afterFirst, "docs/STATUS.md must be byte-identical after a checkpoint that changes nothing the table shows");

  // A third checkpoint, same story: still nothing to write.
  const third = sg(ctx, ["checkpoint", "--state", "three", "--evidence", "e3", "--next", "n3", "--apply"]);
  assert.equal(third.code, 0, third.all);
  assert.match(third.out, /^indexes: every index is current; nothing to write$/m);
  assert.equal(status(ctx), afterFirst);

  // Closing the task changes its State (and drops it from the open list), which the table does show: a real state
  // change is not churn, and the index command run after it must rewrite the record.
  const closed = sg(ctx, ["task", "close", id, "--state", "done-local", "--apply"]);
  assert.equal(closed.code, 0, closed.all);
  const indexRun = sg(ctx, ["index", "--apply"]);
  assert.equal(indexRun.code, 0, indexRun.all);
  const afterClose = status(ctx);
  assert.notEqual(afterClose, afterFirst, "closing the task must update the index: a state change is not churn");
  assert.ok(!afterClose.includes(id), "a closed task is no longer listed as open");
});

test("this test file holds no forbidden dash characters or home paths", () => {
  const text = readFileSync(fileURLToPath(import.meta.url), "utf8");
  assert.equal(text.includes(String.fromCharCode(0x2014)) || text.includes(String.fromCharCode(0x2013)), false);
  assert.equal(new RegExp(["/Us", "ers/[A-Za-z0-9._-]+/|/ho", "me/[A-Za-z0-9._-]+/"].join("")).test(text), false);
});
